"""Building playlists with Claude.

Claude proposes songs as structured JSON; we then look each one up on TIDAL so
the draft only contains real, playable tracks (anything not found is kept and
flagged, and can be matched again later).
"""

import json
from dataclasses import dataclass, field

import anthropic

SYSTEM_PROMPT = """You are a music researcher and playlist curator with deep knowledge \
of recorded music across genres, eras and countries.

Build playlists of real, commercially released recordings that can be found on major \
streaming services. Name the original artist and the song title exactly as released; \
prefer the original studio version unless the request asks for live versions or covers. \
Do not invent songs. If you are unsure a recording exists, leave it out.

Shape the order like a good DJ would: a strong opener, a sensible flow of tempo and \
mood, and a satisfying close. In "why", give one short, specific reason for each pick \
(history, influence, sound), not generic praise.

When the listener's favourite artists are provided, use them to judge taste, but do \
not fill the playlist with those same artists unless asked."""

PLAYLIST_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "tracks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "artist": {"type": "string"},
                    "album": {"type": "string"},
                    "year": {"type": "integer"},
                    "why": {"type": "string"},
                },
                "required": ["title", "artist", "album", "year", "why"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "description", "tracks"],
    "additionalProperties": False,
}


class ResearchError(Exception):
    pass


@dataclass
class Suggestion:
    title: str
    artist: str
    album: str
    year: int
    why: str


@dataclass
class Draft:
    title: str
    description: str
    tracks: list[Suggestion] = field(default_factory=list)


def build_request(prompt: str, track_count: int, taste: list[str] | None = None,
                  previous: Draft | None = None) -> str:
    parts = []
    if previous:
        listing = "\n".join(f"{i + 1}. {t.artist} – {t.title}" for i, t in enumerate(previous.tracks))
        parts.append(f"Here is the current playlist \"{previous.title}\":\n{listing}\n\n"
                     f"Revise it according to this request: {prompt}")
    else:
        parts.append(f"Build a playlist for this request: {prompt}")
    parts.append(f"Aim for about {track_count} tracks.")
    if taste:
        parts.append("For context, the listener's most-saved artists are: " + ", ".join(taste) + ".")
    return "\n\n".join(parts)


def ask_claude(client: anthropic.Anthropic, model: str, request: str) -> Draft:
    response = client.beta.messages.create(
        model=model,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        thinking={"type": "adaptive"},
        output_config={"format": {"type": "json_schema", "schema": PLAYLIST_SCHEMA}},
        # If Claude declines, let the API retry on Anthropic's recommended fallback model.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": request}],
    )
    if response.stop_reason == "refusal":
        raise ResearchError("Claude declined this request. Try rephrasing it.")
    if response.stop_reason == "max_tokens":
        raise ResearchError("The playlist was too long to finish. Ask for fewer tracks.")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise ResearchError("Claude returned no playlist. Please try again.")
    data = json.loads(text)
    return Draft(
        title=data["title"],
        description=data["description"],
        tracks=[Suggestion(**t) for t in data["tracks"]],
    )
