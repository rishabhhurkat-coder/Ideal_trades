from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv


def _env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.environ.get(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _env_int(*names: str, default: int) -> int:
    raw = _env(*names)
    return int(raw) if raw else default


def _env_float(*names: str, default: float) -> float:
    raw = _env(*names)
    return float(raw) if raw else default


def _env_bool(*names: str, default: bool = False) -> bool:
    raw = _env(*names)
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "y", "on"}


def _env_path(*names: str, default: str = "") -> Path | None:
    raw = _env(*names, default=default)
    if not raw:
        return None
    return Path(raw).expanduser().resolve()


def parse_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


@dataclass(slots=True)
class SupabaseConfig:
    url: str
    service_role_key: str
    ema_schema: str = "emaintraday"
    shared_schema: str = "ideal_trades"


@dataclass(slots=True)
class GCSConfig:
    bucket_name: str
    prefix: str
    service_account_json: Path | None
    project_id: str | None


@dataclass(slots=True)
class RuntimeConfig:
    batch_size: int = 500
    retry_attempts: int = 5
    retry_initial_delay: float = 1.0
    retry_max_delay: float = 10.0
    log_level: str = "INFO"
    log_dir: Path = Path("logs")
    dry_run: bool = False


@dataclass(slots=True)
class UniverseConfig:
    id: int | None
    config_name: str
    from_date: date
    to_date: date
    min_dte: int
    max_dte: int
    premium_min: float
    premium_max: float
    option_type: str
    active: bool


def load_dotenv_files(loader_dir: Path | None = None) -> None:
    if loader_dir is not None:
        load_dotenv(loader_dir / ".env", override=False)
    load_dotenv(override=False)


def load_supabase_config() -> SupabaseConfig:
    return SupabaseConfig(
        url=_env("SUPABASE_URL", "VITE_SUPABASE_URL").rstrip("/"),
        service_role_key=_env(
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_SERVICE_KEY",
            "SUPABASE_SECRET_KEY",
        ),
        ema_schema=_env("EMA_INTRADAY_SCHEMA", default="emaintraday").strip().lower() or "emaintraday",
        shared_schema=_env("IDEAL_TRADES_SCHEMA", default="ideal_trades").strip().lower() or "ideal_trades",
    )


def load_gcs_config() -> GCSConfig:
    return GCSConfig(
        bucket_name=_env("GCS_BUCKET", default="hlbacktest-data"),
        prefix=_env("GCS_PREFIX", default="Market Data/NSE Options/"),
        service_account_json=_env_path(
            "GCS_SERVICE_ACCOUNT_JSON",
            "GOOGLE_APPLICATION_CREDENTIALS",
            "SERVICE_ACCOUNT_JSON_PATH",
        ),
        project_id=_env("GCS_PROJECT_ID", default="") or None,
    )


def load_runtime_config() -> RuntimeConfig:
    return RuntimeConfig(
        batch_size=max(_env_int("LOADER_BATCH_SIZE", default=500), 1),
        retry_attempts=max(_env_int("LOADER_RETRY_ATTEMPTS", default=5), 1),
        retry_initial_delay=max(_env_float("LOADER_RETRY_INITIAL_DELAY", default=1.0), 0.1),
        retry_max_delay=max(_env_float("LOADER_RETRY_MAX_DELAY", default=10.0), 0.1),
        log_level=_env("LOADER_LOG_LEVEL", default="INFO").upper() or "INFO",
        log_dir=Path(_env("LOADER_LOG_DIR", default="logs")),
        dry_run=_env_bool("LOADER_DRY_RUN", default=False),
    )

