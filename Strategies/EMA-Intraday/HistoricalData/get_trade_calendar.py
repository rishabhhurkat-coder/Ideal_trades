#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import sys

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


def fetch_expiry_rows(expiry: str | None = None):
    supabase_url, supabase_key = get_supabase_config()
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Accept-Profile": "ideal_trades",
    }
    params = {
        "select": "trade_date,expiry_date,dte,eff_dte",
    }

    if expiry:
        params["expiry_date"] = f"eq.{expiry}"
        params["dte"] = "in.(0,1)"
        params["order"] = "trade_date.asc,dte.asc"
    else:
        params["dte"] = "in.(0,1)"
        params["order"] = "expiry_date.asc,trade_date.asc,dte.asc"

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

    return payload


def to_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def main() -> int:
    expiry = sys.argv[1].strip() if len(sys.argv) > 1 else ""

    try:
        if not expiry:
            rows = fetch_expiry_rows(None)
            grouped: dict[str, dict[str, object]] = {}
            date_index: dict[str, dict[str, object]] = {}
            for row in rows:
                expiry_date = str(row.get("expiry_date") or "")
                trade_date = str(row.get("trade_date") or "")
                dte = to_int(row.get("dte"))
                eff_dte = to_int(row.get("eff_dte"))
                if not expiry_date or not trade_date:
                    continue

                if trade_date not in date_index:
                    date_index[trade_date] = {
                        "date": trade_date,
                        "expiryDate": expiry_date,
                        "dte": dte,
                        "effDte": eff_dte,
                    }

                bucket = grouped.setdefault(
                    expiry_date,
                    {
                        "expiry": expiry_date,
                        "firstDate": trade_date,
                        "lastDate": trade_date,
                        "eligibleDates": 0,
                    },
                )
                if trade_date < str(bucket["firstDate"]):
                    bucket["firstDate"] = trade_date
                if trade_date > str(bucket["lastDate"]):
                    bucket["lastDate"] = trade_date
                bucket["eligibleDates"] = int(bucket["eligibleDates"]) + 1

            expiries = sorted(grouped.values(), key=lambda item: (str(item["firstDate"]), str(item["expiry"])))
            dates = sorted(date_index.values(), key=lambda item: (str(item["date"]), str(item["expiryDate"])))
            return emit({"status": "success", "expiries": expiries, "dates": dates})

        dates = fetch_expiry_rows(expiry)

        return emit(
            {
                "status": "success",
                "expiry": expiry,
                "dates": [
                    {
                        "date": str(row.get("trade_date") or ""),
                        "expiryDate": str(row.get("expiry_date") or expiry),
                        "dte": int(row.get("dte") or 0),
                        "effDte": int(row.get("eff_dte") or 0),
                    }
                    for row in dates
                    if row.get("trade_date")
                ],
            }
        )
    except Exception as error:
        return fail(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
