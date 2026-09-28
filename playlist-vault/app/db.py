"""SQLite storage. One file (data/vault.db) holds every family member's vault.

Tracks are stored once and shared by all snapshots. A snapshot is a frozen copy
of a playlist at one moment; restoring means pushing a snapshot back to a service.
"""

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tidal_accounts (
    user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tidal_user_id  TEXT,
    username       TEXT,
    country        TEXT NOT NULL,
    access_token   TEXT NOT NULL,
    refresh_token  TEXT,
    expires_at     REAL NOT NULL
);

-- One row per recording. isrc (International Standard Recording Code) is the
-- key that will let us match the same song on Apple Music later.
CREATE TABLE IF NOT EXISTS tracks (
    id          INTEGER PRIMARY KEY,
    tidal_id    TEXT UNIQUE,
    isrc        TEXT,
    title       TEXT NOT NULL,
    artist      TEXT NOT NULL DEFAULT '',
    album       TEXT NOT NULL DEFAULT '',
    duration_s  INTEGER
);
CREATE INDEX IF NOT EXISTS tracks_isrc ON tracks(isrc);

-- source: 'tidal' (backed up from Tidal) or 'claude' (built with Claude)
CREATE TABLE IF NOT EXISTS playlists (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source      TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
    id           INTEGER PRIMARY KEY,
    playlist_id  INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    taken_at     TEXT NOT NULL DEFAULT (datetime('now')),
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    fingerprint  TEXT NOT NULL,
    note         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS snapshot_tracks (
    snapshot_id  INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    track_id     INTEGER NOT NULL REFERENCES tracks(id),
    note         TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (snapshot_id, position)
);
"""


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init(path: Path) -> None:
    with connect(path) as conn:
        conn.executescript(SCHEMA)
