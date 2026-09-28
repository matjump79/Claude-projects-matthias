# Playlist Vault

Your own private web app for:

- **Backing up** every TIDAL playlist of every family member, with dated snapshots (history)
- **Restoring** any snapshot back into TIDAL if a playlist gets lost or changed
- **Building playlists with Claude**: describe what you want in plain words, get a researched track list with a reason for each song, refine it, and save it to TIDAL

It runs on your own computer. It doesn't use any third-party playlist service (TuneMyMusic, Soundiiz and so on). It talks directly to TIDAL's official API (Application Programming Interface) and Anthropic's Claude API.

> **Status:** Phase 1 (TIDAL + Claude). Apple Music is planned for Phase 2. The database already stores each song's ISRC (International Standard Recording Code, a worldwide ID for a recording), which is what we'll use to match songs on Apple Music.

---

## Setup, step by step

You need a Mac (or any computer) with Python 3.11 or newer. On a Mac, open **Terminal** and check with `python3 --version`.

### Step 1: Get the code

```bash
git clone https://github.com/matjump79/Claude-projects-matthias.git
cd Claude-projects-matthias/playlist-vault
cp .env.example .env
```

### Step 2: Register the app with TIDAL (free)

1. Go to <https://developer.tidal.com>, log in with your TIDAL account and open **Dashboard**, then **Create new app**.
2. Name it, for example "Playlist Vault".
3. Under **Redirect URIs**, add exactly `http://localhost:8000/tidal/callback`.
4. Under **Scopes**, tick `user.read`, `playlists.read`, `playlists.write` and `collection.read`.
5. Copy the **Client ID** into `.env` as `TIDAL_CLIENT_ID=...`. If the portal also shows a Client Secret, copy that into `TIDAL_CLIENT_SECRET`.

### Step 3: Get a Claude API key

1. Go to <https://console.anthropic.com>, create an account and add a payment method.
2. Set a monthly spend limit (for example $10) under **Billing**.
3. Create an API key and put it into `.env` as `ANTHROPIC_API_KEY=...`.

Typical cost is a few cents per playlist request.

### Step 4: Start the app

```bash
./run.sh
```

The first start takes a minute while it installs its parts. Then open <http://localhost:8000>.

1. Create your account (you become the family admin).
2. Click **Connect TIDAL** and log in on TIDAL's own page.
3. Click **Back up TIDAL now**.
4. Under **Family**, add your wife and daughters. Each of them logs in and connects their own TIDAL account.

Stop the app with `Ctrl + C`.

---

## Day-to-day use

| I want to… | Do this |
|---|---|
| Save the current state of my playlists | **My vault**, then **Back up TIDAL now**. Only changed playlists get a new snapshot. |
| Get a playlist back after deleting or changing it | Open the playlist, pick the snapshot under **History**, then **Restore to TIDAL**. This always creates a *new* playlist, so nothing is overwritten. |
| Keep an off-computer copy | **Download backup file** (JSON format). Store it in iCloud Drive or on a USB stick. **Load backup file** brings it back. |
| Open a playlist in Excel | Open the playlist, then **Download CSV**. |
| Research a new playlist | **Build with Claude**. Describe it, then refine with follow-up requests. Every version is kept. When it's right, click **Save to TIDAL**. |

Songs Claude suggests that can't be found on TIDAL are marked **not found**. They stay in the draft and are skipped when saving to TIDAL.

---

## Where your data lives

- Everything is in the `data/` folder next to the app: `vault.db` (the database) and `secret.key` (signs your logins).
- **Back up the `data/` folder** (Time Machine is enough), or use **Download backup file** regularly.
- `data/` and `.env` are excluded from git, so your tokens and keys never end up on GitHub.
- Passwords are stored hashed (scrambled one-way), never in plain text. TIDAL login tokens are stored in `vault.db`, so keep that file private.

## Using it from phones and other computers at home

By default the app only accepts connections from the computer it runs on. To open it from other devices on your home Wi-Fi:

1. Start it with `HOST=0.0.0.0 ./run.sh`.
2. Find your computer's local address, for example `192.168.1.20`.
3. Set `BASE_URL=http://192.168.1.20:8000` in `.env`.
4. Add `http://192.168.1.20:8000/tidal/callback` as a second redirect URI in the TIDAL portal.

Don't expose it to the open internet without HTTPS (encrypted connections).

---

## For developers

- Stack: Python, FastAPI, SQLite, server-rendered HTML (Jinja2). There's no JavaScript build step.
- `app/tidal.py`: TIDAL API v2 client, including the PKCE login flow (Proof Key for Code Exchange, the standard secure login for apps).
- `app/vault.py`: snapshots, restore, export and import.
- `app/research.py`: the Claude request, using structured JSON output.
- `app/main.py`: web routes.
- Run the tests with `.venv/bin/python -m pytest`. They use a simulated TIDAL server and a simulated Claude, so no accounts are needed.
- Change the Claude model with `CLAUDE_MODEL` in `.env` (default `claude-opus-5`).

## Roadmap

1. **Phase 1 (this version):** TIDAL backup and restore, family accounts, Claude playlist builder
2. **Phase 2:** Apple Music backup and restore via MusicKit (requires the $99/year Apple Developer Program), and copying playlists between TIDAL and Apple Music
3. **Phase 3:** automatic scheduled backups, and Claude research that uses web search for new releases
