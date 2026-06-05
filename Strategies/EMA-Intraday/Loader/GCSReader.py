from __future__ import annotations

import re
import tempfile
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable

from google.cloud import storage
from google.oauth2 import service_account

from Config import GCSConfig


FILE_RE = re.compile(r"(?P<expiry>\d{2}[A-Za-z]+?\d{4})_(?P<option_type>CE|PE)$", re.IGNORECASE)


@dataclass(slots=True)
class SourceFile:
    blob_name: str
    symbol: str
    expiry: date
    option_type: str

    @property
    def filename(self) -> str:
        return Path(self.blob_name).name


def _retry(
    func: Callable[[], Any],
    attempts: int,
    initial_delay: float,
    max_delay: float,
    retry_label: str,
) -> Any:
    delay = initial_delay
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            return func()
        except Exception as error:  # pragma: no cover - surfaced with runtime logs
            last_error = error
            if attempt >= attempts:
                break
            time.sleep(delay)
            delay = min(delay * 2, max_delay)

    if last_error is not None:
        raise RuntimeError(f"{retry_label} failed after {attempts} attempts: {last_error}") from last_error
    raise RuntimeError(f"{retry_label} failed.")


def _parse_expiry_token(token: str) -> date:
    normalized = token.strip().upper()
    for fmt in ("%d%b%Y", "%d%B%Y"):
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unable to parse expiry token: {token!r}")


def parse_source_file(blob_name: str) -> SourceFile:
    stem = Path(blob_name).stem
    match = FILE_RE.search(stem)
    if match is None:
        raise ValueError(f"Unsupported option file name: {blob_name}")

    prefix = stem[: match.start("expiry")].rstrip("_- ")
    symbol = prefix or "NIFTY"
    expiry = _parse_expiry_token(match.group("expiry"))
    option_type = match.group("option_type").upper()
    return SourceFile(blob_name=blob_name, symbol=symbol, expiry=expiry, option_type=option_type)


def build_option_blob_name(prefix: str, symbol: str, expiry: date, option_type: str) -> str:
    expiry_token = expiry.strftime("%d%B%Y").upper()
    filename = f"{symbol.upper()}{expiry_token}_{option_type.upper()}.parquet"
    clean_prefix = prefix.strip("/").strip()
    if not clean_prefix:
        return filename
    return f"{clean_prefix}/{filename}"


def build_storage_client(config: GCSConfig) -> storage.Client:
    if config.service_account_json and config.service_account_json.exists():
        credentials = service_account.Credentials.from_service_account_file(str(config.service_account_json))
        return storage.Client(credentials=credentials, project=config.project_id or credentials.project_id)

    return storage.Client(project=config.project_id)


def list_option_files(
    client: storage.Client,
    bucket_name: str,
    prefix: str,
    attempts: int,
    initial_delay: float,
    max_delay: float,
) -> list[SourceFile]:
    bucket = client.bucket(bucket_name)

    def _load() -> list[SourceFile]:
        blobs = bucket.list_blobs(prefix=prefix)
        files: list[SourceFile] = []
        for blob in blobs:
            name = blob.name
            if not name.lower().endswith(".parquet"):
                continue
            try:
                files.append(parse_source_file(name))
            except ValueError:
                continue
        files.sort(key=lambda item: (item.expiry.isoformat(), item.option_type, item.blob_name))
        return files

    return _retry(_load, attempts, initial_delay, max_delay, "GCS list")


def discover_option_files_direct(
    client: storage.Client,
    bucket_name: str,
    prefix: str,
    symbol: str,
    expiries: list[date],
    option_types: list[str],
    attempts: int,
    initial_delay: float,
    max_delay: float,
) -> tuple[list[SourceFile], list[str], list[str]]:
    bucket = client.bucket(bucket_name)
    requested_blob_names: list[str] = []
    found_files: list[SourceFile] = []
    missing_blob_names: list[str] = []
    seen_blob_names: set[str] = set()
    normalized_option_types = [option_type.upper() for option_type in option_types]

    for expiry in sorted({item for item in expiries if item is not None}):
        for option_type in normalized_option_types:
            blob_name = build_option_blob_name(prefix, symbol, expiry, option_type)
            if blob_name in seen_blob_names:
                continue
            seen_blob_names.add(blob_name)
            requested_blob_names.append(blob_name)

            blob = bucket.blob(blob_name)

            def _exists() -> bool:
                return bool(blob.exists())

            if _retry(
                _exists,
                attempts,
                initial_delay,
                max_delay,
                f"GCS exists check for {Path(blob_name).name}",
            ):
                found_files.append(SourceFile(blob_name=blob_name, symbol=symbol.upper(), expiry=expiry, option_type=option_type))
            else:
                missing_blob_names.append(blob_name)

    found_files.sort(key=lambda item: (item.expiry.isoformat(), item.option_type, item.blob_name))
    return found_files, requested_blob_names, missing_blob_names


def download_parquet_file(
    client: storage.Client,
    bucket_name: str,
    source_file: SourceFile,
    attempts: int,
    initial_delay: float,
    max_delay: float,
) -> Path:
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(source_file.blob_name)

    def _load() -> Path:
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".parquet", prefix="ema_intraday_", mode="wb")
        temp_path = Path(temp_file.name)
        try:
            with temp_file:
                blob.download_to_file(temp_file)
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise
        return temp_path

    return _retry(
        _load,
        attempts,
        initial_delay,
        max_delay,
        f"GCS download for {source_file.filename}",
    )


def download_parquet_dataframe(
    client: storage.Client,
    bucket_name: str,
    source_file: SourceFile,
    attempts: int,
    initial_delay: float,
    max_delay: float,
):
    parquet_path = download_parquet_file(
        client,
        bucket_name,
        source_file,
        attempts,
        initial_delay,
        max_delay,
    )
    raise NotImplementedError("download_parquet_dataframe is replaced by download_parquet_file.")
