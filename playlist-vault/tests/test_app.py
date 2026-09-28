import json
import re

from conftest import connect_tidal, sign_up


def playlist_ids(client):
    return [int(i) for i in re.findall(r'href="/playlists/(\d+)"', client.get("/").text)]


# ---------------------------------------------------------------- accounts

def test_first_visit_goes_to_setup_then_requires_login(client):
    assert client.get("/", follow_redirects=False).headers["location"] == "/setup"
    sign_up(client)
    assert "My vault" in client.get("/").text
    client.post("/logout")
    assert client.get("/", follow_redirects=False).headers["location"] == "/login"
    assert client.get("/family", follow_redirects=False).headers["location"] == "/login"


def test_login_rejects_wrong_password(client):
    sign_up(client)
    client.post("/logout")
    assert "Wrong username or password" in client.post(
        "/login", data={"username": "matthias", "password": "nope-nope"}).text
    assert "My vault" in client.post(
        "/login", data={"username": "MATTHIAS", "password": "secret-pass"}).text


def test_family_members_have_private_vaults(client):
    sign_up(client)
    connect_tidal(client)
    client.post("/backup")
    assert len(playlist_ids(client)) == 2
    own_playlist = playlist_ids(client)[0]

    client.post("/family", data={"name": "Emma", "username": "emma", "password": "emma-pass-1"})
    client.post("/logout")
    client.post("/login", data={"username": "emma", "password": "emma-pass-1"})
    assert playlist_ids(client) == []
    assert client.get(f"/playlists/{own_playlist}").status_code == 404
    # members cannot add other members
    assert client.post("/family", data={"name": "X", "username": "x", "password": "xxxxxxxx"}).status_code == 403


# ---------------------------------------------------------------- TIDAL

def test_tidal_connect_uses_pkce_and_rejects_bad_state(client):
    sign_up(client)
    resp = client.get("/tidal/connect", follow_redirects=False)
    url = resp.headers["location"]
    assert url.startswith("https://login.tidal.com/authorize?")
    assert "code_challenge_method=S256" in url and "client_id=client-123" in url
    assert "playlists.write" in url.replace("+", " ").replace("%20", " ") or "playlists.write" in url
    assert "failed" in client.get("/tidal/callback?code=abc&state=forged").text


def test_backup_is_incremental(client, fake_tidal):
    sign_up(client)
    assert "TIDAL connected" in connect_tidal(client).text
    first = client.post("/backup").text
    assert "2 playlists, 4 tracks. 2 new or changed, 0 unchanged" in first
    assert "2 new or changed" not in client.post("/backup").text  # nothing changed

    fake_tidal.playlists["pl-a"]["items"].append("3")
    assert "1 new or changed, 1 unchanged" in client.post("/backup").text

    road_trip = next(i for i in playlist_ids(client) if "Road Trip" in client.get(f"/playlists/{i}").text)
    page = client.get(f"/playlists/{road_trip}").text
    assert "History" in page and "Mother Sky" in page


def test_restore_creates_a_new_tidal_playlist(client, fake_tidal):
    sign_up(client)
    connect_tidal(client)
    client.post("/backup")
    pid = playlist_ids(client)[0]
    snapshot_id = re.search(r"/snapshots/(\d+)/restore", client.get(f"/playlists/{pid}").text).group(1)
    page = client.post(f"/snapshots/{snapshot_id}/restore", data={"name": "Road Trip (restored)"}).text
    assert "with 2 tracks" in page
    # playlists are listed alphabetically, so the first one is "Can Deep Cuts"
    assert fake_tidal.created["new-1"] == {"name": "Road Trip (restored)", "items": ["3", "4"]}


def test_rate_limited_requests_are_retried(client, fake_tidal):
    sign_up(client)
    connect_tidal(client)
    fake_tidal.rate_limit_next = True
    assert "Backup done" in client.post("/backup").text


# ---------------------------------------------------------------- files

def test_export_import_round_trip(client, settings):
    sign_up(client)
    connect_tidal(client)
    client.post("/backup")
    exported = client.get("/export")
    assert exported.headers["content-disposition"].startswith("attachment")
    data = exported.json()
    assert data["format"] == "playlist-vault/1" and len(data["playlists"]) == 2

    # a second family member loads the file into their empty vault
    client.post("/family", data={"name": "Mia", "username": "mia", "password": "mia-pass-12"})
    client.post("/logout")
    client.post("/login", data={"username": "mia", "password": "mia-pass-12"})
    files = {"file": ("backup.json", json.dumps(data), "application/json")}
    assert "Imported 2 snapshots (0 were already here)" in client.post("/import", files=files).text
    assert "Imported 0 snapshots (2 were already here)" in client.post("/import", files=files).text
    assert "Could not read that file" in client.post(
        "/import", files={"file": ("x.json", "{}", "application/json")}).text


def test_csv_download(client):
    sign_up(client)
    connect_tidal(client)
    client.post("/backup")
    pid = playlist_ids(client)[0]
    sid = re.search(r"/snapshots/(\d+)\.csv", client.get(f"/playlists/{pid}").text).group(1)
    csv_text = client.get(f"/snapshots/{sid}.csv").text
    assert csv_text.splitlines()[0].startswith("#,Title,Artist")
    assert "DEA" in csv_text


# ---------------------------------------------------------------- Claude

def test_research_builds_matches_and_saves_draft(client, fake_claude, fake_tidal):
    sign_up(client)
    connect_tidal(client)
    client.post("/backup")
    page = client.post("/research", data={"prompt": "Krautrock road trip", "count": "3",
                                          "use_taste": "true"}).text
    assert "Krautrock Drive" in page
    assert "The motorik blueprint." in page
    assert "1 not yet matched on TIDAL" in page

    req = fake_claude.requests[0]
    assert req["model"] == "claude-opus-5"
    assert req["output_config"]["format"]["type"] == "json_schema"
    assert "most-saved artists" in req["messages"][0]["content"]  # taste profile included

    pid = int(re.search(r"/playlists/(\d+)/refine", page).group(1))
    fake_claude.reply["title"] = "Krautrock Drive II"
    page = client.post(f"/playlists/{pid}/refine", data={"prompt": "more Can", "count": "3"}).text
    assert "Krautrock Drive II" in page and "History" in page
    assert "Revise it" in fake_claude.requests[1]["messages"][0]["content"]

    sid = re.search(r"/snapshots/(\d+)/restore", page).group(1)
    assert "with 2 tracks" in client.post(f"/snapshots/{sid}/restore", data={"name": "Drive"}).text


def test_research_refusal_is_reported(client, fake_claude):
    sign_up(client)
    fake_claude.stop_reason = "refusal"
    page = client.post("/research", data={"prompt": "anything", "count": "10"}).text
    assert "Claude declined" in page
