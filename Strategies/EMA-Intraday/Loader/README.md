# EMA Intraday Loader

This folder contains the loader infrastructure for the EMA Intraday strategy.

## What it does

- Checks exact NIFTY option parquet files in GCS
- Finds qualifying strikes using the active `universe_config`
- Writes qualified rows into Supabase tables in the existing `emaintraday` schema
- Uses `ideal_trades.expiry_calendar` to validate `dte`
- Skips `trade_date + expiry` pairs already marked as loaded in `universe_loads`

## Data flow

1. Load runtime configuration from environment variables and `.env`
2. Read the active row from `emaintraday.universe_config`
3. Read `ideal_trades.expiry_calendar` for the active date range
4. Generate exact `NIFTY{EXPIRY}_CE.parquet` and `NIFTY{EXPIRY}_PE.parquet` names
5. Check each file exists directly in GCS
6. Skip the expiry if either file is missing
7. Download the NIFTY files that exist
8. Group candles by `trade_date`
9. Qualify a strike when `premium_min <= Close <= premium_max`
10. Keep the strike active for the rest of that trading day
11. Upsert rows into:
   - `emaintraday.candidate_universe`
   - `emaintraday.option_series`
   - `emaintraday.universe_loads`

## Supabase schema

The live database uses the lowercase Postgres schema name `emaintraday` even though it is referred to as `EMAIntraday` in the project notes.

Shared calendar data comes from:

- `ideal_trades.expiry_calendar`

## Environment variables

Copy `.env.example` to `.env` and fill in values.

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GCS_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`

Optional:

- `GCS_BUCKET` defaults to `hlbacktest-data`
- `GCS_PREFIX` defaults to `Market Data/NSE Options/`
- `EMA_INTRADAY_SCHEMA` defaults to `emaintraday`
- `IDEAL_TRADES_SCHEMA` defaults to `ideal_trades`
- `UNIVERSE_CONFIG_NAME` can select a specific config row
- `LOADER_BATCH_SIZE`
- `LOADER_RETRY_ATTEMPTS`
- `LOADER_RETRY_INITIAL_DELAY`
- `LOADER_RETRY_MAX_DELAY`
- `LOADER_LOG_LEVEL`
- `LOADER_LOG_DIR`
- `LOADER_DRY_RUN`

## Running

From this folder:

```bash
python UniverseLoader.py
```

Dry run:

```bash
python UniverseLoader.py --dry-run
```

Optional config override:

```bash
python UniverseLoader.py --config-name Default
```

## Notes

- No new tables are created.
- No schema changes are made.
- The loader uses batch upserts to avoid duplicate rows on reruns.
- Structured logs are written to `logs/`.
