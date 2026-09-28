"""Playlist Vault web app: routes and page handling."""

import json
import secrets
import sqlite3
import time
import uuid
from datetime import datetime
from pathlib import Path

import anthropic
import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from . import db, research, tidal, vault
from .config import Settings, load_settings
from .security import hash_password, verify_password

HERE = Path(__file__).resolve().parent


def create_app(settings: Settings | None = None, http: httpx.Client | None = None,
               claude: anthropic.Anthropic | None = None) -> FastAPI:
    settings = settings or load_settings()
    http = http or httpx.Client(timeout=30)
    db.init(settings.db_path)

    app = FastAPI(title="Playlist Vault", docs_url=None, redoc_url=None)
    app.add_middleware(SessionMiddleware, secret_key=settings.secret_key,
                       same_site="lax", https_only=settings.base_url.startswith("https"))
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
    templates = Jinja2Templates(directory=HERE / "templates")

    # ------------------------------------------------------------ helpers

    def get_conn():
        conn = db.connect(settings.db_path)
        try:
            yield conn
        finally:
            conn.close()

    def current_user(request: Request, conn: sqlite3.Connection) -> sqlite3.Row | None:
        uid = request.session.get("user_id")
        return conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone() if uid else None

    def require_user(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> sqlite3.Row:
        user = current_user(request, conn)
        if user is None:
            raise HTTPException(status_code=303, headers={"Location": "/login"})
        return user

    def flash(request: Request, message: str, kind: str = "info") -> None:
        request.session.setdefault("flash", []).append({"kind": kind, "text": message})

    def redirect(url: str) -> RedirectResponse:
        return RedirectResponse(url, status_code=303)

    def render(request: Request, name: str, user=None, **context) -> HTMLResponse:
        messages = request.session.pop("flash", [])
        return templates.TemplateResponse(request, name, {"user": user, "messages": messages, **context})

    def tidal_account(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
        return conn.execute("SELECT * FROM tidal_accounts WHERE user_id = ?", (user_id,)).fetchone()

    def tidal_api(conn: sqlite3.Connection, user_id: int) -> tidal.TidalAPI | None:
        """A TIDAL client for this user, refreshing the login token when it has expired."""
        acct = tidal_account(conn, user_id)
        if acct is None:
            return None
        token = acct["access_token"]
        if acct["expires_at"] < time.time():
            if not acct["refresh_token"]:
                return None
            fresh = tidal.refresh(http, settings.tidal_client_id, settings.tidal_client_secret,
                                  acct["refresh_token"])
            conn.execute("UPDATE tidal_accounts SET access_token = ?, refresh_token = ?, expires_at = ?"
                         " WHERE user_id = ?", (fresh.access_token, fresh.refresh_token,
                                                fresh.expires_at, user_id))
            conn.commit()
            token = fresh.access_token
        return tidal.TidalAPI(http, token, acct["country"])

    def require_tidal(request: Request, conn: sqlite3.Connection, user) -> tidal.TidalAPI | None:
        try:
            api = tidal_api(conn, user["id"])
        except tidal.TidalError:
            api = None
        if api is None:
            flash(request, "Connect your TIDAL account first (or reconnect it if the login expired).", "error")
        return api

    def claude_client() -> anthropic.Anthropic:
        nonlocal claude
        if claude is None:
            claude = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment
        return claude

    # ------------------------------------------------------------ accounts

    @app.get("/", response_class=HTMLResponse)
    def home(request: Request, conn: sqlite3.Connection = Depends(get_conn)):
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            return redirect("/setup")
        user = current_user(request, conn)
        if user is None:
            return redirect("/login")
        return render(request, "dashboard.html", user,
                      playlists=vault.list_playlists(conn, user["id"]),
                      tidal=tidal_account(conn, user["id"]),
                      tidal_configured=bool(settings.tidal_client_id))

    @app.get("/setup", response_class=HTMLResponse)
    def setup_form(request: Request, conn: sqlite3.Connection = Depends(get_conn)):
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            return redirect("/login")
        return render(request, "setup.html")

    @app.post("/setup")
    def setup(request: Request, name: str = Form(...), username: str = Form(...),
              password: str = Form(...), conn: sqlite3.Connection = Depends(get_conn)):
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            return redirect("/login")
        if len(password) < 8:
            flash(request, "Please use a password of at least 8 characters.", "error")
            return redirect("/setup")
        cur = conn.execute("INSERT INTO users (name, username, password_hash, is_admin) VALUES (?, ?, ?, 1)",
                           (name.strip(), username.strip(), hash_password(password)))
        conn.commit()
        request.session["user_id"] = cur.lastrowid
        flash(request, f"Welcome, {name}! Next step: connect your TIDAL account.")
        return redirect("/")

    @app.get("/login", response_class=HTMLResponse)
    def login_form(request: Request):
        return render(request, "login.html")

    @app.post("/login")
    def login(request: Request, username: str = Form(...), password: str = Form(...),
              conn: sqlite3.Connection = Depends(get_conn)):
        user = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
        if user is None or not verify_password(password, user["password_hash"]):
            flash(request, "Wrong username or password.", "error")
            return redirect("/login")
        request.session.clear()
        request.session["user_id"] = user["id"]
        return redirect("/")

    @app.post("/logout")
    def logout(request: Request):
        request.session.clear()
        return redirect("/login")

    @app.get("/family", response_class=HTMLResponse)
    def family(request: Request, user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        members = conn.execute(
            "SELECT u.*, t.username AS tidal_username FROM users u"
            " LEFT JOIN tidal_accounts t ON t.user_id = u.id ORDER BY u.id").fetchall()
        return render(request, "family.html", user, members=members)

    @app.post("/family")
    def add_member(request: Request, name: str = Form(...), username: str = Form(...),
                   password: str = Form(...), user=Depends(require_user),
                   conn: sqlite3.Connection = Depends(get_conn)):
        if not user["is_admin"]:
            raise HTTPException(403, "Only the family admin can add members.")
        if len(password) < 8:
            flash(request, "Please use a password of at least 8 characters.", "error")
            return redirect("/family")
        try:
            conn.execute("INSERT INTO users (name, username, password_hash) VALUES (?, ?, ?)",
                         (name.strip(), username.strip(), hash_password(password)))
            conn.commit()
            flash(request, f"Added {name}. They can now log in with the username \"{username}\".")
        except sqlite3.IntegrityError:
            flash(request, f"The username \"{username}\" is already taken.", "error")
        return redirect("/family")

    @app.post("/family/{member_id}/delete")
    def remove_member(request: Request, member_id: int, user=Depends(require_user),
                      conn: sqlite3.Connection = Depends(get_conn)):
        if not user["is_admin"] or member_id == user["id"]:
            raise HTTPException(403, "Not allowed.")
        conn.execute("DELETE FROM users WHERE id = ?", (member_id,))
        conn.commit()
        flash(request, "Member removed, together with their vault.")
        return redirect("/family")

    @app.post("/account/password")
    def change_password(request: Request, current: str = Form(...), new: str = Form(...),
                        user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        if not verify_password(current, user["password_hash"]):
            flash(request, "Your current password was not correct.", "error")
        elif len(new) < 8:
            flash(request, "Please use a password of at least 8 characters.", "error")
        else:
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new), user["id"]))
            conn.commit()
            flash(request, "Password changed.")
        return redirect("/family")

    # ------------------------------------------------------------ TIDAL login

    @app.get("/tidal/connect")
    def tidal_connect(request: Request, user=Depends(require_user)):
        if not settings.tidal_client_id:
            flash(request, "TIDAL_CLIENT_ID is not set. See the README, step 2.", "error")
            return redirect("/")
        verifier, challenge = tidal.new_pkce_pair()
        state = secrets.token_urlsafe(24)
        request.session["tidal_pkce"] = {"verifier": verifier, "state": state}
        return RedirectResponse(tidal.authorize_url(settings.tidal_client_id, settings.tidal_redirect_uri,
                                                    challenge, state), status_code=303)

    @app.get("/tidal/callback")
    def tidal_callback(request: Request, code: str = "", state: str = "", error: str = "",
                       user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        pkce = request.session.pop("tidal_pkce", None)
        if error or not code or not pkce or not secrets.compare_digest(state, pkce["state"]):
            flash(request, f"TIDAL login was cancelled or failed. {error}".strip(), "error")
            return redirect("/")
        try:
            tokens = tidal.exchange_code(http, settings.tidal_client_id, settings.tidal_client_secret,
                                         code, pkce["verifier"], settings.tidal_redirect_uri)
            me = tidal.TidalAPI(http, tokens.access_token, settings.default_country).me()
        except tidal.TidalError as exc:
            flash(request, str(exc), "error")
            return redirect("/")
        conn.execute(
            "INSERT INTO tidal_accounts (user_id, tidal_user_id, username, country, access_token,"
            " refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
            " ON CONFLICT (user_id) DO UPDATE SET tidal_user_id = excluded.tidal_user_id,"
            " username = excluded.username, country = excluded.country,"
            " access_token = excluded.access_token, refresh_token = excluded.refresh_token,"
            " expires_at = excluded.expires_at",
            (user["id"], me["id"] or tokens.tidal_user_id, me["username"],
             me["country"] or settings.default_country, tokens.access_token, tokens.refresh_token,
             tokens.expires_at))
        conn.commit()
        flash(request, "TIDAL connected. Press \"Back up TIDAL now\" to save your playlists.")
        return redirect("/")

    @app.post("/tidal/disconnect")
    def tidal_disconnect(request: Request, user=Depends(require_user),
                         conn: sqlite3.Connection = Depends(get_conn)):
        conn.execute("DELETE FROM tidal_accounts WHERE user_id = ?", (user["id"],))
        conn.commit()
        flash(request, "TIDAL disconnected. Your saved playlists stay in the vault.")
        return redirect("/")

    # ------------------------------------------------------------ backup & restore

    @app.post("/backup")
    def backup(request: Request, user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        api = require_tidal(request, conn, user)
        if api is None:
            return redirect("/")
        try:
            s = vault.backup_tidal(conn, user["id"], api)
        except tidal.TidalError as exc:
            flash(request, f"Backup stopped: {exc}", "error")
            return redirect("/")
        flash(request, f"Backup done: {s['playlists']} playlists, {s['tracks']} tracks. "
                       f"{s['new_snapshots']} new or changed, {s['unchanged']} unchanged.")
        return redirect("/")

    @app.get("/playlists/{playlist_id}", response_class=HTMLResponse)
    def playlist_page(request: Request, playlist_id: int, snapshot: int | None = None,
                      user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        pl = vault.get_playlist(conn, user["id"], playlist_id)
        if pl is None:
            raise HTTPException(404, "Playlist not found")
        snaps = vault.playlist_snapshots(conn, playlist_id)
        current = next((s for s in snaps if s["id"] == snapshot), snaps[0] if snaps else None)
        tracks = vault.snapshot_tracks(conn, current["id"]) if current else []
        return render(request, "playlist.html", user, playlist=pl, snapshots=snaps, snapshot=current,
                      tracks=tracks, tidal=tidal_account(conn, user["id"]),
                      unmatched=sum(1 for t in tracks if not t["tidal_id"]))

    @app.post("/snapshots/{snapshot_id}/restore")
    def restore(request: Request, snapshot_id: int, name: str = Form(...),
                user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        snap = vault.get_snapshot(conn, user["id"], snapshot_id)
        if snap is None:
            raise HTTPException(404, "Snapshot not found")
        back = f"/playlists/{snap['playlist_id']}?snapshot={snapshot_id}"
        api = require_tidal(request, conn, user)
        if api is None:
            return redirect(back)
        try:
            result = vault.restore_to_tidal(conn, user["id"], snapshot_id, api, name.strip() or snap["name"])
        except tidal.TidalError as exc:
            flash(request, f"Could not write to TIDAL: {exc}", "error")
            return redirect(back)
        msg = f"Created \"{name}\" on TIDAL with {result['added']} tracks."
        if result["missing"]:
            msg += f" {len(result['missing'])} could not be found on TIDAL: " + "; ".join(result["missing"][:10])
        flash(request, msg, "error" if result["missing"] else "info")
        return redirect(back)

    @app.get("/snapshots/{snapshot_id}.csv")
    def snapshot_csv(snapshot_id: int, user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        snap = vault.get_snapshot(conn, user["id"], snapshot_id)
        if snap is None:
            raise HTTPException(404, "Snapshot not found")
        filename = "".join(c for c in snap["name"] if c.isalnum() or c in " -_").strip() or "playlist"
        return Response(vault.snapshot_csv(conn, snapshot_id), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'})

    @app.post("/playlists/{playlist_id}/delete")
    def delete_playlist(request: Request, playlist_id: int, user=Depends(require_user),
                        conn: sqlite3.Connection = Depends(get_conn)):
        vault.delete_playlist(conn, user["id"], playlist_id)
        flash(request, "Removed from the vault. (Nothing was changed on TIDAL.)")
        return redirect("/")

    @app.get("/export")
    def export(user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        data = json.dumps(vault.export_all(conn, user["id"]), indent=2, ensure_ascii=False)
        stamp = datetime.now().strftime("%Y-%m-%d")
        return Response(data, media_type="application/json", headers={
            "Content-Disposition": f'attachment; filename="playlist-vault-{user["username"]}-{stamp}.json"'})

    @app.post("/import")
    async def import_file(request: Request, file: UploadFile = File(...), user=Depends(require_user),
                          conn: sqlite3.Connection = Depends(get_conn)):
        try:
            result = vault.import_backup(conn, user["id"], json.loads(await file.read()))
            flash(request, f"Imported {result['added']} snapshots ({result['skipped']} were already here).")
        except (ValueError, KeyError, TypeError) as exc:
            flash(request, f"Could not read that file: {exc}", "error")
        return redirect("/")

    # ------------------------------------------------------------ Claude research

    def save_draft(conn, user_id: int, source_id: str, draft: research.Draft, prompt: str,
                   api: tidal.TidalAPI | None) -> int:
        track_ids, notes = [], []
        for s in draft.tracks:
            match = api.best_match(s.title, s.artist) if api else None
            track = match or tidal.Track(tidal_id="", title=s.title, artist=s.artist, album=s.album)
            track_ids.append(vault.upsert_track(conn, track))
            notes.append(f"{s.year} · {s.why}")
        vault.save_snapshot(conn, user_id, "claude", source_id, draft.title, draft.description,
                            track_ids, note=prompt, track_notes=notes)
        conn.commit()
        return conn.execute("SELECT id FROM playlists WHERE user_id = ? AND source = 'claude' AND source_id = ?",
                            (user_id, source_id)).fetchone()["id"]

    def run_research(request: Request, conn, user, prompt: str, count: int, use_taste: bool,
                     previous: research.Draft | None, source_id: str) -> int | None:
        taste = vault.taste_profile(conn, user["id"]) if use_taste else None
        request_text = research.build_request(prompt, max(5, min(count, 60)), taste, previous)
        try:
            draft = research.ask_claude(claude_client(), settings.claude_model, request_text)
            api = tidal_api(conn, user["id"])
            return save_draft(conn, user["id"], source_id, draft, prompt, api)
        except research.ResearchError as exc:
            flash(request, str(exc), "error")
        except anthropic.AuthenticationError:
            flash(request, "Claude API key missing or invalid. See the README, step 3.", "error")
        except anthropic.APIError as exc:
            flash(request, f"Claude is unavailable right now: {exc}", "error")
        except tidal.TidalError as exc:
            flash(request, f"TIDAL lookup failed: {exc}", "error")
        return None

    @app.get("/research", response_class=HTMLResponse)
    def research_form(request: Request, user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        drafts = [p for p in vault.list_playlists(conn, user["id"]) if p["source"] == "claude"]
        return render(request, "research.html", user, drafts=drafts, tidal=tidal_account(conn, user["id"]))

    @app.post("/research")
    def research_new(request: Request, prompt: str = Form(...), count: int = Form(25),
                     use_taste: bool = Form(False), user=Depends(require_user),
                     conn: sqlite3.Connection = Depends(get_conn)):
        playlist_id = run_research(request, conn, user, prompt, count, use_taste, None, uuid.uuid4().hex)
        return redirect(f"/playlists/{playlist_id}" if playlist_id else "/research")

    @app.post("/playlists/{playlist_id}/refine")
    def research_refine(request: Request, playlist_id: int, prompt: str = Form(...), count: int = Form(25),
                        user=Depends(require_user), conn: sqlite3.Connection = Depends(get_conn)):
        pl = vault.get_playlist(conn, user["id"], playlist_id)
        if pl is None or pl["source"] != "claude":
            raise HTTPException(404, "Draft not found")
        latest = vault.playlist_snapshots(conn, playlist_id)[0]
        previous = research.Draft(latest["name"], latest["description"], [
            research.Suggestion(t["title"], t["artist"], t["album"], 0, "")
            for t in vault.snapshot_tracks(conn, latest["id"])])
        run_research(request, conn, user, prompt, count, False, previous, pl["source_id"])
        return redirect(f"/playlists/{playlist_id}")

    return app

