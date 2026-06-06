from __future__ import annotations

import time
from dataclasses import asdict
from datetime import date
from typing import Any, Callable

from supabase import Client, create_client

from Config import SupabaseConfig, UniverseConfig


def _response_data(response: Any) -> list[dict[str, Any]]:
    data = getattr(response, "data", None)
    if isinstance(data, list):
        return data
    if data is None:
        return []
    if isinstance(data, dict):
        return [data]
    return list(data)


def _response_error(response: Any) -> Any:
    return getattr(response, "error", None)


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
        except Exception as error:  # pragma: no cover - surfaced through runtime logs
            last_error = error
            if attempt >= attempts:
                break
            time.sleep(delay)
            delay = min(delay * 2, max_delay)

    if last_error is not None:
        raise RuntimeError(f"{retry_label} failed after {attempts} attempts: {last_error}") from last_error
    raise RuntimeError(f"{retry_label} failed.")


class SupabaseWriter:
    def __init__(self, config: SupabaseConfig, *, retry_attempts: int, retry_initial_delay: float, retry_max_delay: float) -> None:
        if not config.url:
            raise RuntimeError("SUPABASE_URL is missing.")
        if not config.service_role_key:
            raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing.")

        self._config = config
        self._client: Client = create_client(config.url, config.service_role_key)
        self._retry_attempts = retry_attempts
        self._retry_initial_delay = retry_initial_delay
        self._retry_max_delay = retry_max_delay

    @property
    def client(self) -> Client:
        return self._client

    def fetch_universe_config(self, config_name: str | None = None) -> UniverseConfig:
        def _load() -> UniverseConfig:
            query = self.client.schema(self._config.ema_schema).table("universe_config").select("*")
            response = query.execute()
            error = _response_error(response)
            if error is not None:
                raise RuntimeError(str(getattr(error, "message", error)))

            rows = _response_data(response)
            if config_name:
                rows = [row for row in rows if str(row.get("config_name") or "").strip().lower() == config_name.strip().lower()]
            else:
                rows = [row for row in rows if bool(row.get("active", True))]

            if not rows:
                raise RuntimeError("No active universe_config row was found.")

            rows.sort(
                key=lambda row: (
                    str(row.get("updated_at") or ""),
                    int(row.get("id") or 0),
                ),
                reverse=True,
            )
            row = rows[0]
            return UniverseConfig(
                id=int(row.get("id")) if row.get("id") is not None else None,
                config_name=str(row.get("config_name") or ""),
                from_date=date.fromisoformat(str(row.get("from_date") or "")),
                to_date=date.fromisoformat(str(row.get("to_date") or "")),
                min_dte=int(row.get("min_dte") or 0),
                max_dte=int(row.get("max_dte") or 0),
                premium_min=float(row.get("premium_min") or 0),
                premium_max=float(row.get("premium_max") or 0),
                option_type=str(row.get("option_type") or "BOTH").upper(),
                active=bool(row.get("active", True)),
            )

        return _retry(_load, self._retry_attempts, self._retry_initial_delay, self._retry_max_delay, "fetch universe_config")

    def fetch_date_selection_rows(self, from_date: date, to_date: date) -> list[dict[str, Any]]:
        def _load() -> list[dict[str, Any]]:
            page_size = 1000
            start = 0
            rows: list[dict[str, Any]] = []

            while True:
                response = (
                    self.client.schema(self._config.ema_schema)
                    .table("date_selection")
                    .select('"Date",expiry,dte,eff_dte,"Candle No"')
                    .gte("Date", from_date.isoformat())
                    .lte("Date", to_date.isoformat())
                    .order("Date", desc=False)
                    .order("Candle No", desc=True)
                    .range(start, start + page_size - 1)
                    .execute()
                )
                error = _response_error(response)
                if error is not None:
                    raise RuntimeError(str(getattr(error, "message", error)))

                page_rows = _response_data(response)
                rows.extend(page_rows)
                if len(page_rows) < page_size:
                    break
                start += page_size

            deduped: list[dict[str, Any]] = []
            seen: set[tuple[str, str]] = set()
            for row in rows:
                trade_date = str(row.get("Date") or "")
                expiry_date = str(row.get("expiry") or "")
                if not trade_date or not expiry_date:
                    continue
                key = (trade_date, expiry_date)
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(
                    {
                        "trade_date": trade_date,
                        "expiry_date": expiry_date,
                        "dte": row.get("dte"),
                        "eff_dte": row.get("eff_dte"),
                    }
                )

            return deduped

        return _retry(_load, self._retry_attempts, self._retry_initial_delay, self._retry_max_delay, "fetch date_selection")

    def fetch_universe_loads_rows(self, from_date: date, to_date: date) -> list[dict[str, Any]]:
        def _load() -> list[dict[str, Any]]:
            page_size = 1000
            start = 0
            rows: list[dict[str, Any]] = []

            while True:
                response = (
                    self.client.schema(self._config.ema_schema)
                    .table("universe_loads")
                    .select("trade_date,expiry,load_status")
                    .gte("trade_date", from_date.isoformat())
                    .lte("trade_date", to_date.isoformat())
                    .order("trade_date", desc=False)
                    .order("expiry", desc=False)
                    .range(start, start + page_size - 1)
                    .execute()
                )
                error = _response_error(response)
                if error is not None:
                    raise RuntimeError(str(getattr(error, "message", error)))

                page_rows = _response_data(response)
                rows.extend(page_rows)
                if len(page_rows) < page_size:
                    break
                start += page_size

            return rows

        return _retry(_load, self._retry_attempts, self._retry_initial_delay, self._retry_max_delay, "fetch universe_loads")

    def upsert_rows(
        self,
        table_name: str,
        rows: list[dict[str, Any]],
        *,
        conflict_columns: str,
        schema_name: str | None = None,
    ) -> int:
        if not rows:
            return 0

        target_schema = schema_name or self._config.ema_schema
        written = 0
        page_size = max(1, min(500, len(rows)))

        def _load() -> int:
            nonlocal written
            for start in range(0, len(rows), page_size):
                chunk = rows[start : start + page_size]
                response = (
                    self.client.schema(target_schema)
                    .table(table_name)
                    .upsert(
                        chunk,
                        on_conflict=conflict_columns,
                        returning="minimal",
                        default_to_null=False,
                    )
                    .execute()
                )
                error = _response_error(response)
                if error is not None:
                    raise RuntimeError(str(getattr(error, "message", error)))
                written += len(chunk)
            return written

        return _retry(_load, self._retry_attempts, self._retry_initial_delay, self._retry_max_delay, f"upsert {table_name}")

    def upsert_load_rows(self, rows: list[dict[str, Any]]) -> int:
        return self.upsert_rows("universe_loads", rows, conflict_columns="trade_date,expiry", schema_name=self._config.ema_schema)
