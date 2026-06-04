#!/usr/bin/env python3

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


def emit(payload: dict) -> int:
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def fail(message: str) -> int:
    return emit({"status": "error", "message": message})


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
    expiry_db = data_dir / "nifty_expiry_dte.db"

    if not candles_db.exists():
        return fail("Historical candles database was not found.")
    if not expiry_db.exists():
        return fail("Expiry database was not found.")

    try:
        with sqlite3.connect(candles_db) as candles_con, sqlite3.connect(expiry_db) as expiry_con:
            candles_cur = candles_con.cursor()
            expiry_cur = expiry_con.cursor()

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

            expiry_row = expiry_cur.execute(
                'SELECT "Expiry", "Date" FROM expiry_dte WHERE "Date" = ? LIMIT 1',
                (trade_date,),
            ).fetchone()

            expiry = None
            expiry_source_date = None
            if expiry_row:
                expiry = str(expiry_row[0])
                expiry_source_date = str(expiry_row[1])
            else:
                fallback_expiry_row = expiry_cur.execute(
                    'SELECT "Expiry", "Date" FROM expiry_dte WHERE "Date" >= ? ORDER BY "Date" ASC LIMIT 1',
                    (trade_date,),
                ).fetchone()
                if fallback_expiry_row:
                    expiry = str(fallback_expiry_row[0])
                    expiry_source_date = str(fallback_expiry_row[1])

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
