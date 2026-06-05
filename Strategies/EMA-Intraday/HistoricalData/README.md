# EMA Intraday Historical Data

This module owns the EMA Intraday historical data workflow.

Responsibilities:

- Kite authentication
- Local historical candle storage
- Historical data status tracking

Trading logic is intentionally not implemented here yet.

## One-Click NIFTY 50 3 Minute Download

Active download scope:

- Symbol: NIFTY 50
- Instrument token: 256265
- Timeframe: 3 Minute
- First full download start: 2021-01-01

The user clicks `Download Data`. The page checks the current Kite session first.

If the session is valid, the download continues automatically.

If the session is invalid, the page opens Kite login, asks the user to paste `request_token`, generates
the session, and then continues the download automatically.

There are no date pickers in the operational flow. The backend decides the download window from local
storage:

- If no local database metadata exists, it downloads from `2021-01-01 09:15:00` to the current date at `15:30:00`.
- If local candles already exist, it reads metadata/latest candle and downloads only candles after the
  latest stored timestamp.
- Existing candles are appended directly into `ema_intraday_historical.db` and are not staged through JSON files.

Returned candle fields:

- timestamp
- open
- high
- low
- close
- volume

## Local Storage

Downloaded data is stored locally under:

`Strategies/EMA-Intraday/HistoricalData/Data/`

Files:

- `metadata.json`
- `ema_intraday_historical.db`

The active flow no longer uses the yearly `candles/` JSON folder.

### NIFTY Expiry DTE Table

The expiry calendar is stored in Supabase under `ideal_trades.expiry_calendar` and exposes these columns:

- `trade_date`
- `expiry_date`
- `dte`
- `eff_dte`

`dte` is the calendar-day gap between `trade_date` and `expiry_date`.
`eff_dte` is the per-expiry sequence that is `0` on the expiry date and increments backward through earlier rows.
The trade dashboard calendar filter uses `dte = 0` and `dte = 1`.

`metadata.json` contains:

- first_candle
- last_candle
- total_records
- last_update
- instrument_token
- symbol
- timeframe

## Kite Authentication

The backend provides the Kite login URL:

`https://kite.zerodha.com/connect/login?v=3&api_key=<API_KEY>`

After login, the user manually copies the `request_token` and pastes it into the Request Token input.
The frontend automatically sends that pasted token to `/api/kite/session` and continues the download.

The frontend does not read `request_token` from the current browser URL and does not auto-generate a
session from a redirect.

The token endpoint runs on the server and keeps the Kite API secret there. It:

1. Reads `request_token` from the POST body.
2. Generates the Kite checksum with `api_key + request_token + api_secret`.
3. Exchanges the request token with Kite for an access token.
4. Validates the generated token by calling Kite `/user/profile`.
5. Stores the session in local `.kite-session.json`.
6. Returns the Kite user name, user ID, and login time to the frontend.

## Historical Download Endpoint

`Download Data` posts to:

`/api/kite/historical-candles`

The endpoint:

1. Reads the existing `.kite-session.json`.
2. Validates the session with Kite profile.
3. Reads `metadata.json` and, if needed, summarizes `ema_intraday_historical.db` for the current range.
4. Calculates the missing download window.
5. Calls Kite historical API for instrument token `256265` and interval `3minute`.
6. Removes candles already covered by the stored last candle.
7. Appends the new rows directly into `ema_intraday_historical.db`.
8. Writes updated `metadata.json`.
9. Returns records downloaded, last candle, metadata, database path, and status.

## Historical Database

The SQLite database table is `candles`.

Columns:

- Scrip
- Date
- Time
- Open
- High
- Low
- Close
- ATM
- EMA 1000
- 1000 EMA Interation

`ATM` is calculated once per trading day from the `09:18` close, rounded to the nearest `100`, and filled
for that day's rows.

`EMA 1000` is calculated from Close using the standard recursive EMA formula with alpha `2 / (1000 + 1)`.

`1000 EMA Interation` is filled only on candles where Close crosses above or below `EMA 1000`.
