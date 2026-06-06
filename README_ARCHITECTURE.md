# Ideal Trades Architecture

Verified against the current workspace and Supabase project on 2026-06-04.

## Project Overview

Ideal Trades is a Vite + React workspace for strategy maintenance and EMA Intraday support. The visible shell starts in `Helper/App`, then routes into the strategy master hub and the EMA Intraday screens.

The current live Supabase project is `H&L_Projects` using the `ideal_trades` schema.

## Folder Structure

```text
Ideal Trades/
  IdealTrades.vbs
  Helper/
    App/
      index.html
      package.json
      vite.config.ts
      src/
        App.tsx
        main.tsx
        styles.css
        vite-env.d.ts
    StrategyMaster/
      StrategyMasterPage.tsx
      StrategyForm.tsx
      StrategyTable.tsx
      strategy.ts
      strategyService.ts
      useStrategies.ts
    Supabase/
      idealTrades.ts
      supabaseClient.ts
  Strategies/
    EMA-Intraday/
      EmaIntradayPage.tsx
      config.ts
      parameters.md
      strategy rules.md
      README.md
      Masters/
        MastersPage.tsx
        masters.ts
        mastersService.ts
        useMasters.ts
      HistoricalData/
        HistoricalDataPage.tsx
        KiteConnectService.ts
        build_historical_db.py
        types.ts
        Data/
          ema_intraday_historical.db
          metadata.json
      TradeDashboard/
        TradeDashboardPage.tsx
        tradeDashboard.ts
        trade-log.md
    Intraday-Weekly/
    Nifty-Fing/
    OS/
  Helper/README.md
  Strategies/EMA-Intraday/README.md
```

Generated or working files that should stay out of the source narrative unless needed:

- `Helper/App/node_modules`
- `Helper/App/dist`
- `Helper/App/tsconfig.tsbuildinfo`
- `Helper/App/*.log`

## Startup Process

1. The desktop launcher `IdealTrades.vbs` changes into `Helper/App`.
2. It runs `npm run dev`.
3. The launcher opens `http://localhost:6776`.
4. `Helper/App/vite.config.ts` configures the dev server host as `0.0.0.0`, the port as `6776`, and the default open URL as `http://localhost:6776`.

## App Entry Points

- `IdealTrades.vbs` - workspace launcher.
- `Helper/App/src/main.tsx` - React root mount.
- `Helper/App/src/App.tsx` - root app switch that renders `StrategyMasterPage`.
- `Helper/StrategyMaster/StrategyMasterPage.tsx` - strategy selector and master-data hub.
- `Strategies/EMA-Intraday/EmaIntradayPage.tsx` - EMA Intraday shell with modal entry points.
- `Strategies/EMA-Intraday/Masters/MastersPage.tsx` - entry reasons, exit reasons, and transition rules UI.
- `Strategies/EMA-Intraday/TradeDashboard/TradeDashboardPage.tsx` - trade dashboard UI.
- `Strategies/EMA-Intraday/HistoricalData/HistoricalDataPage.tsx` - historical data UI.

## Supabase Architecture

The shared Supabase client lives in `Helper/Supabase/supabaseClient.ts`.

- Runtime config comes from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- If those values are missing, the app falls back to a stub client instead of failing at import time.
- The app scopes all master-data queries to the `ideal_trades` schema via `Helper/Supabase/idealTrades.ts`.
- The default user identity used by master-data inserts is created or reused through `ensureDefaultUserId()`.
- The live schema has RLS enabled on every table in `ideal_trades`.

Current seed counts:

- `users`: 1
- `strategies`: 4
- `entry_reasons`: 7
- `exit_reasons`: 9
- `trade_transition_rules`: 14
- `activity_log`: 0

The live master-data flow is:

- Strategy Master reads and writes `ideal_trades.strategies`.
- EMA Intraday Masters reads and writes `emaintraday.entry_reasons`, `emaintraday.exit_reasons`, and `emaintraday.trade_transition_rules`.
- `activity_log` is used for transition audit records, but it is currently empty.

## Data Architecture

Historical candle data is stored locally in SQLite under:

- `Strategies/EMA-Intraday/HistoricalData/Data/ema_intraday_historical.db`

Expiry context is stored in Supabase under `ideal_trades.expiry_calendar`.

Supporting scripts and metadata:

- `Strategies/EMA-Intraday/HistoricalData/build_historical_db.py`
- `Strategies/EMA-Intraday/HistoricalData/Data/metadata.json`

The historical workflow uses SQLite as the local read model for cash-data snapshots and Supabase as the read model for expiry context. The app server reads both through `Helper/App/vite.config.ts` middleware.

## Historical Data Architecture

The historical-data screen is split between frontend state and local/session persistence:

- `Strategies/EMA-Intraday/HistoricalData/HistoricalDataPage.tsx` renders the UI.
- `Strategies/EMA-Intraday/HistoricalData/KiteConnectService.ts` manages the Kite session state.
- `Helper/App/vite.config.ts` provides the local API routes:
  - `/api/kite/session`
  - `/api/kite/historical-candles`
  - `/api/kite/historical-test`
  - `/api/ema-intraday/trade-context`
  - `/api/ema-intraday/trade-calendar`
  - `/api/ema-intraday/trade-log`

The data source chain is:

1. Kite login and request token handling.
2. Session verification through the local dev server.
3. Historical candle retrieval.
4. SQLite persistence and metadata update.

## Strategy Master Architecture

Strategy master data is centralized in:

- `Helper/StrategyMaster/strategyService.ts`
- `Helper/StrategyMaster/useStrategies.ts`
- `Helper/StrategyMaster/StrategyMasterPage.tsx`
- `Helper/StrategyMaster/StrategyForm.tsx`
- `Helper/StrategyMaster/StrategyTable.tsx`
- `Helper/StrategyMaster/strategy.ts`

Behavior summary:

- The strategy list is fetched from `ideal_trades.strategies`.
- Create, edit, delete, and active-state updates go through the Supabase client.
- The UI count is bound directly to the loaded `strategies.length`.
- The sidebar uses the strategy list to route into the EMA Intraday page or the per-strategy summary view.

## Browser Storage Audit Snapshot

Current remaining browser-storage keys in the workspace:

- `ideal-trades.ema-intraday.trade-dashboard` - persisted EMA Intraday trade dashboard rows.
- `ideal-trades.ema-intraday.trade-quantity` - remembered default quantity for new trade rows.
- `ideal-trades.ema-intraday.kite-auth` - Kite auth/session state with a cookie fallback.

Recommended handling:

- Keep `ideal-trades.ema-intraday.kite-auth` for the current Kite login flow.
- Keep `ideal-trades.ema-intraday.trade-quantity` for the current form convenience behavior.
- Migrate `ideal-trades.ema-intraday.trade-dashboard` later if the trade dashboard becomes Supabase-backed.

## Future Roadmap

This repository is currently in a stable verification phase, so no architectural changes are requested here. If the next phase starts, the likely follow-ups are:

- Move the trade-dashboard records out of browser storage.
- Keep the historical-data SQLite read model unless a database migration is explicitly approved.
- Add tighter schema-aware reporting for trade activity only if the business flow expands.
- Preserve the current launcher and local dev server shape unless a release task asks for a packaging change.

## UI Improvements

Date: 2026-06-04

Files Modified:

- `Helper/StrategyMaster/StrategyMasterPage.tsx`
- `Helper/StrategyMaster/StrategyTable.tsx`
- `Helper/StrategyMaster/StrategyForm.tsx`
- `Helper/StrategyMaster/useStrategies.ts`
- `Helper/App/src/styles.css`
