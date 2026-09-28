"""Talking to TIDAL's official API (https://openapi.tidal.com/v2, JSON:API format).

Login uses OAuth 2.0 "Authorization Code with PKCE": the user signs in on
TIDAL's own page and we only ever see a token, never their password.
Endpoint shapes follow TIDAL's published OpenAPI spec
(https://tidal-music.github.io/tidal-api-reference/).
"""

import base64
import hashlib
import re
import secrets
import time
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Callable, Iterable
from urllib.parse import quote, urlencode

import httpx

API_BASE = "https://openapi.tidal.com/v2"
AUTHORIZE_URL = "https://login.tidal.com/authorize"
TOKEN_URL = "https://auth.tidal.com/v1/oauth2/token"
SCOPES = "user.read playlists.read playlists.write collection.read"
JSONAPI = "application/vnd.api+json"
MAX_ITEMS_PER_ADD = 20  # TIDAL accepts at most 20 items per "add to playlist" call
MAX_IDS_PER_LOOKUP = 20


class TidalError(Exception):
    pass


@dataclass
class Track:
    tidal_id: str
    title: str
    artist: str = ""
    album: str = ""
    isrc: str | None = None
    duration_s: int | None = None


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str | None
    expires_at: float
    tidal_user_id: str | None = None


# ---------------------------------------------------------------- login (PKCE)

def new_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def authorize_url(client_id: str, redirect_uri: str, challenge: str, state: str) -> str:
    query = urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": SCOPES,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
        "state": state,
    })
    return f"{AUTHORIZE_URL}?{query}"


def _token_request(http: httpx.Client, form: dict, client_secret: str) -> TokenSet:
    auth = (form["client_id"], client_secret) if client_secret else None
    resp = http.post(TOKEN_URL, data=form, auth=auth)
    if resp.status_code != 200:
        raise TidalError(f"TIDAL login failed ({resp.status_code}): {resp.text[:300]}")
    body = resp.json()
    return TokenSet(
        access_token=body["access_token"],
        refresh_token=body.get("refresh_token") or form.get("refresh_token"),
        expires_at=time.time() + int(body.get("expires_in", 3600)) - 60,
        tidal_user_id=str(body["user_id"]) if body.get("user_id") else None,
    )


def exchange_code(http: httpx.Client, client_id: str, client_secret: str,
                  code: str, verifier: str, redirect_uri: str) -> TokenSet:
    return _token_request(http, {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": verifier,
    }, client_secret)


def refresh(http: httpx.Client, client_id: str, client_secret: str, refresh_token: str) -> TokenSet:
    return _token_request(http, {
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
    }, client_secret)


# ---------------------------------------------------------------- API calls

def _iso_duration_to_seconds(value: str | None) -> int | None:
    if not value:
        return None
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?", value)
    if not m:
        return None
    d, h, mi, s = (float(x) if x else 0 for x in m.groups())
    return int(d * 86400 + h * 3600 + mi * 60 + s)


def _chunks(items: list, size: int) -> Iterable[list]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _similar(a: str, b: str) -> float:
    return SequenceMatcher(None, a.casefold(), b.casefold()).ratio()


class TidalAPI:
    def __init__(self, http: httpx.Client, access_token: str, country: str,
                 sleep: Callable[[float], None] = time.sleep):
        self.http = http
        self.country = country
        self.headers = {"Authorization": f"Bearer {access_token}", "Accept": JSONAPI}
        self.sleep = sleep

    def _request(self, method: str, path: str, params: dict | None = None, json: dict | None = None) -> dict:
        headers = dict(self.headers)
        if json is not None:
            headers["Content-Type"] = JSONAPI
        for attempt in range(4):
            resp = self.http.request(method, API_BASE + path, params=params, json=json, headers=headers)
            if resp.status_code == 429 and attempt < 3:  # rate limited: wait, then retry
                self.sleep(min(float(resp.headers.get("Retry-After", 2 ** attempt)), 10))
                continue
            break
        if resp.status_code >= 400:
            raise TidalError(f"TIDAL {method} {path} failed ({resp.status_code}): {resp.text[:300]}")
        return resp.json() if resp.content else {}

    def _paged(self, path: str, params: dict) -> Iterable[dict]:
        """Yield every page of a JSON:API list, following the cursor."""
        params = dict(params)
        while True:
            doc = self._request("GET", path, params)
            yield doc
            cursor = (doc.get("links") or {}).get("meta", {}).get("nextCursor")
            if not cursor:
                return
            params["page[cursor]"] = cursor

    # -- account

    def me(self) -> dict:
        doc = self._request("GET", "/users/me")
        data = doc.get("data") or {}
        attrs = data.get("attributes") or {}
        return {"id": data.get("id"), "username": attrs.get("username", ""), "country": attrs.get("country")}

    # -- reading

    def my_playlists(self) -> list[dict]:
        playlists = []
        for doc in self._paged("/playlists", {"filter[owners.id]": "me", "countryCode": self.country}):
            for item in doc.get("data") or []:
                attrs = item.get("attributes") or {}
                playlists.append({
                    "id": item["id"],
                    "name": attrs.get("name", "Untitled"),
                    "description": attrs.get("description") or "",
                    "count": attrs.get("numberOfItems"),
                    "modified": attrs.get("lastModifiedAt"),
                })
        return playlists

    def playlist_track_ids(self, playlist_id: str) -> list[str]:
        ids = []
        path = f"/playlists/{quote(playlist_id)}/relationships/items"
        for doc in self._paged(path, {"countryCode": self.country}):
            ids += [item["id"] for item in doc.get("data") or [] if item.get("type") == "tracks"]
        return ids

    def tracks(self, ids: list[str]) -> dict[str, Track]:
        """Full details (title, artist, album, ISRC) for track ids, keyed by id."""
        found: dict[str, Track] = {}
        for batch in _chunks(list(dict.fromkeys(ids)), MAX_IDS_PER_LOOKUP):
            doc = self._request("GET", "/tracks", {
                "filter[id]": batch, "include": ["artists", "albums"], "countryCode": self.country})
            for track in self._parse_tracks(doc):
                found[track.tidal_id] = track
        return found

    def find_by_isrc(self, isrc: str) -> Track | None:
        doc = self._request("GET", "/tracks", {
            "filter[isrc]": isrc, "include": ["artists", "albums"], "countryCode": self.country})
        tracks = self._parse_tracks(doc)
        return tracks[0] if tracks else None

    def search_tracks(self, query: str, limit: int = 5) -> list[Track]:
        doc = self._request("GET", f"/searchResults/{quote(query, safe='')}/relationships/tracks",
                            {"countryCode": self.country})
        ids = [item["id"] for item in doc.get("data") or []][:limit]
        details = self.tracks(ids) if ids else {}
        return [details[i] for i in ids if i in details]

    def best_match(self, title: str, artist: str) -> Track | None:
        """Search for 'title artist' and keep the closest title + artist match."""
        candidates = self.search_tracks(f"{title} {artist}")
        scored = [(_similar(c.title, title) + _similar(c.artist, artist), c) for c in candidates]
        scored = [(score, c) for score, c in scored if score >= 1.1]  # both roughly right
        return max(scored, key=lambda sc: sc[0])[1] if scored else None

    @staticmethod
    def _parse_tracks(doc: dict) -> list[Track]:
        included = {(r.get("type"), r.get("id")): r.get("attributes") or {} for r in doc.get("included") or []}

        def names(rel: dict | None, kind: str, field: str) -> list[str]:
            refs = (rel or {}).get("data") or []
            return [included.get((kind, ref.get("id")), {}).get(field, "") for ref in refs]

        tracks = []
        for item in doc.get("data") or []:
            if item.get("type") != "tracks":
                continue
            attrs = item.get("attributes") or {}
            rels = item.get("relationships") or {}
            artists = [n for n in names(rels.get("artists"), "artists", "name") if n]
            albums = [n for n in names(rels.get("albums"), "albums", "title") if n]
            title = attrs.get("title", "")
            if attrs.get("version"):
                title = f"{title} ({attrs['version']})"
            tracks.append(Track(
                tidal_id=item["id"],
                title=title,
                artist=", ".join(artists),
                album=albums[0] if albums else "",
                isrc=attrs.get("isrc"),
                duration_s=_iso_duration_to_seconds(attrs.get("duration")),
            ))
        return tracks

    # -- writing

    def create_playlist(self, name: str, description: str = "") -> str:
        doc = self._request("POST", "/playlists", {"countryCode": self.country}, json={
            "data": {"type": "playlists", "attributes": {
                "name": name, "description": description[:500], "accessType": "UNLISTED"}}})
        return doc["data"]["id"]

    def add_tracks(self, playlist_id: str, track_ids: list[str]) -> None:
        path = f"/playlists/{quote(playlist_id)}/relationships/items"
        for batch in _chunks(track_ids, MAX_ITEMS_PER_ADD):
            self._request("POST", path, {"countryCode": self.country},
                          json={"data": [{"type": "tracks", "id": tid} for tid in batch]})
