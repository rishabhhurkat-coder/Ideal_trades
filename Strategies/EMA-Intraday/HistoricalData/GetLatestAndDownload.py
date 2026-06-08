from datetime import datetime, timedelta
from pathlib import Path
import json
import os

import pandas as pd
from dotenv import load_dotenv
from kiteconnect import KiteConnect
from supabase import create_client


# =====================================================
# CONFIG
# =====================================================

ENV_FILE = r"G:\My Drive\H&L\Ideal Trades\Strategies\EMA-Intraday - Loader.env"

TOKEN_FILE = (
    r"G:\My Drive\H&L\Individual Trades Codes - Copy\Data Files\token.json"
)

KITE_API_KEY = "zz9755o0bpmqlz0u"

NIFTY_INSTRUMENT_TOKEN = 256265
LOOKBACK_CANDLES = 2000
INTERVAL_MINUTES = 3


# =====================================================
# LOAD ENV
# =====================================================

load_dotenv(ENV_FILE)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL not found in Loader.env")

if not SUPABASE_KEY:
    raise ValueError("SUPABASE_SERVICE_ROLE_KEY not found in Loader.env")


# =====================================================
# LOAD KITE TOKEN
# =====================================================

def get_access_token():

    if not Path(TOKEN_FILE).exists():
        raise FileNotFoundError(
            f"Token file not found:\n{TOKEN_FILE}"
        )

    with open(TOKEN_FILE, "r", encoding="utf-8") as f:
        token_data = json.load(f)

    access_token = token_data.get("access_token")

    if not access_token:
        raise ValueError(
            "access_token not found in token.json"
        )

    return access_token


# =====================================================
# SUPABASE
# =====================================================

def get_latest_candle():

    supabase = create_client(
        SUPABASE_URL,
        SUPABASE_KEY
    )

    result = (
        supabase.schema("emaintraday")
        .table("date_selection")
        .select("Date,Candle No")
        .order("Candle No", desc=True)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise Exception(
            "No records found in emaintraday.date_selection"
        )

    row = result.data[0]

    return {
        "date": row["Date"],
        "candle_no": row["Candle No"]
    }


# =====================================================
# KITE DOWNLOAD
# =====================================================

def download_lookback_candles(latest_date):

    latest_dt = datetime.strptime(
        f"{latest_date} 15:30",
        "%Y-%m-%d %H:%M"
    )

    start_dt = latest_dt - timedelta(
        minutes=LOOKBACK_CANDLES * INTERVAL_MINUTES
    )

    kite = KiteConnect(
        api_key=KITE_API_KEY
    )

    kite.set_access_token(
        get_access_token()
    )

    candles = kite.historical_data(
        instrument_token=NIFTY_INSTRUMENT_TOKEN,
        from_date=start_dt,
        to_date=latest_dt,
        interval="3minute",
        continuous=False,
        oi=False,
    )

    df = pd.DataFrame(candles)

    if df.empty:
        raise Exception(
            "No candles returned from Kite"
        )

    df["Date"] = pd.to_datetime(
        df["date"]
    ).dt.strftime("%Y-%m-%d")

    df["Time"] = pd.to_datetime(
        df["date"]
    ).dt.strftime("%H:%M")

    df.rename(
        columns={
            "open": "Open",
            "high": "High",
            "low": "Low",
            "close": "Close",
            "volume": "Volume"
        },
        inplace=True
    )

    df = df[
        [
            "Date",
            "Time",
            "Open",
            "High",
            "Low",
            "Close",
            "Volume"
        ]
    ]

    return df


# =====================================================
# MAIN
# =====================================================

def run():

    latest = get_latest_candle()

    print("\nLATEST DATE_SELECTION ROW")
    print("-------------------------")
    print("Date      :", latest["date"])
    print("Candle No :", latest["candle_no"])

    df = download_lookback_candles(
        latest["date"]
    )

    print("\nDOWNLOAD SUMMARY")
    print("----------------")
    print("Rows :", len(df))

    print(
        "\nFirst Candle :",
        df.iloc[0]["Date"],
        df.iloc[0]["Time"]
    )

    print(
        "Last Candle  :",
        df.iloc[-1]["Date"],
        df.iloc[-1]["Time"]
    )

    return latest, df


if __name__ == "__main__":
    run()