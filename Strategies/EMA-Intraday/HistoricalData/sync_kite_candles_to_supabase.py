#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from zoneinfo import ZoneInfo

import requests


STATE_KEY = "NIFTY_50_3MIN"
SYMBOL = "NIFTY 50"
INSTRUMENT_TOKEN = 256265
TIMEFRAME = "3 Minute"
INTERVAL = "3minute"
EMA_LENGTH = 1000
EMA_ALPHA = 2 / (EMA_LENGTH + 1)
SOURCE_NAME = "kite_historical"
IST = ZoneInfo("Asia/Kolkata")


@dataclass(slots=True)
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


def emit(payload: dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def fail(message: str) -> int:
    return emit({"status": "error", "message": message})


def get_supabase_config() -> tuple[str, str]:
    supabase_url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("VITE_SUPABASE_URL")
        or ""
    ).strip()
    supabase_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_SECRET_KEY")
        or ""
    ).strip()

    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase configuration is missing.")

    return supabase_url.rstrip("/"), supabase_key


def parse_timestamp(value: str) -> datetime:
    normalized = value.strip()
    if "T" not in normalized and " " in normalized:
        normalized = normalized.replace(" ", "T", 1)
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    if len(normalized) >= 5 and normalized[-5] in {"+", "-"} and normalized[-3] != ":":
        normalized = f"{normalized[:-2]}:{normalized[-2:]}"

    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=IST)
    return parsed.astimezone(IST)


def to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid numeric value: {value!r}")


def round_decimal(value: float | None, places: int = 6) -> float | None:
    if value is None:
        return None
    quant = Decimal("1").scaleb(-places)
    try:
        return float(Decimal(str(value)).quantize(quant, rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError):
        return None


def mround(value: float, multiple: int) -> int:
    return int(round(value / multiple) * multiple)


def load_input_candles() -> list[Candle]:
    raw_text = sys.stdin.read().strip()
    if not raw_text:
        return []

    payload = json.loads(raw_text)
    if not isinstance(payload, list):
        raise ValueError("Expected an array of candles on stdin.")

    candles: list[Candle] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        timestamp_raw = item.get("timestamp")
        if not isinstance(timestamp_raw, str) or not timestamp_raw.strip():
            continue

        candles.append(
            Candle(
                timestamp=parse_timestamp(timestamp_raw),
                open=to_float(item.get("open")),
                high=to_float(item.get("high")),
                low=to_float(item.get("low")),
                close=to_float(item.get("close")),
                volume=to_float(item.get("volume")),
            )
        )

    candles.sort(key=lambda candle: candle.timestamp)
    return candles


def date_key(candle: Candle) -> str:
    return candle.timestamp.strftime("%Y-%m-%d")


def time_key(candle: Candle) -> str:
    return candle.timestamp.strftime("%H:%M")


def candle_timestamp_key(candle_row: dict[str, Any]) -> str:
    trade_date = str(candle_row.get("Date") or candle_row.get("trade_date") or "")
    trade_time = str(candle_row.get("Time") or candle_row.get("trade_time") or "")
    if not trade_date or not trade_time:
        return ""
    if len(trade_time.split(":")) == 2:
        trade_time = f"{trade_time}:00"
    return f"{trade_date}T{trade_time}+05:30"


def upsert_rows(
    supabase_url: str,
    supabase_key: str,
    table: str,
    rows: list[dict[str, Any]],
    conflict_columns: str,
) -> None:
    if not rows:
        return

    response = requests.post(
        f"{supabase_url}/rest/v1/{table}",
        params={"on_conflict": conflict_columns},
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        data=json.dumps(rows),
        timeout=120,
    )

    if not response.ok:
        raise RuntimeError(
            f"Supabase upsert failed for {table} with HTTP {response.status_code}: {response.text[:500]}"
        )


def fetch_current_state(
    supabase_url: str,
    supabase_key: str,
) -> dict[str, Any] | None:
    response = requests.get(
        f"{supabase_url}/rest/v1/nifty_market_state",
        params={
            "select": "state_key,total_records,first_candle,last_candle",
            "state_key": f"eq.{STATE_KEY}",
            "limit": 1,
        },
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Accept-Profile": "ideal_trades",
        },
        timeout=60,
    )
    if not response.ok:
        return None

    payload = response.json()
    if not isinstance(payload, list) or not payload:
        return None

    row = payload[0]
    return row if isinstance(row, dict) else None


def main() -> int:
    candles = load_input_candles()
    if not candles:
        return fail("No candles were provided.")

    try:
        supabase_url, supabase_key = get_supabase_config()
    except Exception as error:
        return fail(str(error))

    previous_close_by_date: dict[str, float] = {}
    grouped: dict[str, list[Candle]] = defaultdict(list)
    for candle in candles:
        grouped[date_key(candle)].append(candle)

    ordered_dates = sorted(grouped.keys())
    previous_day_close: float | None = None
    previous_close: float | None = None
    previous_ema: float | None = None
    rows: list[dict[str, Any]] = []
    day_atm_map: dict[str, int] = {}
    latest_row: dict[str, Any] | None = None

    for current_date in ordered_dates:
        day_candles = grouped[current_date]
        day_candles.sort(key=lambda candle: candle.timestamp)

        day_open = day_candles[0].open
        gap_value = None if previous_day_close is None else day_open - previous_day_close
        gap_percent = None if previous_day_close in (None, 0) else (gap_value / previous_day_close) * 100 if gap_value is not None else None
        if gap_value is None:
            gap_status = "Flat"
        elif gap_value > 0:
            gap_status = "Gap Up"
        elif gap_value < 0:
            gap_status = "Gap Down"
        else:
            gap_status = "Flat"

        day_atm = None
        for candle in day_candles:
            if candle.timestamp.strftime("%H:%M") == "09:18":
                day_atm = mround(candle.close, 100)
                break
        if day_atm is not None:
          day_atm_map[current_date] = day_atm

        for candle in day_candles:
            ema_value = candle.close if previous_ema is None else (candle.close * EMA_ALPHA) + (previous_ema * (1 - EMA_ALPHA))

            ema_interaction = ""
            if previous_close is not None and previous_ema is not None:
                if previous_close <= previous_ema and candle.close > ema_value:
                    ema_interaction = "Crossing Above"
                elif previous_close >= previous_ema and candle.close < ema_value:
                    ema_interaction = "Crossing Below"

            near_ema = abs(candle.close - ema_value)
            row = {
                "Scrip": SYMBOL,
                "Date": current_date,
                "Time": time_key(candle),
                "Open": round_decimal(candle.open),
                "High": round_decimal(candle.high),
                "Low": round_decimal(candle.low),
                "Close": round_decimal(candle.close),
                "ATM": day_atm,
                "EMA 1000": round_decimal(ema_value),
                "GAP": round_decimal(gap_value),
                "GAP_STATUS": gap_status,
                "EMA Distance": round_decimal(near_ema),
                "EMA_Status": ema_interaction,
            }
            rows.append(row)
            latest_row = row
            previous_close = candle.close
            previous_ema = ema_value

        previous_day_close = day_candles[-1].close

    existing_state = fetch_current_state(supabase_url, supabase_key)
    total_records = (int(existing_state.get("total_records") or 0) if existing_state else 0) + len(rows)

    upsert_rows(
        supabase_url,
        supabase_key,
        "candles",
        rows,
        "Scrip,Date,Time",
    )

    latest_state = {
        "state_key": STATE_KEY,
        "symbol": SYMBOL,
        "instrument_token": INSTRUMENT_TOKEN,
        "timeframe": TIMEFRAME,
        "interval": INTERVAL,
        "first_candle": candle_timestamp_key(rows[0]),
        "last_candle": candle_timestamp_key(rows[-1]),
        "latest_candle_timestamp": candle_timestamp_key(latest_row) if latest_row else None,
        "latest_open": latest_row["Open"] if latest_row else None,
        "latest_high": latest_row["High"] if latest_row else None,
        "latest_low": latest_row["Low"] if latest_row else None,
        "latest_close": latest_row["Close"] if latest_row else None,
        "latest_volume": None,
        "latest_atm": latest_row["ATM"] if latest_row else None,
        "latest_ema_1000": latest_row["EMA 1000"] if latest_row else None,
        "latest_ema_interaction": latest_row["EMA_Status"] if latest_row else None,
        "latest_gap_value": latest_row["GAP"] if latest_row else None,
        "latest_gap_percent": None,
        "latest_gap_status": latest_row["GAP_STATUS"] if latest_row else None,
        "latest_near_ema": latest_row["EMA Distance"] if latest_row else None,
        "total_records": total_records,
        "last_update": datetime.now(tz=UTC).isoformat(),
        "source": SOURCE_NAME,
    }

    upsert_rows(
        supabase_url,
        supabase_key,
        "nifty_market_state",
        [latest_state],
        "state_key",
    )

    return emit(
        {
            "status": "success",
            "symbol": SYMBOL,
            "exchange": "NSE",
            "timeframe": TIMEFRAME,
            "interval": INTERVAL,
            "instrumentToken": INSTRUMENT_TOKEN,
            "recordsUpserted": len(rows),
            "firstCandle": candle_timestamp_key(rows[0]),
            "lastCandle": candle_timestamp_key(rows[-1]),
            "downloadStatus": "Completed",
            "metadata": {
                "symbol": SYMBOL,
                "instrument_token": INSTRUMENT_TOKEN,
                "timeframe": TIMEFRAME,
                "first_candle": candle_timestamp_key(rows[0]),
                "last_candle": candle_timestamp_key(rows[-1]),
                "total_records": total_records,
                "last_update": latest_state["last_update"],
            },
            "state": {
                "status": "success",
                "stateKey": STATE_KEY,
                "symbol": SYMBOL,
                "instrumentToken": INSTRUMENT_TOKEN,
                "timeframe": TIMEFRAME,
                "interval": INTERVAL,
                "firstCandle": candle_timestamp_key(rows[0]),
                "lastCandle": candle_timestamp_key(rows[-1]),
                "latestCandleTimestamp": latest_state["latest_candle_timestamp"],
                "latestOpen": latest_state["latest_open"],
                "latestHigh": latest_state["latest_high"],
                "latestLow": latest_state["latest_low"],
                "latestClose": latest_state["latest_close"],
                "latestVolume": latest_state["latest_volume"],
                "latestAtm": latest_state["latest_atm"],
                "latestEma1000": latest_state["latest_ema_1000"],
                "latestEmaInteraction": latest_state["latest_ema_interaction"],
                "latestGapValue": latest_state["latest_gap_value"],
                "latestGapPercent": latest_state["latest_gap_percent"],
                "latestGapStatus": latest_state["latest_gap_status"],
                "latestNearEma": latest_state["latest_near_ema"],
                "totalRecords": total_records,
                "lastUpdate": latest_state["last_update"],
                "source": SOURCE_NAME,
            },
            "database": {
                "status": "success",
                "records": len(rows),
            },
            "supabase": {
                "stateKey": STATE_KEY,
                "candleTable": "public.candles",
                "stateTable": "ideal_trades.nifty_market_state",
            },
            "apiResponseStatus": "success",
        }
    )


if __name__ == "__main__":
    raise SystemExit(main())
