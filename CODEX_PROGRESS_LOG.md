# EMA Intraday Supabase Migration

Last Updated:
2026-06-05 02:15 IST

Current Phase:
Phase 2B Route Validation

Completed:

- Audited `Strategies\EMA-Intraday\HistoricalData\Data\nifty_expiry_dte.db`.
- Confirmed the SQLite file is empty (`0 bytes`) and has no tables.
- Traced current trade-calendar and trade-context reads to Supabase helper code, not to `nifty_expiry_dte.db`.
- Identified `Helper\App\vite.config.ts` as the legacy runtime bridge that still launches Python scripts for historical flows.
- Created the `ideal_trades.ema_intraday_candles` Supabase migration with primary key, indexes, RLS, grants, and update trigger.
- Updated `Helper\Supabase\emaIntradayHistorical.ts` to read `ema_intraday_candles` for trade context.
- Updated `Strategies\EMA-Intraday\HistoricalData\sync_kite_candles_to_supabase.py` to upsert into `ema_intraday_candles`.
- Removed the Vite historical route's local SQLite snapshot/metadata dependency and switched it to Supabase state lookups plus the new sync script.
- Verified the rewritten Python scripts with `python -m py_compile`.
- Verified the TypeScript workspace with `tsc --noEmit --pretty false`.
- Applied the `20260605_create_ema_intraday_candles` migration to project `ssdilvlhwoamzdnqsgcp`.
- Confirmed the live project now contains `ideal_trades.ema_intraday_candles`.
- Validated live Kite fetch with the working token from `G:\My Drive\H&L\Individual Trades Codes - Copy\Data Files\token.json`.
- Inserted a live 3-row Kite sample into `ideal_trades.ema_intraday_candles`.
- Confirmed `ATM`, `EMA1000`, and `EMA Interaction` are populated in the Supabase sample rows.
- Confirmed trade context and trade calendar endpoints still return Supabase-backed results.
- Confirmed the local SQLite candle database and metadata timestamps did not change during validation.
- Captured a screenshot artifact at `G:\My Drive\H&L\Ideal Trades\validation_evidence_trade_context.png`.
- Audited the phase-3 files and found no code changes required at this stage.
- Identified the POST historical update blocker as a missing backend service-role credential.
- Confirmed `ideal_trades.ema_intraday_candles` currently has 3 rows with `ATM` and `EMA1000` fully populated.
- Confirmed `EMA Interaction` is present for 2 of 3 validation rows and blank only on the first seed candle, which is expected.
- Confirmed `Gap Value` and `Gap %` are currently null on all 3 validation rows.

Modified Files:

- G:\My Drive\H&L\Ideal Trades\CODEX_PROGRESS_LOG.md
- G:\My Drive\H&L\Ideal Trades\Helper\App\vite.config.ts
- G:\My Drive\H&L\Ideal Trades\Helper\Supabase\emaIntradayHistorical.ts
- G:\My Drive\H&L\Ideal Trades\Strategies\EMA-Intraday\HistoricalData\sync_kite_candles_to_supabase.py
- G:\My Drive\H&L\Ideal Trades\Helper\App\package.json
- G:\My Drive\H&L\Ideal Trades\Helper\App\package-lock.json

Created Files:

- G:\My Drive\H&L\Ideal Trades\supabase\migrations\20260605_create_ema_intraday_candles.sql
- G:\My Drive\H&L\Ideal Trades\validation_evidence_trade_context.png

Deleted Files:

- none

Pending Tasks:

- Await explicit cleanup authorization before deleting any legacy historical files.
- If full in-app POST validation is still required, wire a backend service-role write credential.

Known Issues:

- `Strategies\EMA-Intraday\HistoricalData\Data\nifty_expiry_dte.db` is still present on disk, but it is empty and unreferenced.
- `ema_intraday_historical.db` and `metadata.json` were not modified during validation; their last-write timestamps stayed at `2026-06-05 15:42:15`.
- The POST historical route fails at `Strategies\EMA-Intraday\HistoricalData\sync_kite_candles_to_supabase.py:get_supabase_config()` because the backend environment does not provide `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, or `SUPABASE_SECRET_KEY`.
- The current app environment only provides `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, which is sufficient for reads but not for the write/upsert path.
- The worktree already contains unrelated user changes in other EMA Intraday files; they were left untouched.

Next Immediate Action:

Provide or wire a backend service-role write credential, then rerun the POST historical update path if full in-app validation is required.
