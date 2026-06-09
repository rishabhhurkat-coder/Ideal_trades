#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from dataclasses import replace
from datetime import date, datetime, time as dt_time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
from dotenv import load_dotenv
from kiteconnect import KiteConnect

from Config import RuntimeConfig, SupabaseConfig, load_dotenv_files, load_runtime_config, load_supabase_config
from SupabaseWriter import SupabaseWriter
from UniverseBuilder import BuildResult, DailyUniverseGroup, FileDayBatch, build_file_day_batches_from_frame


IST = ZoneInfo("Asia/Kolkata")
PROJECT_ROOT = Path(r"G:\My Drive\H&L\Ideal Trades")
ENV_FILE = PROJECT_ROOT / "Strategies" / "EMA-Intraday" / "Loader" / ".env"
TOKEN_FILE = Path(r"G:\My Drive\H&L\Individual Trades Codes - Copy\Data Files\token.json")
KITE_API_KEY = "zz9755o0bpmqlz0u"


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def load_runtime_environment() -> None:
    load_dotenv_files(Path(__file__).resolve().parent)
    load_dotenv(ENV_FILE, override=False)


def get_access_token() -> str:
    if not TOKEN_FILE.exists():
        raise FileNotFoundError(f"Token file not found: {TOKEN_FILE}")

    with TOKEN_FILE.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("access_token not found in token.json")
    return access_token


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def parse_kite_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str):
        normalized = value.strip()
        if "T" not in normalized and " " in normalized:
            normalized = normalized.replace(" ", "T", 1)
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        timestamp = datetime.fromisoformat(normalized)
    else:
        raise ValueError(f"Unsupported timestamp value: {value!r}")

    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=IST)
    return timestamp.astimezone(IST)


def _retry(func, attempts: int, initial_delay: float, max_delay: float, retry_label: str):
    delay = initial_delay
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            return func()
        except Exception as error:  # pragma: no cover - surfaced in runtime logs
            last_error = error
            if attempt >= attempts:
                break
            time.sleep(delay)
            delay = min(delay * 2, max_delay)

    if last_error is not None:
        raise RuntimeError(f"{retry_label} failed after {attempts} attempts: {last_error}") from last_error
    raise RuntimeError(f"{retry_label} failed.")


def _setup_logger(log_dir: Path, log_level: str):
    import logging

    log_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("ema_intraday_direct_kite_loader")
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    logger.handlers.clear()
    logger.propagate = False

    formatter = logging.Formatter("%(message)s")
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    stdout_handler.setLevel(logger.level)
    file_handler = logging.FileHandler(
        log_dir / f"DirectKitePendingLoader-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log",
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logger.level)

    logger.addHandler(stdout_handler)
    logger.addHandler(file_handler)
    return logger


def _log(logger, level: str, event: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.now(ZoneInfo("UTC")).isoformat(),
        "level": level.upper(),
        "event": event,
        **fields,
    }
    getattr(logger, level.lower(), logger.info)(json.dumps(payload, ensure_ascii=False, default=str))


def _expiry_matches(value: Any, expiry: date) -> bool:
    if isinstance(value, datetime):
        return value.date() == expiry
    if isinstance(value, date):
        return value == expiry
    if isinstance(value, str):
        return value.strip()[:10] == expiry.isoformat()
    return False


def _matching_instruments(instruments: list[dict[str, Any]], *, expiry: date, option_type: str) -> list[dict[str, Any]]:
    matches = [
        item
        for item in instruments
        if str(item.get("name") or "").upper() == "NIFTY"
        and str(item.get("instrument_type") or "").upper() == option_type
        and _expiry_matches(item.get("expiry"), expiry)
    ]
    matches.sort(key=lambda item: (float(item.get("strike") or 0), str(item.get("tradingsymbol") or "")))
    return matches


def _download_option_rows(
    kite: KiteConnect,
    *,
    instruments: list[dict[str, Any]],
    trade_date: date,
    expiry: date,
    option_type: str,
    logger,
    retry_attempts: int,
    retry_initial_delay: float,
    retry_max_delay: float,
) -> list[dict[str, Any]]:
    matching_instruments = _matching_instruments(instruments, expiry=expiry, option_type=option_type)
    if not matching_instruments:
        raise RuntimeError(f"No Kite instruments found for expiry={expiry.isoformat()} and option_type={option_type}.")

    start_dt = datetime.combine(trade_date, dt_time(9, 15))
    end_dt = datetime.combine(trade_date, dt_time(15, 30))
    rows: list[dict[str, Any]] = []

    for index, instrument in enumerate(matching_instruments, start=1):
        instrument_token = int(instrument.get("instrument_token") or 0)
        if not instrument_token:
            continue

        tradingsymbol = str(instrument.get("tradingsymbol") or "")
        strike = instrument.get("strike")
        _log(
            logger,
            "info",
            "kite_instrument_download_started",
            option_type=option_type,
            strike=strike,
            tradingsymbol=tradingsymbol,
            index=index,
            total=len(matching_instruments),
        )

        candles = _retry(
            lambda: kite.historical_data(
                instrument_token=instrument_token,
                from_date=start_dt,
                to_date=end_dt,
                interval="3minute",
                continuous=False,
                oi=False,
            ),
            retry_attempts,
            retry_initial_delay,
            retry_max_delay,
            f"Kite historical_data for {tradingsymbol or instrument_token}",
        )

        for candle in candles or []:
            timestamp = parse_kite_timestamp(candle.get("date"))
            rows.append(
                {
                    "Date": trade_date.isoformat(),
                    "Expiry": expiry.isoformat(),
                    "Option": option_type,
                    "Strike": float(strike) if strike is not None else None,
                    "Time": timestamp.strftime("%H:%M:%S"),
                    "Open": float(candle.get("open")) if candle.get("open") is not None else None,
                    "High": float(candle.get("high")) if candle.get("high") is not None else None,
                    "Low": float(candle.get("low")) if candle.get("low") is not None else None,
                    "Close": float(candle.get("close")) if candle.get("close") is not None else None,
                    "Volume": float(candle.get("volume")) if candle.get("volume") is not None else None,
                }
            )

    return rows


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


def run_loader(
    *,
    runtime_config: RuntimeConfig,
    supabase_config: SupabaseConfig,
    logger,
    universe_config_name: str | None = None,
    dry_run: bool = False,
    trade_date: date,
    expiry: date,
) -> dict[str, Any]:
    writer = SupabaseWriter(
        supabase_config,
        retry_attempts=runtime_config.retry_attempts,
        retry_initial_delay=runtime_config.retry_initial_delay,
        retry_max_delay=runtime_config.retry_max_delay,
    )

    universe_config = writer.fetch_universe_config(universe_config_name)
    universe_config = replace(universe_config, from_date=trade_date, to_date=trade_date)

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

    calendar_rows = writer.fetch_date_selection_rows(trade_date, trade_date)
    calendar_rows = [row for row in calendar_rows if str(row.get("expiry_date") or "") == expiry.isoformat()]
    if not calendar_rows:
        raise RuntimeError(f"No date_selection rows matched trade_date={trade_date.isoformat()} and expiry={expiry.isoformat()}.")

    kite = KiteConnect(api_key=KITE_API_KEY)
    kite.set_access_token(get_access_token())

    instruments = _retry(
        lambda: kite.instruments("NFO"),
        runtime_config.retry_attempts,
        runtime_config.retry_initial_delay,
        runtime_config.retry_max_delay,
        "Kite instruments fetch",
    )

    ce_rows = _download_option_rows(
        kite,
        instruments=instruments,
        trade_date=trade_date,
        expiry=expiry,
        option_type="CE",
        logger=logger,
        retry_attempts=runtime_config.retry_attempts,
        retry_initial_delay=runtime_config.retry_initial_delay,
        retry_max_delay=runtime_config.retry_max_delay,
    )
    pe_rows = _download_option_rows(
        kite,
        instruments=instruments,
        trade_date=trade_date,
        expiry=expiry,
        option_type="PE",
        logger=logger,
        retry_attempts=runtime_config.retry_attempts,
        retry_initial_delay=runtime_config.retry_initial_delay,
        retry_max_delay=runtime_config.retry_max_delay,
    )

    all_rows = ce_rows + pe_rows
    if not all_rows:
        raise RuntimeError("No Kite option candles were returned.")

    frame = pd.DataFrame.from_records(
        all_rows,
        columns=["Date", "Expiry", "Option", "Strike", "Time", "Open", "High", "Low", "Close", "Volume"],
    )

    summary = {
        "trade_date": trade_date.isoformat(),
        "expiry": expiry.isoformat(),
        "ce_instruments": len(_matching_instruments(instruments, expiry=expiry, option_type="CE")),
        "pe_instruments": len(_matching_instruments(instruments, expiry=expiry, option_type="PE")),
        "ce_rows": len(ce_rows),
        "pe_rows": len(pe_rows),
        "raw_rows_read": 0,
        "rows_after_date_filter": 0,
        "aggregated_rows_produced": 0,
        "qualified_strikes": 0,
        "aggregation_runtime_seconds": 0.0,
        "groups_found": 0,
        "groups_skipped_loaded": 0,
        "candidate_rows": 0,
        "option_series_rows": 0,
        "load_rows": 0,
    }

    group_map: dict[tuple[date, date], DailyUniverseGroup] = {}
    try:
        existing_load_rows = writer.fetch_universe_loads_rows(trade_date, trade_date)
        load_index = {(str(row.get("trade_date") or ""), str(row.get("expiry") or "")): row for row in existing_load_rows}

        for option_type in ("CE", "PE"):
            option_frame = frame[frame["Option"].astype(str).str.upper() == option_type].copy()
            if option_frame.empty:
                continue

            file_result: BuildResult = build_file_day_batches_from_frame(
                option_frame,
                source_file="KITE_DIRECT",
                symbol="NIFTY",
                file_expiry=expiry,
                option_type=option_type,
                config=universe_config,
            )

            summary["raw_rows_read"] += file_result.raw_rows_read
            summary["rows_after_date_filter"] += file_result.rows_after_date_filter
            summary["aggregated_rows_produced"] += file_result.aggregated_rows_produced
            summary["qualified_strikes"] += file_result.qualified_strikes
            summary["aggregation_runtime_seconds"] += file_result.aggregation_runtime_seconds

            for batch in file_result.batches:
                _merge_batch(group_map, batch)

        summary["groups_found"] = len(group_map)
        if not group_map:
            _log(logger, "info", "no_groups_found", **summary)
            return summary

        calendar_index = {(str(row.get("trade_date") or ""), str(row.get("expiry_date") or "")): row for row in calendar_rows}
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
                summary["groups_skipped_loaded"] += 1
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
            load_rows.append(
                {
                    "trade_date": group.trade_date.isoformat(),
                    "expiry": group.expiry.isoformat(),
                    "dte": dte,
                    "ce_file": group.ce_file,
                    "pe_file": group.pe_file,
                    "rows_loaded": len(group.option_series_rows),
                    "universe_rows": len(group.candidate_rows),
                    "load_status": "LOADED",
                    "loaded_at": datetime.now(IST).astimezone(ZoneInfo("UTC")).isoformat(),
                }
            )

        if dry_run or runtime_config.dry_run:
            summary["candidate_rows"] = len(candidate_rows)
            summary["option_series_rows"] = len(option_series_rows)
            summary["load_rows"] = len(load_rows)
            _log(logger, "info", "dry_run_complete", **summary)
            return summary

        candidate_rows = _dedupe_rows(candidate_rows, ("trade_date", "expiry", "strike", "option_type"))
        option_series_rows = _dedupe_rows(option_series_rows, ("trade_date", "candle_time", "expiry", "strike", "option_type"))
        load_rows = _dedupe_rows(load_rows, ("trade_date", "expiry"))

        summary["candidate_rows"] = writer.upsert_rows(
            "candidate_universe",
            candidate_rows,
            conflict_columns="trade_date,expiry,strike,option_type",
        )
        summary["option_series_rows"] = writer.upsert_rows(
            "option_series",
            option_series_rows,
            conflict_columns="trade_date,candle_time,expiry,strike,option_type",
        )
        summary["load_rows"] = writer.upsert_load_rows(load_rows)

        _log(logger, "info", "load_complete", **summary)
        return summary
    except Exception:
        raise


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load EMA Intraday option universes directly from Kite into Supabase.")
    parser.add_argument("--config-name", default="", help="Optional universe_config.config_name override.")
    parser.add_argument("--trade-date", required=True, help="Trade date to process in YYYY-MM-DD format.")
    parser.add_argument("--expiry", required=True, help="Expiry date to process in YYYY-MM-DD format.")
    parser.add_argument("--dry-run", action="store_true", help="Read and build rows without writing to Supabase.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    load_runtime_environment()
    runtime_config = load_runtime_config()
    args = parse_args(argv if argv is not None else sys.argv[1:])
    logger = _setup_logger(Path(__file__).resolve().parent / runtime_config.log_dir, runtime_config.log_level)
    supabase_config = load_supabase_config()

    try:
        summary = run_loader(
            runtime_config=runtime_config,
            supabase_config=supabase_config,
            logger=logger,
            universe_config_name=args.config_name or None,
            dry_run=args.dry_run,
            trade_date=parse_date(args.trade_date),
            expiry=parse_date(args.expiry),
        )
        emit({"status": "success", **summary})
        return 0
    except Exception as error:  # pragma: no cover - runtime surfaced through logger/CLI
        _log(logger, "error", "loader_failed", message=str(error))
        emit({"status": "error", "message": str(error)})
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
