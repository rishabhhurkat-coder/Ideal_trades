import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


SYMBOL = "NIFTY 50"
EMA_LENGTH = 1000
EMA_ALPHA = 2 / (EMA_LENGTH + 1)


def parse_timestamp(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S%z")


def mround(value: float, multiple: int) -> int:
    return int(round(value / multiple) * multiple)


def load_candles_from_text(raw_text: str) -> list[dict]:
    raw_text = raw_text.strip()
    if not raw_text:
        return []

    rows = json.loads(raw_text)
    if not isinstance(rows, list):
        return []

    candles = [row for row in rows if isinstance(row, dict)]
    return sorted(candles, key=lambda row: row.get("timestamp", ""))


def load_candles(data_dir: Path) -> list[dict]:
    candles_dir = data_dir / "candles"
    candles: list[dict] = []

    for file_path in sorted(candles_dir.glob("*.json")):
        with file_path.open("r", encoding="utf-8") as file:
            rows = json.load(file)
            if isinstance(rows, list):
                candles.extend(row for row in rows if isinstance(row, dict))

    return sorted(candles, key=lambda row: row.get("timestamp", ""))


def load_incremental_candles(batch_path: Path) -> list[dict]:
    with batch_path.open("r", encoding="utf-8") as file:
        return load_candles_from_text(file.read())


def load_incremental_candles_from_stdin() -> list[dict]:
    return load_candles_from_text(sys.stdin.read())


def build_rows(candles: list[dict]) -> list[tuple]:
    atm_by_date: dict[str, int] = {}

    for candle in candles:
        timestamp = parse_timestamp(candle["timestamp"])
        if timestamp.strftime("%H:%M") == "09:18":
            atm_by_date[timestamp.strftime("%Y-%m-%d")] = mround(float(candle["close"]), 100)

    rows: list[tuple] = []
    ema_value: float | None = None
    previous_close: float | None = None
    previous_ema: float | None = None

    for candle in candles:
        timestamp = parse_timestamp(candle["timestamp"])
        close = float(candle["close"])
        ema_value = close if ema_value is None else (close * EMA_ALPHA) + (ema_value * (1 - EMA_ALPHA))

        interaction = ""
        if previous_close is not None and previous_ema is not None:
            if previous_close <= previous_ema and close > ema_value:
                interaction = "Crossing Above"
            elif previous_close >= previous_ema and close < ema_value:
                interaction = "Crossing Below"

        trade_date = timestamp.strftime("%Y-%m-%d")
        rows.append(
            (
                SYMBOL,
                trade_date,
                timestamp.strftime("%H:%M"),
                float(candle["open"]),
                float(candle["high"]),
                float(candle["low"]),
                close,
                atm_by_date.get(trade_date),
                round(ema_value, 6),
                interaction,
            )
        )

        previous_close = close
        previous_ema = ema_value

    return rows


def write_database(data_dir: Path, rows: list[tuple]) -> Path:
    db_path = data_dir / "ema_intraday_historical.db"
    connection = sqlite3.connect(db_path)

    try:
        cursor = connection.cursor()
        cursor.execute("DROP TABLE IF EXISTS candles")
        cursor.execute(
            """
            CREATE TABLE candles (
              "Scrip" TEXT NOT NULL,
              "Date" TEXT NOT NULL,
              "Time" TEXT NOT NULL,
              "Open" REAL NOT NULL,
              "High" REAL NOT NULL,
              "Low" REAL NOT NULL,
              "Close" REAL NOT NULL,
              "ATM" INTEGER,
              "EMA 1000" REAL NOT NULL,
              "1000 EMA Interation" TEXT NOT NULL,
              PRIMARY KEY ("Scrip", "Date", "Time")
            )
            """
        )
        cursor.executemany(
            """
            INSERT INTO candles (
              "Scrip",
              "Date",
              "Time",
              "Open",
              "High",
              "Low",
              "Close",
              "ATM",
              "EMA 1000",
              "1000 EMA Interation"
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_candles_date_time ON candles ("Date", "Time")')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_candles_interaction ON candles ("1000 EMA Interation")')
        connection.commit()
    finally:
        connection.close()

    return db_path


def read_database_summary(data_dir: Path) -> dict:
    db_path = data_dir / "ema_intraday_historical.db"
    if not db_path.exists():
        return {
            "status": "success",
            "dbPath": str(db_path),
            "records": 0,
            "firstCandle": "",
            "lastCandle": "",
        }

    connection = sqlite3.connect(db_path)

    try:
        cursor = connection.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='candles'")
        if cursor.fetchone() is None:
            return {
                "status": "success",
                "dbPath": str(db_path),
                "records": 0,
                "firstCandle": "",
                "lastCandle": "",
            }

        cursor.execute('SELECT COUNT(*) FROM candles')
        records = int(cursor.fetchone()[0] or 0)

        if records == 0:
            return {
                "status": "success",
                "dbPath": str(db_path),
                "records": 0,
                "firstCandle": "",
                "lastCandle": "",
            }

        cursor.execute('SELECT "Date", "Time" FROM candles ORDER BY "Date" ASC, "Time" ASC LIMIT 1')
        first_row = cursor.fetchone()
        cursor.execute('SELECT "Date", "Time" FROM candles ORDER BY "Date" DESC, "Time" DESC LIMIT 1')
        last_row = cursor.fetchone()

        def build_timestamp(row: tuple | None) -> str:
            if row is None:
                return ""

            trade_date, trade_time = row
            return f"{trade_date}T{trade_time}:00+0530"

        return {
            "status": "success",
            "dbPath": str(db_path),
            "records": records,
            "firstCandle": build_timestamp(first_row),
            "lastCandle": build_timestamp(last_row),
        }
    finally:
        connection.close()


def rebuild_database(data_dir: Path) -> dict:
    candles = load_candles(data_dir)
    rows = build_rows(candles)
    db_path = write_database(data_dir, rows)

    return {
        "status": "success",
        "dbPath": str(db_path),
        "records": len(rows),
    }


def append_database(data_dir: Path, batch_path: Path) -> dict:
    db_path = data_dir / "ema_intraday_historical.db"
    candles = load_incremental_candles(batch_path) if batch_path.name != "-" else load_incremental_candles_from_stdin()

    if not candles:
        return {
            "status": "success",
            "dbPath": str(db_path),
            "records": 0,
        }

    if not db_path.exists():
        rows = build_rows(candles)
        db_path = write_database(data_dir, rows)
        return {
            "status": "success",
            "dbPath": str(db_path),
            "records": len(rows),
        }

    connection = sqlite3.connect(db_path)

    try:
        cursor = connection.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='candles'")
        if cursor.fetchone() is None:
            connection.close()
            rows = build_rows(candles)
            db_path = write_database(data_dir, rows)
            return {
                "status": "success",
                "dbPath": str(db_path),
                "records": len(rows),
            }

        cursor.execute(
            'SELECT "Date", "Time", "Close", "EMA 1000" FROM candles ORDER BY "Date" DESC, "Time" DESC LIMIT 1'
        )
        last_row = cursor.fetchone()
        if last_row is None:
            connection.close()
            rows = build_rows(candles)
            db_path = write_database(data_dir, rows)
            return {
                "status": "success",
                "dbPath": str(db_path),
                "records": len(rows),
            }

        existing_dates = sorted({parse_timestamp(candle["timestamp"]).strftime("%Y-%m-%d") for candle in candles})
        atm_by_date: dict[str, int] = {}

        if existing_dates:
            placeholders = ",".join("?" for _ in existing_dates)
            cursor.execute(
                f'SELECT "Date", MAX("ATM") FROM candles WHERE "Date" IN ({placeholders}) GROUP BY "Date"',
                existing_dates,
            )
            for trade_date, atm in cursor.fetchall():
                if atm is not None:
                    atm_by_date[str(trade_date)] = int(atm)

        batch_by_date: dict[str, list[dict]] = {}
        for candle in candles:
            trade_date = parse_timestamp(candle["timestamp"]).strftime("%Y-%m-%d")
            batch_by_date.setdefault(trade_date, []).append(candle)

        for trade_date, date_candles in batch_by_date.items():
            if trade_date in atm_by_date:
                continue

            for candle in date_candles:
                timestamp = parse_timestamp(candle["timestamp"])
                if timestamp.strftime("%H:%M") == "09:18":
                    atm_by_date[trade_date] = mround(float(candle["close"]), 100)
                    break

        previous_close = float(last_row[2])
        previous_ema = float(last_row[3])
        rows: list[tuple] = []

        for candle in candles:
            timestamp = parse_timestamp(candle["timestamp"])
            close = float(candle["close"])
            ema_value = (close * EMA_ALPHA) + (previous_ema * (1 - EMA_ALPHA))

            interaction = ""
            if previous_close <= previous_ema and close > ema_value:
                interaction = "Crossing Above"
            elif previous_close >= previous_ema and close < ema_value:
                interaction = "Crossing Below"

            trade_date = timestamp.strftime("%Y-%m-%d")
            rows.append(
                (
                    SYMBOL,
                    trade_date,
                    timestamp.strftime("%H:%M"),
                    float(candle["open"]),
                    float(candle["high"]),
                    float(candle["low"]),
                    close,
                    atm_by_date.get(trade_date),
                    round(ema_value, 6),
                    interaction,
                )
            )

            previous_close = close
            previous_ema = ema_value

        cursor.executemany(
            """
            INSERT OR IGNORE INTO candles (
              "Scrip",
              "Date",
              "Time",
              "Open",
              "High",
              "Low",
              "Close",
              "ATM",
              "EMA 1000",
              "1000 EMA Interation"
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_candles_date_time ON candles ("Date", "Time")')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_candles_interaction ON candles ("1000 EMA Interation")')
        connection.commit()

        return {
            "status": "success",
            "dbPath": str(db_path),
            "records": len(rows),
        }
    finally:
        connection.close()


def main() -> int:
    if len(sys.argv) not in (2, 3, 4):
        print(
            json.dumps(
                {
                    "status": "error",
                    "message": "Usage: build_historical_db.py <data_dir> [--append-candles <batch_path>|-] [--summary]",
                }
            )
        )
        return 2

    data_dir = Path(sys.argv[1])
    if len(sys.argv) == 3 and sys.argv[2] == "--summary":
        result = read_database_summary(data_dir)
        print(json.dumps(result))
        return 0

    if len(sys.argv) == 4:
        if sys.argv[2] != "--append-candles":
            print(json.dumps({"status": "error", "message": "Unknown argument: " + sys.argv[2]}))
            return 2

        result = append_database(data_dir, Path(sys.argv[3]))
        print(json.dumps(result))
        return 0

    result = rebuild_database(data_dir)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
