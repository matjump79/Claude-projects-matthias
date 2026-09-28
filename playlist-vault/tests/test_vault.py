import time

import httpx

from app import db, tidal, vault
from app.tidal import TidalAPI


def make_conn(tmp_path):
    db.init(tmp_path / "v.db")
    conn = db.connect(tmp_path / "v.db")
    conn.execute("INSERT INTO users (id, name, username, password_hash) VALUES (1, 'M', 'm', 'x')")
    return conn


def test_restore_finds_tracks_by_isrc_or_search_when_ids_are_missing(tmp_path, fake_tidal):
    conn = make_conn(tmp_path)
    # e.g. a backup file edited by hand, or tracks TIDAL has since re-issued
    vault.import_backup(conn, 1, {"format": "playlist-vault/1", "playlists": [{
        "source": "tidal", "source_id": "old", "name": "Old list", "snapshots": [{
            "taken_at": "2026-01-01 10:00:00", "name": "Old list", "tracks": [
                {"title": "Autobahn", "artist": "Kraftwerk", "isrc": "DEA222"},
                {"title": "Hallogallo", "artist": "NEU!"},
                {"title": "Lost Song", "artist": "Nobody"},
            ]}]}]})
    snapshot_id = conn.execute("SELECT id FROM snapshots").fetchone()["id"]
    api = TidalAPI(httpx.Client(transport=httpx.MockTransport(fake_tidal.handler)), "tok", "US")

    result = vault.restore_to_tidal(conn, 1, snapshot_id, api, "Old list")

    assert result["added"] == 2
    assert result["missing"] == ["Lost Song — Nobody"]
    assert fake_tidal.created["new-1"]["items"] == ["2", "1"]
    # matches are remembered for next time
    assert conn.execute("SELECT tidal_id FROM tracks WHERE title = 'Hallogallo'").fetchone()[0] == "1"


def test_snapshots_of_other_users_are_invisible(tmp_path):
    conn = make_conn(tmp_path)
    conn.execute("INSERT INTO users (id, name, username, password_hash) VALUES (2, 'E', 'e', 'x')")
    tid = vault.upsert_track(conn, tidal.Track(tidal_id="9", title="Song", artist="A"))
    sid, created = vault.save_snapshot(conn, 1, "tidal", "p", "Mine", "", [tid])
    assert created
    assert vault.get_snapshot(conn, 1, sid) is not None
    assert vault.get_snapshot(conn, 2, sid) is None


def test_expired_login_is_refreshed(client, fake_tidal, settings):
    from conftest import connect_tidal, sign_up
    sign_up(client)
    connect_tidal(client)
    conn = db.connect(settings.db_path)
    conn.execute("UPDATE tidal_accounts SET access_token = 'old', expires_at = ?", (time.time() - 10,))
    conn.commit()
    assert "Backup done" in client.post("/backup").text
    assert conn.execute("SELECT access_token FROM tidal_accounts").fetchone()[0] == "tok"
    assert sum("oauth2/token" in c for c in fake_tidal.calls) == 2  # login + refresh


def test_iso_durations():
    assert tidal._iso_duration_to_seconds("PT2M58S") == 178
    assert tidal._iso_duration_to_seconds("PT1H2M3S") == 3723
    assert tidal._iso_duration_to_seconds(None) is None
