#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from kiteconnect import KiteConnect
from supabase import create_client


IST = ZoneInfo("Asia/Kolkata")

PROJECT_ROOT = Path(r"G:\My Drive\H&L\Ideal Trades")
HISTORICAL_DATA_DIR = PROJECT_ROOT / "Strategies" / "EMA-Intraday" / "HistoricalData"
TEMP_DIR = HISTORICAL_DATA_DIR / "Data" / "temp"

ENV_FILE = PROJECT_ROOT / "Strategies" / "EMA-Intraday" / "Loader" / ".env"
TOKEN_FILE = Path(r"G:\My Drive\H&L\Individual Trades Codes - Copy\Data Files\token.json")

KITE_API_KEY = "zz9755o0bpmqlz0u"
NIFTY_INSTRUMENT_TOKEN = 256265
LOOKBACK_CANDLES = 2000
INTERVAL_MINUTES = 3
EMA_LENGTH = 1000
EMA_ALPHA = 2 / (EMA_LENGTH + 1)
SYMBOL = "NIFTY 50"
SCHEMA_NAME = "emaintraday"
TABLE_NAME = "date_selection"


@dataclass(slots=True)
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


def log(message: str) -> None:
    print(message, flush=True)


def parse_date_key(value: str) -> date:
    return date.fromisoformat(value)


def round_to_hundred(value: float) -> int:
    return int(round(value / 100.0) * 100)


def to_float(value) -> float:
    if value is None:
        raise ValueError("Missing numeric value from Kite candle.")
    return float(value)


def parse_kite_timestamp(value) -> datetime:
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


def load_runtime_config() -> None:
    load_dotenv(ENV_FILE)


def get_supabase_client():
    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip()
    supabase_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is missing.")
    if not supabase_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing.")

    return create_client(supabase_url, supabase_key)


def get_access_token() -> str:
    if not TOKEN_FILE.exists():
        raise FileNotFoundError(f"Token file not found: {TOKEN_FILE}")

    with TOKEN_FILE.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError("access_token not found in token.json")

    return access_token


def fetch_latest_row(supabase_client) -> dict:
    response = (
        supabase_client.schema(SCHEMA_NAME)
        .table(TABLE_NAME)
        .select("*")
        .order("Date", desc=True)
        .limit(1)
        .execute()
    )

    if getattr(response, "error", None) is not None:
        raise RuntimeError(str(getattr(response.error, "message", response.error)))

    rows = getattr(response, "data", None) or []
    if not rows:
        raise RuntimeError("No rows found in emaintraday.date_selection.")

    row = rows[0]
    log("STEP 1: Latest row from emaintraday.date_selection")
    log(json.dumps(row, ensure_ascii=False))
    return row


def download_kite_candles(start_dt: datetime, end_dt: datetime) -> list[Candle]:
    kite = KiteConnect(api_key=KITE_API_KEY)
    kite.set_access_token(get_access_token())

    candles = kite.historical_data(
        instrument_token=NIFTY_INSTRUMENT_TOKEN,
        from_date=start_dt,
        to_date=end_dt,
        interval="3minute",
        continuous=False,
        oi=False,
    )

    if not candles:
        raise RuntimeError("No candles returned from Kite.")

    result: list[Candle] = []
    for item in candles:
        timestamp = parse_kite_timestamp(item.get("date"))
        result.append(
            Candle(
                timestamp=timestamp,
                open=to_float(item.get("open")),
                high=to_float(item.get("high")),
                low=to_float(item.get("low")),
                close=to_float(item.get("close")),
                volume=to_float(item.get("volume")),
            )
        )

    result.sort(key=lambda candle: candle.timestamp)
    return result


def fetch_latest_nifty_weekly_expiry() -> str:
    kite = KiteConnect(api_key=KITE_API_KEY)
    kite.set_access_token(get_access_token())

    instruments = kite.instruments("NFO")
    today = datetime.now(tz=IST).date()

    expiries: list[date] = []
    for item in instruments:
        if str(item.get("name") or "").upper() != "NIFTY":
            continue
        if str(item.get("instrument_type") or "").upper() not in {"CE", "PE"}:
            continue

        expiry_value = item.get("expiry")
        if isinstance(expiry_value, datetime):
            expiry_date = expiry_value.date()
        elif isinstance(expiry_value, date):
            expiry_date = expiry_value
        elif isinstance(expiry_value, str) and expiry_value.strip():
            expiry_date = date.fromisoformat(expiry_value[:10])
        else:
            continue

        if expiry_date >= today:
            expiries.append(expiry_date)

    if not expiries:
        raise RuntimeError("Unable to determine the latest weekly NIFTY expiry from Kite instruments.")

    return min(expiries).isoformat()


def build_daily_rows(raw_candles: list[Candle], reference_row: dict, expiry: str) -> list[dict]:
    raw_candles.sort(key=lambda candle: candle.timestamp)

    candles_by_date: dict[str, list[Candle]] = {}
    for candle in raw_candles:
        candles_by_date.setdefault(candle.timestamp.date().isoformat(), []).append(candle)

    ordered_dates = sorted(candles_by_date.keys())
    if not ordered_dates:
        return []

    reference_date = parse_date_key(str(reference_row["Date"]))
    latest_existing_candle_no = int(reference_row.get("Candle No") or 0)
    previous_ema = float(reference_row.get("EMA 1000") or 0.0)

    daily_rows: list[dict] = []
    candle_no = latest_existing_candle_no
    previous_day_last_close = None

    for current_date in ordered_dates:
        day_candles = candles_by_date[current_date]
        day_candles.sort(key=lambda candle: candle.timestamp)

        current_day_last_close = day_candles[-1].close

        if parse_date_key(current_date) <= reference_date:
            previous_day_last_close = current_day_last_close
            continue

        first_candle = day_candles[0]
        if previous_day_last_close is None:
            prev_close = first_candle.close
        else:
            prev_close = previous_day_last_close

        candle_no += 1
        ema_value = (first_candle.close * EMA_ALPHA) + (previous_ema * (1 - EMA_ALPHA))
        ema_distance = abs(first_candle.close - ema_value)
        gap_value = first_candle.close - prev_close
        if gap_value > 120:
            gap_status = "GAP UP"
        elif gap_value < -120:
            gap_status = "GAP DN"
        else:
            gap_status = "NO GAP"

        if ema_distance < 150:
            ema_status = "Near EMA"
        else:
            ema_status = "Far EMA"

        atm_candle = next((candle for candle in day_candles if candle.timestamp.strftime("%H:%M") == "09:18"), None)
        atm_value = round_to_hundred(atm_candle.close) if atm_candle is not None else round_to_hundred(first_candle.close)

        daily_rows.append(
            {
                "Scrip": SYMBOL,
                "Date": current_date,
                "Open": round(first_candle.open, 6),
                "High": round(first_candle.high, 6),
                "Low": round(first_candle.low, 6),
                "Close": round(first_candle.close, 6),
                "ATM": atm_value,
                "EMA 1000": round(ema_value, 6),
                "GAP": round(gap_value, 6),
                "GAP_STATUS": gap_status,
                "EMA Distance": round(ema_distance, 6),
                "EMA_Status": ema_status,
                "Candle No": candle_no,
                "prev_close": round(prev_close, 6),
                "expiry": expiry,
                "dte": max((parse_date_key(expiry) - parse_date_key(current_date)).days, 0),
                "eff_dte": max((parse_date_key(expiry) - parse_date_key(current_date)).days, 0),
            }
        )

        previous_ema = ema_value
        previous_day_last_close = current_day_last_close

    return daily_rows


def write_temp_file(raw_candles: list[Candle]) -> Path:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=IST).strftime("%Y%m%d-%H%M%S")
    temp_path = TEMP_DIR / f"date_selection_raw_{stamp}.json"

    payload = [
        {
            "timestamp": candle.timestamp.isoformat(),
            "open": candle.open,
            "high": candle.high,
            "low": candle.low,
            "close": candle.close,
            "volume": candle.volume,
        }
        for candle in raw_candles
    ]

    with temp_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)

    return temp_path


def upsert_rows(supabase_client, rows: list[dict]) -> int:
    if not rows:
        return 0

    response = (
        supabase_client.schema(SCHEMA_NAME)
        .table(TABLE_NAME)
        .insert(rows, returning="minimal")
        .execute()
    )

    if getattr(response, "error", None) is not None:
        raise RuntimeError(str(getattr(response.error, "message", response.error)))

    return len(rows)


def main() -> int:
    load_runtime_config()

    supabase_client = get_supabase_client()
    reference_row = fetch_latest_row(supabase_client)

    reference_date = str(reference_row["Date"])
    log(f"STEP 2: Reference date = {reference_date}")

    end_dt = datetime.now(tz=IST).replace(tzinfo=None)
    start_dt = end_dt - timedelta(minutes=LOOKBACK_CANDLES * INTERVAL_MINUTES)
    log(f"STEP 3: Kite lookback window = {start_dt.isoformat()} to {end_dt.isoformat()}")

    raw_candles = download_kite_candles(start_dt=start_dt, end_dt=end_dt)
    log(f"STEP 4: Raw candles downloaded = {len(raw_candles)}")

    temp_file = write_temp_file(raw_candles)
    log(f"STEP 5: Raw candles written to temp file = {temp_file}")

    expiry = fetch_latest_nifty_weekly_expiry()
    log(f"STEP 6: Latest weekly NIFTY expiry = {expiry}")

    rows = build_daily_rows(raw_candles, reference_row, expiry)
    rows = [row for row in rows if int(row.get("dte") or 0) in {0, 1}]
    log(f"STEP 7: Daily rows after filtering by reference date and DTE 0/1 = {len(rows)}")

    if rows:
        log("STEP 8: First processed row")
        log(json.dumps(rows[0], ensure_ascii=False))
        log("STEP 9: Last processed row")
        log(json.dumps(rows[-1], ensure_ascii=False))

    upserted = upsert_rows(supabase_client, rows)
    log(f"STEP 10: Upserted rows into emaintraday.date_selection = {upserted}")

    print(
        json.dumps(
            {
                "status": "success",
                "referenceDate": reference_date,
                "expiry": expiry,
                "rawCandles": len(raw_candles),
                "rowsUpserted": upserted,
                "tempFile": str(temp_file),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
