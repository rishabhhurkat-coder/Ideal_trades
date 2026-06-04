#!/usr/bin/env python3

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path


def emit(payload: dict) -> int:
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def fail(message: str) -> int:
    return emit({"status": "error", "message": message})


def read_expiry_rows(cur: sqlite3.Cursor):
    return cur.execute(
        """
        SELECT
            "Expiry",
            MIN(CASE WHEN "DTE" IN (0, 1) THEN "Date" END) AS first_date,
            MAX(CASE WHEN "DTE" IN (0, 1) THEN "Date" END) AS last_date,
            SUM(CASE WHEN "DTE" IN (0, 1) THEN 1 ELSE 0 END) AS eligible_dates
        FROM expiry_dte
        GROUP BY "Expiry"
        ORDER BY first_date IS NULL, first_date ASC, "Expiry" ASC
        """
    ).fetchall()


def main() -> int:
    data_dir = Path(__file__).resolve().parent / "Data"
    expiry_db = data_dir / "nifty_expiry_dte.db"

    if not expiry_db.exists():
        return fail("Expiry database was not found.")

    expiry = sys.argv[1].strip() if len(sys.argv) > 1 else ""

    try:
        with sqlite3.connect(expiry_db) as con:
            cur = con.cursor()

            if not expiry:
                rows = read_expiry_rows(cur)
                return emit(
                    {
                        "status": "success",
                        "expiries": [
                            {
                                "expiry": str(row[0]),
                                "firstDate": str(row[1] or ""),
                                "lastDate": str(row[2] or ""),
                                "eligibleDates": int(row[3] or 0),
                            }
                            for row in rows
                        ],
                    }
                )

            dates = cur.execute(
                """
                SELECT "Date", "DTE"
                FROM expiry_dte
                WHERE "Expiry" = ? AND "DTE" IN (0, 1)
                ORDER BY "Date" ASC, "DTE" ASC
                """,
                (expiry,),
            ).fetchall()

            return emit(
                {
                    "status": "success",
                    "expiry": expiry,
                    "dates": [
                        {
                            "date": str(row[0]),
                            "dte": int(row[1]),
                        }
                        for row in dates
                    ],
                }
            )
    except Exception as error:
        return fail(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
