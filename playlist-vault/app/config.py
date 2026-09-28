"""Settings, read once from environment variables (or a local .env file)."""

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env reader so the app has no extra dependency for it."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    secret_key: str
    base_url: str
    tidal_client_id: str
    tidal_client_secret: str
    default_country: str
    claude_model: str

    @property
    def db_path(self) -> Path:
        return self.data_dir / "vault.db"

    @property
    def tidal_redirect_uri(self) -> str:
        return f"{self.base_url}/tidal/callback"


def _secret_key(data_dir: Path) -> str:
    """Use SECRET_KEY if set, otherwise create one and keep it in the data folder
    so logins survive a restart."""
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    key_file = data_dir / "secret.key"
    if not key_file.exists():
        key_file.write_text(secrets.token_urlsafe(48))
        key_file.chmod(0o600)
    return key_file.read_text().strip()


def load_settings() -> Settings:
    _load_dotenv(ROOT / ".env")
    data_dir = Path(os.environ.get("VAULT_DATA_DIR", ROOT / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        data_dir=data_dir,
        secret_key=_secret_key(data_dir),
        base_url=os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/"),
        tidal_client_id=os.environ.get("TIDAL_CLIENT_ID", ""),
        tidal_client_secret=os.environ.get("TIDAL_CLIENT_SECRET", ""),
        default_country=os.environ.get("TIDAL_COUNTRY", "US"),
        claude_model=os.environ.get("CLAUDE_MODEL", "claude-opus-5"),
    )
