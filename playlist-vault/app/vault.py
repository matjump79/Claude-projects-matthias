"""The vault: taking snapshots, exporting/importing backup files, restoring to TIDAL."""

import csv
import hashlib
import io
import json
import sqlite3
from datetime import datetime, timezone

from .tidal import TidalAPI, Track

EXPORT_FORMAT = "playlist-vault/1"


# ---------------------------------------------------------------- tracks

def upsert_track(conn: sqlite3.Connection, t: Track) -> int:
    if t.tidal_id:
        row = conn.execute("SELECT id FROM tracks WHERE tidal_id = ?", (t.tidal_id,)).fetchone()
        if row:
            conn.execute(
                "UPDATE tracks SET isrc = COALESCE(?, isrc), title = ?, artist = ?, album = ?,"
                " duration_s = COALESCE(?, duration_s) WHERE id = ?",
                (t.isrc, t.title, t.artist, t.album, t.duration_s, row["id"]))
            return row["id"]
    else:
        row = conn.execute(
            "SELECT id FROM tracks WHERE tidal_id IS NULL AND title = ? AND artist = ?"
            " AND COALESCE(isrc, '') = COALESCE(?, '')",
            (t.title, t.artist, t.isrc)).fetchone()
        if row:
            return row["id"]
    cur = conn.execute(
        "INSERT INTO tracks (tidal_id, isrc, title, artist, album, duration_s) VALUES (?, ?, ?, ?, ?, ?)",
        (t.tidal_id or None, t.isrc, t.title, t.artist, t.album, t.duration_s))
    return cur.lastrowid


def _fingerprint(name: str, description: str, track_ids: list[int]) -> str:
    return hashlib.sha256(json.dumps([name, description, track_ids]).encode()).hexdigest()


# ---------------------------------------------------------------- snapshots

def save_snapshot(conn: sqlite3.Connection, user_id: int, source: str, source_id: str,
                  name: str, description: str, track_ids: list[int], note: str = "",
                  taken_at: str | None = None, track_notes: list[str] | None = None) -> tuple[int, bool]:
    """Store a snapshot unless it is identical to one we already have.
    track_notes holds an optional comment per track (e.g. why Claude picked it).
    Returns (snapshot_id, created)."""
    conn.execute(
        "INSERT INTO playlists (user_id, source, source_id, name, description) VALUES (?, ?, ?, ?, ?)"
        " ON CONFLICT (user_id, source, source_id) DO UPDATE SET name = excluded.name,"
        " description = excluded.description",
        (user_id, source, source_id, name, description))
    playlist_id = conn.execute(
        "SELECT id FROM playlists WHERE user_id = ? AND source = ? AND source_id = ?",
        (user_id, source, source_id)).fetchone()["id"]

    fp = _fingerprint(name, description, track_ids)
    existing = conn.execute(
        "SELECT id FROM snapshots WHERE playlist_id = ? AND fingerprint = ? ORDER BY id DESC LIMIT 1",
        (playlist_id, fp)).fetchone()
    latest = conn.execute(
        "SELECT id, fingerprint FROM snapshots WHERE playlist_id = ? ORDER BY taken_at DESC, id DESC LIMIT 1",
        (playlist_id,)).fetchone()
    if latest and latest["fingerprint"] == fp:
        return latest["id"], False
    if existing and taken_at:  # importing a snapshot we already hold
        return existing["id"], False

    cur = conn.execute(
        "INSERT INTO snapshots (playlist_id, name, description, fingerprint, note, taken_at)"
        " VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))",
        (playlist_id, name, description, fp, note, taken_at))
    notes = track_notes or [""] * len(track_ids)
    conn.executemany(
        "INSERT INTO snapshot_tracks (snapshot_id, position, track_id, note) VALUES (?, ?, ?, ?)",
        [(cur.lastrowid, pos, tid, n) for pos, (tid, n) in enumerate(zip(track_ids, notes))])
    return cur.lastrowid, True


def backup_tidal(conn: sqlite3.Connection, user_id: int, api: TidalAPI) -> dict:
    """Snapshot every playlist the user owns on TIDAL. Unchanged playlists are skipped."""
    summary = {"playlists": 0, "new_snapshots": 0, "unchanged": 0, "tracks": 0}
    for pl in api.my_playlists():
        ids = api.playlist_track_ids(pl["id"])
        details = api.tracks(ids)
        db_ids = [upsert_track(conn, details.get(tid) or Track(tidal_id=tid, title=f"TIDAL track {tid}"))
                  for tid in ids]
        _, created = save_snapshot(conn, user_id, "tidal", pl["id"], pl["name"], pl["description"], db_ids)
        conn.commit()
        summary["playlists"] += 1
        summary["tracks"] += len(ids)
        summary["new_snapshots" if created else "unchanged"] += 1
    return summary


def list_playlists(conn: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT p.id, p.source, p.name, p.description,
               s.id AS snapshot_id, s.taken_at,
               (SELECT COUNT(*) FROM snapshot_tracks st WHERE st.snapshot_id = s.id) AS track_count,
               (SELECT COUNT(*) FROM snapshots s2 WHERE s2.playlist_id = p.id) AS snapshot_count
        FROM playlists p
        JOIN snapshots s ON s.id = (SELECT id FROM snapshots WHERE playlist_id = p.id
                                    ORDER BY taken_at DESC, id DESC LIMIT 1)
        WHERE p.user_id = ?
        ORDER BY p.source, p.name COLLATE NOCASE
        """, (user_id,)).fetchall()


def get_playlist(conn: sqlite3.Connection, user_id: int, playlist_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM playlists WHERE id = ? AND user_id = ?",
                        (playlist_id, user_id)).fetchone()


def playlist_snapshots(conn: sqlite3.Connection, playlist_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT s.*, (SELECT COUNT(*) FROM snapshot_tracks st WHERE st.snapshot_id = s.id) AS track_count"
        " FROM snapshots s WHERE playlist_id = ? ORDER BY taken_at DESC, id DESC", (playlist_id,)).fetchall()


def get_snapshot(conn: sqlite3.Connection, user_id: int, snapshot_id: int) -> sqlite3.Row | None:
    """Snapshot row, only if it belongs to this user."""
    return conn.execute(
        "SELECT s.*, p.source, p.source_id, p.id AS playlist_id FROM snapshots s"
        " JOIN playlists p ON p.id = s.playlist_id WHERE s.id = ? AND p.user_id = ?",
        (snapshot_id, user_id)).fetchone()


def snapshot_tracks(conn: sqlite3.Connection, snapshot_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT st.position, st.note, t.* FROM snapshot_tracks st JOIN tracks t ON t.id = st.track_id"
        " WHERE st.snapshot_id = ? ORDER BY st.position", (snapshot_id,)).fetchall()


def delete_playlist(conn: sqlite3.Connection, user_id: int, playlist_id: int) -> None:
    conn.execute("DELETE FROM playlists WHERE id = ? AND user_id = ?", (playlist_id, user_id))
    conn.commit()


# ---------------------------------------------------------------- restore

def restore_to_tidal(conn: sqlite3.Connection, user_id: int, snapshot_id: int,
                     api: TidalAPI, name: str) -> dict:
    """Create a new TIDAL playlist from a snapshot.

    Tracks are found by TIDAL id first, then by ISRC, then by title + artist
    search, so snapshots made from other sources (or old, since-moved tracks)
    can still be restored. Nothing on TIDAL is overwritten or deleted.
    """
    snap = get_snapshot(conn, user_id, snapshot_id)
    if snap is None:
        raise LookupError("Snapshot not found")
    rows = snapshot_tracks(conn, snapshot_id)

    tidal_ids, missing = [], []
    for row in rows:
        tid = row["tidal_id"]
        if not tid:
            match = (api.find_by_isrc(row["isrc"]) if row["isrc"] else None) \
                or api.best_match(row["title"], row["artist"])
            if match:
                tid = match.tidal_id
                conn.execute("UPDATE tracks SET tidal_id = ?, isrc = COALESCE(isrc, ?) WHERE id = ?"
                             " AND NOT EXISTS (SELECT 1 FROM tracks WHERE tidal_id = ?)",
                             (tid, match.isrc, row["id"], tid))
        if tid:
            tidal_ids.append(tid)
        else:
            missing.append(f"{row['title']} — {row['artist']}")
    conn.commit()

    playlist_id = api.create_playlist(name, snap["description"])
    api.add_tracks(playlist_id, tidal_ids)
    return {"tidal_playlist_id": playlist_id, "added": len(tidal_ids), "missing": missing}


# ---------------------------------------------------------------- files

def export_all(conn: sqlite3.Connection, user_id: int) -> dict:
    """Everything in this user's vault as one JSON-ready dict (all snapshot history)."""
    out = {"format": EXPORT_FORMAT, "exported_at": datetime.now(timezone.utc).isoformat(), "playlists": []}
    for pl in conn.execute("SELECT * FROM playlists WHERE user_id = ? ORDER BY id", (user_id,)):
        snaps = []
        for s in conn.execute("SELECT * FROM snapshots WHERE playlist_id = ? ORDER BY taken_at, id", (pl["id"],)):
            snaps.append({
                "taken_at": s["taken_at"], "name": s["name"], "description": s["description"],
                "note": s["note"],
                "tracks": [{k: r[k] for k in ("title", "artist", "album", "isrc", "tidal_id", "duration_s", "note")}
                           for r in snapshot_tracks(conn, s["id"])],
            })
        out["playlists"].append({"source": pl["source"], "source_id": pl["source_id"],
                                 "name": pl["name"], "snapshots": snaps})
    return out


def import_backup(conn: sqlite3.Connection, user_id: int, data: dict) -> dict:
    """Load a file made by export_all. Snapshots already in the vault are skipped."""
    if data.get("format") != EXPORT_FORMAT:
        raise ValueError("This is not a Playlist Vault backup file.")
    added = skipped = 0
    for pl in data.get("playlists", []):
        for s in pl.get("snapshots", []):
            ids = [upsert_track(conn, Track(
                tidal_id=t.get("tidal_id") or "", title=t.get("title") or "Unknown",
                artist=t.get("artist") or "", album=t.get("album") or "",
                isrc=t.get("isrc"), duration_s=t.get("duration_s"))) for t in s.get("tracks", [])]
            _, created = save_snapshot(conn, user_id, pl["source"], pl["source_id"], s["name"],
                                       s.get("description", ""), ids, s.get("note", ""),
                                       taken_at=s.get("taken_at"),
                                       track_notes=[t.get("note") or "" for t in s.get("tracks", [])])
            added += created
            skipped += not created
    conn.commit()
    return {"added": added, "skipped": skipped}


def snapshot_csv(conn: sqlite3.Connection, snapshot_id: int) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["#", "Title", "Artist", "Album", "ISRC", "TIDAL id", "Seconds"])
    for r in snapshot_tracks(conn, snapshot_id):
        writer.writerow([r["position"] + 1, r["title"], r["artist"], r["album"],
                         r["isrc"] or "", r["tidal_id"] or "", r["duration_s"] or ""])
    return buf.getvalue()


def taste_profile(conn: sqlite3.Connection, user_id: int, limit: int = 40) -> list[str]:
    """The artists that appear most across the user's latest TIDAL snapshots."""
    rows = conn.execute(
        """
        SELECT t.artist, COUNT(*) AS n FROM playlists p
        JOIN snapshots s ON s.id = (SELECT id FROM snapshots WHERE playlist_id = p.id
                                    ORDER BY taken_at DESC, id DESC LIMIT 1)
        JOIN snapshot_tracks st ON st.snapshot_id = s.id
        JOIN tracks t ON t.id = st.track_id
        WHERE p.user_id = ? AND p.source = 'tidal' AND t.artist != ''
        GROUP BY t.artist ORDER BY n DESC LIMIT ?
        """, (user_id, limit)).fetchall()
    return [r["artist"] for r in rows]
