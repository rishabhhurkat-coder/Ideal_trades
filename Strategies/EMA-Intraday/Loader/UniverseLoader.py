from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass, replace
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
import threading
import time as time_module
import traceback

import duckdb

from Config import (
    GCSConfig,
    RuntimeConfig,
    SupabaseConfig,
    load_dotenv_files,
    load_gcs_config,
    load_runtime_config,
    load_supabase_config,
)
from GCSReader import SourceFile, _retry, build_option_blob_name, build_storage_client, download_parquet_file
from SupabaseWriter import SupabaseWriter
from UniverseBuilder import BuildResult, DailyUniverseGroup, FileDayBatch, build_file_day_batches


@dataclass(slots=True)
class LoadSummary:
    files_seen: int = 0
    files_loaded: int = 0
    raw_rows_read: int = 0
    rows_after_date_filter: int = 0
    aggregated_rows_produced: int = 0
    qualified_strikes: int = 0
    aggregation_runtime_seconds: float = 0.0
    groups_found: int = 0
    groups_skipped_loaded: int = 0
    candidate_rows: int = 0
    option_series_rows: int = 0
    load_rows: int = 0


@dataclass(slots=True)
class ExpiryFileCheck:
    trade_date: date
    expiry: date
    ce_blob_name: str
    pe_blob_name: str
    ce_exists: bool
    pe_exists: bool

    @property
    def missing_blob_names(self) -> list[str]:
        missing: list[str] = []
        if not self.ce_exists:
            missing.append(self.ce_blob_name)
        if not self.pe_exists:
            missing.append(self.pe_blob_name)
        return missing


class StageLogger:
    def __init__(self, stage_name: str) -> None:
        self.stage_name = stage_name
        self.start_time: float | None = None
        self.timer: threading.Timer | None = None
        self.elapsed_seconds: float = 0.0
        self.rows: int | None = None

    def __enter__(self) -> "StageLogger":
        self.start_time = time_module.perf_counter()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.stage_name} started", flush=True)
        self.timer = threading.Timer(30.0, self._warning)
        self.timer.daemon = True
        self.timer.start()
        return self

    def _warning(self) -> None:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] WARNING {self.stage_name} exceeded 30s", flush=True)

    def complete(self, *, rows: int | None = None) -> None:
        if self.start_time is None:
            return
        if self.timer is not None:
            self.timer.cancel()
        self.elapsed_seconds = time_module.perf_counter() - self.start_time
        self.rows = rows
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] {self.stage_name} completed elapsed={self.elapsed_seconds:.2f}s",
            flush=True,
        )
        if rows is not None:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Rows={rows}", flush=True)

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is None:
            self.complete(rows=self.rows)
        else:
            if self.timer is not None:
                self.timer.cancel()
        return False


def _count_raw_rows(parquet_path: Path) -> int:
    connection = duckdb.connect(database=":memory:")
    result = connection.execute("select cast(count(*) as bigint) from read_parquet(?)", [str(parquet_path)]).fetchone()
    return int(result[0]) if result and result[0] is not None else 0


def _count_rows_after_date_filter(
    parquet_path: Path,
    *,
    from_date: date,
    to_date: date,
    file_expiry: date,
    option_type: str,
) -> int:
    query = """
    with raw_source as (
        select *
        from read_parquet(?)
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
            coalesce(
                try_cast("Time" as time),
                try_strptime(cast("Time" as varchar), '%H:%M:%S')::time,
                try_strptime(cast("Time" as varchar), '%H:%M')::time,
                try_strptime(
                    regexp_replace(trim(cast("Time" as varchar)), '^(\\d{1,2})\\.(\\d{2})$', '\\1:\\2'),
                    '%H:%M'
                )::time
            ) as candle_time
        from raw_source
    ),
    source as (
        select *
        from parsed_source
        where trade_date between ? and ?
          and expiry = ?
          and option_type = ?
          and candle_time between time '09:15:00' and time '15:27:00'
    )
    select cast(count(*) as bigint) from source
    """
    connection = duckdb.connect(database=":memory:")
    result = connection.execute(
        query,
        [str(parquet_path), from_date.isoformat(), to_date.isoformat(), file_expiry.isoformat(), option_type],
    ).fetchone()
    return int(result[0]) if result and result[0] is not None else 0


def _parse_date_row(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _setup_logger(log_dir: Path, log_level: str) -> logging.Logger:
    log_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("ema_intraday_universe_loader")
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    logger.handlers.clear()
    logger.propagate = False

    formatter = logging.Formatter("%(message)s")
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    stdout_handler.setLevel(logger.level)
    file_handler = logging.FileHandler(log_dir / f"UniverseLoader-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logger.level)

    logger.addHandler(stdout_handler)
    logger.addHandler(file_handler)
    return logger


def _log(logger: logging.Logger, level: str, event: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level.upper(),
        "event": event,
        **fields,
    }
    getattr(logger, level.lower(), logger.info)(json.dumps(payload, ensure_ascii=False, default=str))


def _batch_rows(rows: list[dict[str, Any]], batch_size: int) -> list[list[dict[str, Any]]]:
    return [rows[index : index + batch_size] for index in range(0, len(rows), batch_size)]


def _dedupe_rows(rows: list[dict[str, Any]], key_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    deduped: list[dict[str, Any]] = []
    for row in rows:
        key = tuple(row.get(field) for field in key_fields)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def _merge_batch(group_map: dict[tuple[date, date], DailyUniverseGroup], batch: FileDayBatch) -> None:
    key = (batch.trade_date, batch.expiry)
    group = group_map.get(key)
    if group is None:
        group = DailyUniverseGroup(
            trade_date=batch.trade_date,
            expiry=batch.expiry,
            symbol=batch.symbol,
        )
        group_map[key] = group
    group.merge(batch)


def _index_calendar_rows(rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    indexed: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        trade_date = str(row.get("trade_date") or "")
        expiry_date = str(row.get("expiry_date") or "")
        if trade_date and expiry_date:
            indexed[(trade_date, expiry_date)] = row
    return indexed


def _index_load_rows(rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    indexed: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        trade_date = str(row.get("trade_date") or "")
        expiry = str(row.get("expiry") or "")
        load_status = str(row.get("load_status") or "").upper()
        if trade_date and expiry:
            indexed[(trade_date, expiry)] = row
            if load_status == "LOADED":
                indexed[(trade_date, expiry)] = row
    return indexed


def _build_load_row(
    group: DailyUniverseGroup,
    calendar_row: dict[str, Any] | None,
    *,
    load_status: str,
) -> dict[str, Any]:
    return {
        "trade_date": group.trade_date.isoformat(),
        "expiry": group.expiry.isoformat(),
        "dte": int(calendar_row.get("dte") or 0) if calendar_row else None,
        "ce_file": group.ce_file,
        "pe_file": group.pe_file,
        "rows_loaded": len(group.option_series_rows),
        "universe_rows": len(group.candidate_rows),
        "load_status": load_status,
        "loaded_at": datetime.now(timezone.utc).isoformat(),
    }


def _calendar_expiry_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for row in rows:
        trade_date = _parse_date_row(row.get("trade_date"))
        expiry = _parse_date_row(row.get("expiry_date"))
        if trade_date is None or expiry is None:
            continue
        key = (trade_date.isoformat(), expiry.isoformat())
        if key in seen:
            continue
        seen.add(key)
        ordered.append({"trade_date": trade_date, "expiry": expiry})
    ordered.sort(key=lambda item: (item["trade_date"], item["expiry"]))
    return ordered


def _check_nifty_expiry_files(
    *,
    storage_client,
    gcs_config: GCSConfig,
    runtime_config: RuntimeConfig,
    logger: logging.Logger,
    calendar_rows: list[dict[str, Any]],
) -> tuple[list[SourceFile], list[ExpiryFileCheck]]:
    bucket = storage_client.bucket(gcs_config.bucket_name)
    source_files: list[SourceFile] = []
    checks: list[ExpiryFileCheck] = []

    for row in _calendar_expiry_rows(calendar_rows):
        trade_date = row["trade_date"]
        expiry = row["expiry"]
        ce_blob_name = build_option_blob_name(gcs_config.prefix, "NIFTY", expiry, "CE")
        pe_blob_name = build_option_blob_name(gcs_config.prefix, "NIFTY", expiry, "PE")
        ce_blob = bucket.blob(ce_blob_name)
        pe_blob = bucket.blob(pe_blob_name)

        ce_exists = _retry(
            lambda: bool(ce_blob.exists()),
            runtime_config.retry_attempts,
            runtime_config.retry_initial_delay,
            runtime_config.retry_max_delay,
            f"GCS exists check for {Path(ce_blob_name).name}",
        )
        pe_exists = _retry(
            lambda: bool(pe_blob.exists()),
            runtime_config.retry_attempts,
            runtime_config.retry_initial_delay,
            runtime_config.retry_max_delay,
            f"GCS exists check for {Path(pe_blob_name).name}",
        )

        check = ExpiryFileCheck(
            trade_date=trade_date,
            expiry=expiry,
            ce_blob_name=ce_blob_name,
            pe_blob_name=pe_blob_name,
            ce_exists=ce_exists,
            pe_exists=pe_exists,
        )
        checks.append(check)

        print(f"Trade Date: {trade_date.isoformat()}", flush=True)
        print(f"Expiry: {expiry.isoformat()}", flush=True)
        print(f"Expected CE filename: {Path(ce_blob_name).name}", flush=True)
        print(f"Expected PE filename: {Path(pe_blob_name).name}", flush=True)
        print(f"Exists CE = {ce_exists}", flush=True)
        print(f"Exists PE = {pe_exists}", flush=True)
        print("", flush=True)

        if not ce_exists or not pe_exists:
            _log(
                logger,
                "warning",
                "missing_nifty_expiry_file",
                trade_date=trade_date.isoformat(),
                expiry=expiry.isoformat(),
                missing_files=check.missing_blob_names,
                ce_exists=ce_exists,
                pe_exists=pe_exists,
            )
            continue

        source_files.append(
            SourceFile(blob_name=ce_blob_name, symbol="NIFTY", expiry=expiry, option_type="CE")
        )
        source_files.append(
            SourceFile(blob_name=pe_blob_name, symbol="NIFTY", expiry=expiry, option_type="PE")
        )

    return source_files, checks


def run_loader(
    *,
    runtime_config: RuntimeConfig,
    supabase_config: SupabaseConfig,
    gcs_config: GCSConfig,
    logger: logging.Logger,
    universe_config_name: str | None = None,
    dry_run: bool = False,
) -> LoadSummary:
    writer = SupabaseWriter(
        supabase_config,
        retry_attempts=runtime_config.retry_attempts,
        retry_initial_delay=runtime_config.retry_initial_delay,
        retry_max_delay=runtime_config.retry_max_delay,
    )

    universe_config = writer.fetch_universe_config(universe_config_name)
    _log(
        logger,
        "info",
        "universe_config_loaded",
        config=universe_config.config_name,
        from_date=universe_config.from_date.isoformat(),
        to_date=universe_config.to_date.isoformat(),
        min_dte=universe_config.min_dte,
        max_dte=universe_config.max_dte,
        premium_min=universe_config.premium_min,
        premium_max=universe_config.premium_max,
        option_type=universe_config.option_type,
    )

    calendar_rows = writer.fetch_date_selection_rows(universe_config.from_date, universe_config.to_date)

    storage_client = build_storage_client(gcs_config)
    source_files, _expiry_checks = _check_nifty_expiry_files(
        storage_client=storage_client,
        gcs_config=gcs_config,
        runtime_config=runtime_config,
        logger=logger,
        calendar_rows=calendar_rows,
    )

    summary = LoadSummary(files_seen=len(source_files))
    group_map: dict[tuple[date, date], DailyUniverseGroup] = {}

    for source_file in source_files:
        if universe_config.option_type in {"CE", "PE"} and source_file.option_type != universe_config.option_type:
            _log(
                logger,
                "info",
                "file_skipped_by_option_type",
                file=source_file.blob_name,
                option_type=source_file.option_type,
            )
            continue

        parquet_path = download_parquet_file(
            storage_client,
            gcs_config.bucket_name,
            source_file,
            runtime_config.retry_attempts,
            runtime_config.retry_initial_delay,
            runtime_config.retry_max_delay,
        )

        try:
            file_result: BuildResult = build_file_day_batches(
                parquet_path,
                source_file=source_file.blob_name,
                symbol=source_file.symbol,
                file_expiry=source_file.expiry,
                option_type=source_file.option_type,
                config=universe_config,
            )
        finally:
            parquet_path.unlink(missing_ok=True)

        summary.files_loaded += 1
        summary.raw_rows_read += file_result.raw_rows_read
        summary.rows_after_date_filter += file_result.rows_after_date_filter
        summary.aggregated_rows_produced += file_result.aggregated_rows_produced
        summary.qualified_strikes += file_result.qualified_strikes
        summary.aggregation_runtime_seconds += file_result.aggregation_runtime_seconds
        for batch in file_result.batches:
            _merge_batch(group_map, batch)

    summary.groups_found = len(group_map)
    if not group_map:
        _log(logger, "info", "no_groups_found", files_seen=summary.files_seen, files_loaded=summary.files_loaded)
        return summary

    existing_load_rows = writer.fetch_universe_loads_rows(universe_config.from_date, universe_config.to_date)
    calendar_index = _index_calendar_rows(calendar_rows)
    load_index = _index_load_rows(existing_load_rows)

    candidate_rows: list[dict[str, Any]] = []
    option_series_rows: list[dict[str, Any]] = []
    load_rows: list[dict[str, Any]] = []

    for key in sorted(group_map.keys()):
        group = group_map[key]
        calendar_row = calendar_index.get((group.trade_date.isoformat(), group.expiry.isoformat()))
        if calendar_row is None:
            _log(
                logger,
                "warning",
                "calendar_row_missing",
                trade_date=group.trade_date.isoformat(),
                expiry=group.expiry.isoformat(),
            )
            continue

        dte = int(calendar_row.get("dte") or 0)
        if dte < universe_config.min_dte or dte > universe_config.max_dte:
            _log(
                logger,
                "info",
                "group_skipped_by_dte",
                trade_date=group.trade_date.isoformat(),
                expiry=group.expiry.isoformat(),
                dte=dte,
            )
            continue

        existing = load_index.get((group.trade_date.isoformat(), group.expiry.isoformat()))
        if existing and str(existing.get("load_status") or "").upper() == "LOADED":
            summary.groups_skipped_loaded += 1
            _log(
                logger,
                "info",
                "group_skipped_already_loaded",
                trade_date=group.trade_date.isoformat(),
                expiry=group.expiry.isoformat(),
            )
            continue

        candidate_rows.extend(group.candidate_rows)
        option_series_rows.extend(group.option_series_rows)
        load_rows.append(_build_load_row(group, calendar_row, load_status="LOADED"))

    if dry_run or runtime_config.dry_run:
        summary.candidate_rows = len(candidate_rows)
        summary.option_series_rows = len(option_series_rows)
        summary.load_rows = len(load_rows)
        _log(
            logger,
            "info",
            "dry_run_complete",
            groups=summary.groups_found,
            skipped_loaded=summary.groups_skipped_loaded,
            raw_rows_read=summary.raw_rows_read,
            rows_after_date_filter=summary.rows_after_date_filter,
            aggregated_rows_produced=summary.aggregated_rows_produced,
            qualified_strikes=summary.qualified_strikes,
            candidate_rows=summary.candidate_rows,
            option_series_rows=summary.option_series_rows,
            load_rows=summary.load_rows,
            aggregation_runtime_seconds=round(summary.aggregation_runtime_seconds, 6),
        )
        return summary

    candidate_rows = _dedupe_rows(candidate_rows, ("trade_date", "expiry", "strike", "option_type"))
    option_series_rows = _dedupe_rows(
        option_series_rows,
        ("trade_date", "candle_time", "expiry", "strike", "option_type"),
    )
    load_rows = _dedupe_rows(load_rows, ("trade_date", "expiry"))

    summary.candidate_rows = writer.upsert_rows(
        "candidate_universe",
        candidate_rows,
        conflict_columns="trade_date,expiry,strike,option_type",
    )
    summary.option_series_rows = writer.upsert_rows(
        "option_series",
        option_series_rows,
        conflict_columns="trade_date,candle_time,expiry,strike,option_type",
    )
    summary.load_rows = writer.upsert_load_rows(load_rows)

    _log(
        logger,
        "info",
        "load_complete",
        groups=summary.groups_found,
        skipped_loaded=summary.groups_skipped_loaded,
        raw_rows_read=summary.raw_rows_read,
        rows_after_date_filter=summary.rows_after_date_filter,
        aggregated_rows_produced=summary.aggregated_rows_produced,
        qualified_strikes=summary.qualified_strikes,
        candidate_rows=summary.candidate_rows,
        option_series_rows=summary.option_series_rows,
        load_rows=summary.load_rows,
        aggregation_runtime_seconds=round(summary.aggregation_runtime_seconds, 6),
    )
    return summary


def run_debug_dry_run(
    *,
    runtime_config: RuntimeConfig,
    supabase_config: SupabaseConfig,
    gcs_config: GCSConfig,
    logger: logging.Logger,
    universe_config_name: str | None = None,
    target_symbol: str = "NIFTY",
    target_expiry: date = date(2024, 4, 4),
    target_option_type: str = "CE",
    target_trade_date: date = date(2024, 3, 28),
) -> int:
    current_stage = "1. universe_config load"
    temp_downloads: list[tuple[SourceFile, Path]] = []
    try:
        with StageLogger("1. universe_config load") as stage:
            writer = SupabaseWriter(
                supabase_config,
                retry_attempts=runtime_config.retry_attempts,
                retry_initial_delay=runtime_config.retry_initial_delay,
                retry_max_delay=runtime_config.retry_max_delay,
            )
            universe_config = writer.fetch_universe_config(universe_config_name)
            debug_config = replace(universe_config, from_date=target_trade_date, to_date=target_trade_date)
            stage.rows = 1

        current_stage = "2. date_selection load"
        with StageLogger("2. date_selection load") as stage:
            calendar_rows = writer.fetch_date_selection_rows(universe_config.from_date, universe_config.to_date)
            stage.rows = len(calendar_rows)

        current_stage = "3. NIFTY file existence"
        with StageLogger("3. NIFTY file existence") as stage:
            storage_client = build_storage_client(gcs_config)
            source_files, _ = _check_nifty_expiry_files(
                storage_client=storage_client,
                gcs_config=gcs_config,
                runtime_config=runtime_config,
                logger=logger,
                calendar_rows=[{"trade_date": target_trade_date, "expiry_date": target_expiry}],
            )
            selected_files = [
                source_file
                for source_file in source_files
                if source_file.symbol.upper() == "NIFTY"
                and source_file.expiry == target_expiry
                and source_file.option_type.upper() == target_option_type.upper()
            ]
            stage.rows = len(source_files)

        if not selected_files:
            raise RuntimeError(
                f"No NIFTY parquet file matched expiry={target_expiry.isoformat()}, option_type={target_option_type!r}."
            )

        current_stage = "4. parquet download/open"
        with StageLogger("4. parquet download/open") as stage:
            for source_file in selected_files:
                temp_path = download_parquet_file(
                    storage_client,
                    gcs_config.bucket_name,
                    source_file,
                    runtime_config.retry_attempts,
                    runtime_config.retry_initial_delay,
                    runtime_config.retry_max_delay,
                )
                temp_downloads.append((source_file, temp_path))
            stage.rows = len(temp_downloads)

        total_raw_rows = 0
        total_rows_after_date_filter = 0
        total_aggregated_rows = 0
        total_qualified_strikes = 0
        group_map: dict[tuple[date, date], DailyUniverseGroup] = {}

        current_stage = "5. raw row count"
        with StageLogger("5. raw row count") as stage:
            for _, temp_path in temp_downloads:
                total_raw_rows += _count_raw_rows(temp_path)
            stage.rows = total_raw_rows

        current_stage = "6. date filter"
        with StageLogger("6. date filter") as stage:
            stage.rows = len(temp_downloads)

        current_stage = "7. rows after date filter"
        with StageLogger("7. rows after date filter") as stage:
            for source_file, temp_path in temp_downloads:
                total_rows_after_date_filter += _count_rows_after_date_filter(
                    temp_path,
                    from_date=target_trade_date,
                    to_date=target_trade_date,
                    file_expiry=source_file.expiry,
                    option_type=source_file.option_type,
                )
            stage.rows = total_rows_after_date_filter

        current_stage = "8. DuckDB aggregation start"
        with StageLogger("8. DuckDB aggregation start") as stage:
            for source_file, temp_path in temp_downloads:
                file_result: BuildResult = build_file_day_batches(
                    temp_path,
                    source_file=source_file.blob_name,
                    symbol=source_file.symbol,
                    file_expiry=source_file.expiry,
                    option_type=source_file.option_type,
                    config=debug_config,
                )
                total_aggregated_rows += file_result.aggregated_rows_produced
                total_qualified_strikes += file_result.qualified_strikes
                for batch in file_result.batches:
                    _merge_batch(group_map, batch)
            stage.rows = len(temp_downloads)

        current_stage = "9. aggregation complete"
        with StageLogger("9. aggregation complete") as stage:
            stage.rows = total_aggregated_rows

        current_stage = "10. aggregated row count"
        with StageLogger("10. aggregated row count") as stage:
            stage.rows = total_aggregated_rows

        current_stage = "11. qualification start"
        with StageLogger("11. qualification start") as stage:
            calendar_index = _index_calendar_rows(calendar_rows)
            existing_load_rows = writer.fetch_universe_loads_rows(universe_config.from_date, universe_config.to_date)
            load_index = _index_load_rows(existing_load_rows)
            stage.rows = len(group_map)

        candidate_rows: list[dict[str, Any]] = []
        option_series_rows: list[dict[str, Any]] = []

        current_stage = "12. qualified strike count"
        with StageLogger("12. qualified strike count") as stage:
            stage.rows = total_qualified_strikes

        current_stage = "13. candidate row count"
        with StageLogger("13. candidate row count") as stage:
            for key in sorted(group_map.keys()):
                group = group_map[key]
                calendar_row = calendar_index.get((group.trade_date.isoformat(), group.expiry.isoformat()))
                if calendar_row is None:
                    continue

                dte = int(calendar_row.get("dte") or 0)
                if dte < universe_config.min_dte or dte > universe_config.max_dte:
                    continue

                existing = load_index.get((group.trade_date.isoformat(), group.expiry.isoformat()))
                if existing and str(existing.get("load_status") or "").upper() == "LOADED":
                    continue

                candidate_rows.extend(group.candidate_rows)
                option_series_rows.extend(group.option_series_rows)
            stage.rows = len(candidate_rows)

        current_stage = "14. option_series row count"
        with StageLogger("14. option_series row count") as stage:
            stage.rows = len(option_series_rows)

        current_stage = "15. dry run summary"
        with StageLogger("15. dry run summary") as stage:
            candidate_rows = _dedupe_rows(candidate_rows, ("trade_date", "expiry", "strike", "option_type"))
            option_series_rows = _dedupe_rows(
                option_series_rows,
                ("trade_date", "candle_time", "expiry", "strike", "option_type"),
            )
            stage.rows = len(candidate_rows) + len(option_series_rows)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Raw rows read={total_raw_rows}", flush=True)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Rows after date filter={total_rows_after_date_filter}", flush=True)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Aggregated rows produced={total_aggregated_rows}", flush=True)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Qualified strikes={total_qualified_strikes}", flush=True)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Candidate rows={len(candidate_rows)}", flush=True)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Option series rows={len(option_series_rows)}", flush=True)
            for row in candidate_rows:
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] TRADE {row['trade_date']} {row['expiry']} {row['option_type']} strike={row['strike']} first_seen={row['first_seen_time']} close={row['first_seen_close']}",
                    flush=True,
                )

        return 0
    except Exception as error:
        traceback.print_exc()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] current stage: {current_stage}", flush=True)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] exact exception: {error!r}", flush=True)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] stack trace: see above", flush=True)
        return 1
    finally:
        for _, temp_path in temp_downloads:
            temp_path.unlink(missing_ok=True)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load EMA Intraday option universes from GCS into Supabase.")
    parser.add_argument("--config-name", default="", help="Optional universe_config.config_name override.")
    parser.add_argument("--dry-run", action="store_true", help="Read and build rows without writing to Supabase.")
    parser.add_argument("--debug-dry-run", action="store_true", help="Run the loader in stage-by-stage debug mode.")
    parser.add_argument("--debug-symbol", default="NIFTY", help="Debug file symbol filter.")
    parser.add_argument("--debug-expiry", default="2024-04-04", help="Debug file expiry filter.")
    parser.add_argument("--debug-option-type", default="CE", help="Debug file option type filter.")
    parser.add_argument("--trade-date", default="2024-03-28", help="Trade date to use in debug dry run mode.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    loader_dir = Path(__file__).resolve().parent
    load_dotenv_files(loader_dir)

    runtime_config = load_runtime_config()
    args = parse_args(argv if argv is not None else sys.argv[1:])
    logger = _setup_logger(loader_dir / runtime_config.log_dir, runtime_config.log_level)

    supabase_config = load_supabase_config()
    gcs_config = load_gcs_config()

    if args.debug_dry_run:
        return run_debug_dry_run(
            runtime_config=runtime_config,
            supabase_config=supabase_config,
            gcs_config=gcs_config,
            logger=logger,
            universe_config_name=args.config_name or None,
            target_symbol=args.debug_symbol,
            target_expiry=date.fromisoformat(args.debug_expiry),
            target_option_type=args.debug_option_type,
            target_trade_date=date.fromisoformat(args.trade_date),
        )

    try:
        summary = run_loader(
            runtime_config=runtime_config,
            supabase_config=supabase_config,
            gcs_config=gcs_config,
            logger=logger,
            universe_config_name=args.config_name or None,
            dry_run=args.dry_run,
        )
        print(
            json.dumps(
                {
                    "status": "success",
                    "files_seen": summary.files_seen,
                    "files_loaded": summary.files_loaded,
                    "raw_rows_read": summary.raw_rows_read,
                    "rows_after_date_filter": summary.rows_after_date_filter,
                    "aggregated_rows_produced": summary.aggregated_rows_produced,
                    "qualified_strikes": summary.qualified_strikes,
                    "aggregation_runtime_seconds": round(summary.aggregation_runtime_seconds, 6),
                    "groups_found": summary.groups_found,
                    "groups_skipped_loaded": summary.groups_skipped_loaded,
                    "candidate_rows": summary.candidate_rows,
                    "option_series_rows": summary.option_series_rows,
                    "load_rows": summary.load_rows,
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as error:  # pragma: no cover - runtime surfaced through logger/CLI
        _log(logger, "error", "loader_failed", message=str(error))
        print(json.dumps({"status": "error", "message": str(error)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
