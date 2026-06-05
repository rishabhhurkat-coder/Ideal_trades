from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import duckdb

from Config import UniverseConfig


MARKET_OPEN_TIME = "09:15:00"
MARKET_LAST_BUCKET_TIME = "15:27:00"


def _to_iso_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _to_iso_time(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%H:%M:%S")
    return str(value)


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@dataclass(slots=True)
class FileDayBatch:
    trade_date: date
    expiry: date
    symbol: str
    option_type: str
    source_file: str
    candidate_rows: list[dict[str, Any]] = field(default_factory=list)
    option_series_rows: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class DailyUniverseGroup:
    trade_date: date
    expiry: date
    symbol: str
    ce_file: str | None = None
    pe_file: str | None = None
    candidate_rows: list[dict[str, Any]] = field(default_factory=list)
    option_series_rows: list[dict[str, Any]] = field(default_factory=list)

    def merge(self, batch: FileDayBatch) -> None:
        if batch.option_type == "CE":
            self.ce_file = batch.source_file
        elif batch.option_type == "PE":
            self.pe_file = batch.source_file
        self.candidate_rows.extend(batch.candidate_rows)
        self.option_series_rows.extend(batch.option_series_rows)


@dataclass(slots=True)
class BuildResult:
    batches: list[FileDayBatch]
    raw_rows_read: int
    rows_after_date_filter: int
    aggregated_rows_produced: int
    qualified_strikes: int
    aggregation_runtime_seconds: float


def _duckdb_pipeline(
    parquet_path: Path,
    *,
    symbol: str,
    file_expiry: date,
    option_type: str,
    config: UniverseConfig,
) -> tuple[dict[str, int], list[dict[str, Any]]]:
    query = """
    with raw_source as (
        select *
        from read_parquet(?)
    ),
    raw_count as (
        select cast(count(*) as bigint) as raw_rows_read
        from raw_source
    ),
    parsed_source as (
        select
            coalesce(
                try_cast("Date" as date),
                try_strptime(cast("Date" as varchar), '%d-%m-%Y')::date,
                try_strptime(cast("Date" as varchar), '%m-%d-%Y')::date
            ) as trade_date,
            coalesce(
                try_cast("Expiry" as date),
                try_strptime(cast("Expiry" as varchar), '%d-%m-%Y')::date,
                try_strptime(cast("Expiry" as varchar), '%m-%d-%Y')::date
            ) as expiry,
            upper(trim(cast("Option" as varchar))) as option_type,
            cast("Strike" as double) as strike,
            coalesce(
                try_cast("Time" as time),
                try_strptime(cast("Time" as varchar), '%H:%M:%S')::time,
                try_strptime(cast("Time" as varchar), '%H:%M')::time,
                try_strptime(
                    regexp_replace(trim(cast("Time" as varchar)), '^(\\d{1,2})\\.(\\d{2})$', '\\1:\\2'),
                    '%H:%M'
                )::time
            ) as candle_time,
            cast("Open" as double) as open_value,
            cast("High" as double) as high_value,
            cast("Low" as double) as low_value,
            cast("Close" as double) as close_value,
            cast("Volume" as double) as volume_value
        from raw_source
    ),
    source as (
        select *
        from parsed_source
        where trade_date between ? and ?
          and expiry = ?
          and option_type = ?
          and candle_time between time '09:15:00' and time '15:27:00'
    ),
    aggregated as (
        select
            trade_date,
            expiry,
            option_type,
            strike,
            cast(
                time '09:15:00'
                + cast(floor(date_diff('minute', time '09:15:00', candle_time) / 3.0) as bigint) * interval '3 minutes'
                as time
            ) as candle_time,
            arg_min(open_value, candle_time) as open_value,
            max(high_value) as high_value,
            min(low_value) as low_value,
            arg_max(close_value, candle_time) as close_value,
            sum(volume_value) as volume_value
        from source
        group by 1, 2, 3, 4, 5
    ),
    qualified as (
        select
            *,
            min(candle_time) filter (where close_value between ? and ?) over (
                partition by trade_date, expiry, option_type, strike
            ) as first_seen_time
        from aggregated
    ),
    candidate_final as (
        select distinct
            q.trade_date,
            q.expiry,
            q.option_type,
            q.strike,
            q.first_seen_time,
            a.close_value as first_seen_close
        from qualified q
        join aggregated a
          on a.trade_date = q.trade_date
         and a.expiry = q.expiry
         and a.option_type = q.option_type
         and a.strike = q.strike
         and a.candle_time = q.first_seen_time
        where q.first_seen_time is not null
    ),
    option_series_rows as (
        select
            q.trade_date,
            q.expiry,
            q.option_type,
            q.strike,
            q.candle_time,
            q.open_value,
            q.high_value,
            q.low_value,
            q.close_value,
            q.volume_value
        from qualified q
        join candidate_final c
          on c.trade_date = q.trade_date
         and c.expiry = q.expiry
         and c.option_type = q.option_type
         and c.strike = q.strike
        where q.candle_time >= c.first_seen_time
    ),
    source_count as (
        select cast(count(*) as bigint) as rows_after_date_filter
        from source
    ),
    aggregation_count as (
        select cast(count(*) as bigint) as rows_after_aggregation
        from aggregated
    ),
    candidate_count as (
        select cast(count(*) as bigint) as qualified_strikes
        from candidate_final
    )
    select
        0 as row_sort,
        'stats' as row_type,
        raw_count.raw_rows_read,
        source_count.rows_after_date_filter,
        aggregation_count.rows_after_aggregation,
        candidate_count.qualified_strikes,
        null::date as trade_date,
        null::date as expiry,
        null::varchar as symbol,
        null::double as strike,
        null::varchar as option_type,
        null::time as first_seen_time,
        null::double as first_seen_close,
        null::time as candle_time,
        null::double as open_value,
        null::double as high_value,
        null::double as low_value,
        null::double as close_value,
        null::double as volume_value
    from raw_count
    cross join source_count
    cross join aggregation_count
    cross join candidate_count

    union all

    select
        1 as row_sort,
        'candidate' as row_type,
        null::bigint as raw_rows_read,
        null::bigint as rows_after_date_filter,
        null::bigint as rows_after_aggregation,
        null::bigint as qualified_strikes,
        trade_date,
        expiry,
        ? as symbol,
        strike,
        option_type,
        first_seen_time,
        first_seen_close,
        null::time as candle_time,
        null::double as open_value,
        null::double as high_value,
        null::double as low_value,
        null::double as close_value,
        null::double as volume_value
    from candidate_final

    union all

    select
        2 as row_sort,
        'option_series' as row_type,
        null::bigint as raw_rows_read,
        null::bigint as rows_after_date_filter,
        null::bigint as rows_after_aggregation,
        null::bigint as qualified_strikes,
        trade_date,
        expiry,
        ? as symbol,
        strike,
        option_type,
        null::time as first_seen_time,
        null::double as first_seen_close,
        candle_time,
        open_value,
        high_value,
        low_value,
        close_value,
        volume_value
    from option_series_rows

    order by
        row_sort,
        trade_date,
        expiry,
        option_type,
        strike,
        candle_time nulls first
    """

    connection = duckdb.connect(database=":memory:")
    connection.execute("PRAGMA threads=4")
    params = [
        str(parquet_path),
        config.from_date.isoformat(),
        config.to_date.isoformat(),
        file_expiry.isoformat(),
        option_type,
        config.premium_min,
        config.premium_max,
        symbol,
        symbol,
    ]
    cursor = connection.execute(query, params)
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row, strict=False)) for row in cursor.fetchall()]
    stats_row = next((row for row in rows if row["row_type"] == "stats"), None)
    data_rows = [row for row in rows if row["row_type"] != "stats"]

    if stats_row is None:
        raise RuntimeError(f"DuckDB stats row missing for {parquet_path.name}.")

    metrics = {
        "raw_rows_read": _to_int(stats_row["raw_rows_read"]) or 0,
        "rows_after_date_filter": _to_int(stats_row["rows_after_date_filter"]) or 0,
        "rows_after_aggregation": _to_int(stats_row["rows_after_aggregation"]) or 0,
        "qualified_strikes": _to_int(stats_row["qualified_strikes"]) or 0,
    }
    return metrics, data_rows


def build_file_day_batches(
    parquet_path: Path,
    *,
    source_file: str,
    symbol: str,
    file_expiry: date,
    option_type: str,
    config: UniverseConfig,
) -> BuildResult:
    import time

    start = time.perf_counter()
    metrics, data_rows = _duckdb_pipeline(
        parquet_path,
        symbol=symbol,
        file_expiry=file_expiry,
        option_type=option_type,
        config=config,
    )
    aggregation_runtime_seconds = time.perf_counter() - start

    batches: dict[tuple[date, date], FileDayBatch] = {}
    for row in data_rows:
        trade_date_value = row["trade_date"]
        expiry_value = row["expiry"]
        if trade_date_value is None or expiry_value is None:
            continue

        trade_date = trade_date_value if isinstance(trade_date_value, date) else date.fromisoformat(str(trade_date_value))
        expiry = expiry_value if isinstance(expiry_value, date) else date.fromisoformat(str(expiry_value))
        key = (trade_date, expiry)

        batch = batches.get(key)
        if batch is None:
            batch = FileDayBatch(
                trade_date=trade_date,
                expiry=expiry,
                symbol=symbol,
                option_type=option_type.upper(),
                source_file=source_file,
            )
            batches[key] = batch

        row_type = str(row["row_type"])
        if row_type == "candidate":
            batch.candidate_rows.append(
                {
                    "trade_date": _to_iso_date(row["trade_date"]),
                    "expiry": _to_iso_date(row["expiry"]),
                    "symbol": symbol,
                    "strike": _to_float(row["strike"]),
                    "option_type": str(row["option_type"]),
                    "first_seen_time": _to_iso_time(row["first_seen_time"]),
                    "first_seen_close": _to_float(row["first_seen_close"]),
                }
            )
        elif row_type == "option_series":
            batch.option_series_rows.append(
                {
                    "trade_date": _to_iso_date(row["trade_date"]),
                    "candle_time": _to_iso_time(row["candle_time"]),
                    "expiry": _to_iso_date(row["expiry"]),
                    "symbol": symbol,
                    "strike": _to_float(row["strike"]),
                    "option_type": str(row["option_type"]),
                    "open": _to_float(row["open_value"]),
                    "high": _to_float(row["high_value"]),
                    "low": _to_float(row["low_value"]),
                    "close": _to_float(row["close_value"]),
                    "volume": _to_int(row["volume_value"]),
                    "oi": None,
                }
            )

    return BuildResult(
        batches=list(batches.values()),
        raw_rows_read=metrics["raw_rows_read"],
        rows_after_date_filter=metrics["rows_after_date_filter"],
        aggregated_rows_produced=metrics["rows_after_aggregation"],
        qualified_strikes=metrics["qualified_strikes"],
        aggregation_runtime_seconds=aggregation_runtime_seconds,
    )
