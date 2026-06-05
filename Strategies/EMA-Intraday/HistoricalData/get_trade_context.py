#!/usr/bin/env python3

from __future__ import annotations

import json
import sqlite3
import os
import sys
from datetime import datetime
from pathlib import Path

import requests


def emit(payload: dict) -> int:
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
        os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or ""
    ).strip()

    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase configuration is missing.")

    return supabase_url.rstrip("/"), supabase_key


def fetch_expiry_row(trade_date: str, fallback: bool = False):
    supabase_url, supabase_key = get_supabase_config()
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Accept-Profile": "ideal_trades",
    }
    params = {
        "select": "trade_date,expiry_date,dte,eff_dte",
        "order": "trade_date.asc",
        "limit": 1,
    }

    if fallback:
        params["trade_date"] = f"gte.{trade_date}"
    else:
        params["trade_date"] = f"eq.{trade_date}"

    response = requests.get(
        f"{supabase_url}/rest/v1/expiry_calendar",
        headers=headers,
        params=params,
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError(
            f"Supabase request failed with HTTP {response.status_code}: {response.text[:300]}"
        )

    payload = response.json()
    if not isinstance(payload, list):
        raise RuntimeError("Supabase returned an unexpected payload.")

    return payload[0] if payload else None


def main() -> int:
    if len(sys.argv) < 2:
        return fail("Missing trade date.")

    trade_date = sys.argv[1].strip()
    try:
        datetime.strptime(trade_date, "%Y-%m-%d")
    except ValueError:
        return fail("Trade date must be in YYYY-MM-DD format.")

    data_dir = Path(__file__).resolve().parent / "Data"
    candles_db = data_dir / "ema_intraday_historical.db"

    if not candles_db.exists():
        return fail("Historical candles database was not found.")

    try:
        with sqlite3.connect(candles_db) as candles_con:
            candles_cur = candles_con.cursor()

            atm_row = candles_cur.execute(
                'SELECT MAX("ATM") FROM candles WHERE "Date" = ? AND "ATM" IS NOT NULL',
                (trade_date,),
            ).fetchone()
            atm_strike = int(round(atm_row[0])) if atm_row and atm_row[0] is not None else None
            atm_source_date = trade_date if atm_strike is not None else None

            if atm_strike is None:
                fallback_atm_row = candles_cur.execute(
                    'SELECT "Date", MAX("ATM") FROM candles WHERE "Date" <= ? AND "ATM" IS NOT NULL GROUP BY "Date" ORDER BY "Date" DESC LIMIT 1',
                    (trade_date,),
                ).fetchone()
                if fallback_atm_row and fallback_atm_row[1] is not None:
                    atm_source_date = str(fallback_atm_row[0])
                    atm_strike = int(round(fallback_atm_row[1]))

            expiry = None
            expiry_source_date = None
            expiry_row = fetch_expiry_row(trade_date, fallback=False)
            if expiry_row:
                expiry = str(expiry_row.get("expiry_date") or "")
                expiry_source_date = str(expiry_row.get("trade_date") or "")
            else:
                fallback_expiry_row = fetch_expiry_row(trade_date, fallback=True)
                if fallback_expiry_row:
                    expiry = str(fallback_expiry_row.get("expiry_date") or "")
                    expiry_source_date = str(fallback_expiry_row.get("trade_date") or "")

            if atm_strike is None:
                return fail(f'ATM strike not found for {trade_date}.')
            if expiry is None:
                return fail(f'Expiry not found for {trade_date}.')

            return emit(
                {
                    "status": "success",
                    "tradeDate": trade_date,
                    "atmStrike": atm_strike,
                    "expiry": expiry,
                    "atmSourceDate": atm_source_date,
                    "expirySourceDate": expiry_source_date,
                }
            )
    except Exception as error:
        return fail(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
