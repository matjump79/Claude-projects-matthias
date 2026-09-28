"""Test fixtures: a fake TIDAL server and a fake Claude, so tests need no accounts."""

import json
import re
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import unquote

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

CATALOG = {
    "1": {"title": "Hallogallo", "artist": "NEU!", "album": "Neu!", "isrc": "DEA111", "duration": "PT10M8S"},
    "2": {"title": "Autobahn", "artist": "Kraftwerk", "album": "Autobahn", "isrc": "DEA222", "duration": "PT22M43S"},
    "3": {"title": "Mother Sky", "artist": "Can", "album": "Soundtracks", "isrc": "DEA333", "duration": "PT14M31S"},
    "4": {"title": "Vitamin C", "artist": "Can", "album": "Ege Bamyasi", "isrc": "DEA444", "duration": "PT3M32S"},
}


class FakeTidal:
    """Answers the subset of openapi.tidal.com/v2 the app uses."""

    def __init__(self):
        self.playlists = {
            "pl-a": {"name": "Road Trip", "description": "Motorik", "items": ["1", "2"]},
            "pl-b": {"name": "Can Deep Cuts", "description": "", "items": ["3", "4"]},
        }
        self.created: dict[str, dict] = {}
        self.calls: list[str] = []
        self.rate_limit_next = False

    def track_doc(self, ids):
        data, included = [], []
        for tid in ids:
            t = CATALOG[tid]
            data.append({"id": tid, "type": "tracks",
                         "attributes": {"title": t["title"], "isrc": t["isrc"], "duration": t["duration"]},
                         "relationships": {"artists": {"data": [{"id": f"ar-{tid}", "type": "artists"}]},
                                           "albums": {"data": [{"id": f"al-{tid}", "type": "albums"}]}}})
            included += [{"id": f"ar-{tid}", "type": "artists", "attributes": {"name": t["artist"]}},
                         {"id": f"al-{tid}", "type": "albums", "attributes": {"title": t["album"]}}]
        return {"data": data, "included": included, "links": {"self": "/tracks"}}

    def handler(self, request: httpx.Request) -> httpx.Response:
        path, params = request.url.path, request.url.params
        self.calls.append(f"{request.method} {path}")
        if self.rate_limit_next:
            self.rate_limit_next = False
            return httpx.Response(429, headers={"Retry-After": "0"})
        if request.url.host == "auth.tidal.com":
            return httpx.Response(200, json={"access_token": "tok", "refresh_token": "ref",
                                             "expires_in": 3600, "user_id": 42})
        assert request.headers["Authorization"] == "Bearer tok"
        path = path.removeprefix("/v2")
        if path == "/users/me":
            return httpx.Response(200, json={"data": {"id": "42", "type": "users",
                                                      "attributes": {"username": "matthias", "country": "DE"}}})
        if path == "/playlists" and request.method == "GET":
            assert params["filter[owners.id]"] == "me"
            ids = list(self.playlists)
            page = ids[1:] if params.get("page[cursor]") == "c2" else ids[:1]
            links = {"self": "/playlists"} if page != ids[:1] else {"self": "/playlists", "meta": {"nextCursor": "c2"}}
            return httpx.Response(200, json={"data": [
                {"id": pid, "type": "playlists", "attributes": {
                    "name": self.playlists[pid]["name"], "description": self.playlists[pid]["description"],
                    "numberOfItems": len(self.playlists[pid]["items"])}} for pid in page], "links": links})
        if path == "/playlists" and request.method == "POST":
            body = json.loads(request.content)
            assert request.headers["Content-Type"] == "application/vnd.api+json"
            new_id = f"new-{len(self.created) + 1}"
            self.created[new_id] = {"name": body["data"]["attributes"]["name"], "items": []}
            return httpx.Response(201, json={"data": {"id": new_id, "type": "playlists"}})
        m = re.fullmatch(r"/playlists/([^/]+)/relationships/items", path)
        if m and request.method == "GET":
            items = self.playlists[m.group(1)]["items"]
            return httpx.Response(200, json={"data": [{"id": i, "type": "tracks"} for i in items],
                                             "links": {"self": path}})
        if m and request.method == "POST":
            body = json.loads(request.content)
            assert len(body["data"]) <= 20
            self.created[m.group(1)]["items"] += [d["id"] for d in body["data"]]
            return httpx.Response(200, json={"data": [], "links": {"self": path}})
        if path == "/tracks":
            if "filter[isrc]" in params:
                ids = [tid for tid, t in CATALOG.items() if t["isrc"] == params["filter[isrc]"]]
            else:
                ids = [i for i in params.get_list("filter[id]") if i in CATALOG]
            return httpx.Response(200, json=self.track_doc(ids))
        m = re.fullmatch(r"/searchResults/(.+)/relationships/tracks", path)
        if m:
            q = unquote(m.group(1)).casefold()
            ids = [tid for tid, t in CATALOG.items() if t["title"].casefold() in q]
            return httpx.Response(200, json={"data": [{"id": i, "type": "tracks"} for i in ids],
                                             "links": {"self": path}})
        return httpx.Response(404, json={"errors": [{"detail": f"no fake for {path}"}]})


class FakeClaude:
    """Mimics anthropic.Anthropic().beta.messages.create for the research feature."""

    def __init__(self):
        self.requests: list[dict] = []
        self.reply = {
            "title": "Krautrock Drive",
            "description": "Motorik beats for the Autobahn.",
            "tracks": [
                {"title": "Hallogallo", "artist": "NEU!", "album": "Neu!", "year": 1972, "why": "The motorik blueprint."},
                {"title": "Vitamin C", "artist": "Can", "album": "Ege Bamyasi", "year": 1972, "why": "Tight groove."},
                {"title": "Invented Song", "artist": "Nobody", "album": "", "year": 1975, "why": "Not on TIDAL."},
            ],
        }
        self.stop_reason = "end_turn"
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(stop_reason=self.stop_reason,
                               content=[SimpleNamespace(type="text", text=json.dumps(self.reply))])


@pytest.fixture
def fake_tidal():
    return FakeTidal()


@pytest.fixture
def fake_claude():
    return FakeClaude()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(data_dir=tmp_path, secret_key="test-secret", base_url="http://testserver",
                    tidal_client_id="client-123", tidal_client_secret="", default_country="US",
                    claude_model="claude-opus-5")


@pytest.fixture
def client(settings, fake_tidal, fake_claude):
    http = httpx.Client(transport=httpx.MockTransport(fake_tidal.handler))
    app = create_app(settings, http=http, claude=fake_claude)
    with TestClient(app, base_url="http://testserver") as c:
        yield c


def sign_up(client, name="Matthias", username="matthias", password="secret-pass"):
    return client.post("/setup", data={"name": name, "username": username, "password": password})


def connect_tidal(client):
    resp = client.get("/tidal/connect", follow_redirects=False)
    state = re.search(r"state=([^&]+)", resp.headers["location"]).group(1)
    return client.get(f"/tidal/callback?code=abc&state={state}")
