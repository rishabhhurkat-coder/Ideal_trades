# GITHUB Index

This index covers the important files in the current Ideal Trades repository.

## Entry Points

| Relative Path | Description |
| --- | --- |
| `IdealTrades.vbs` | Desktop launcher that starts the app from `Helper/App` and opens the local dev URL. |
| `Helper/App/src/main.tsx` | React root mount for the app. |
| `Helper/App/src/App.tsx` | Top-level app switch that renders the strategy master shell. |
| `Helper/StrategyMaster/StrategyMasterPage.tsx` | Main navigation hub for Strategy Master and strategy-specific views. |
| `Strategies/EMA-Intraday/EmaIntradayPage.tsx` | EMA Intraday wrapper with Historical Data and Settings modals. |
| `Strategies/EMA-Intraday/Masters/MastersPage.tsx` | UI for entry reasons, exit reasons, and transition rules. |
| `Strategies/EMA-Intraday/TradeDashboard/TradeDashboardPage.tsx` | EMA Intraday trade dashboard surface. |
| `Strategies/EMA-Intraday/HistoricalData/HistoricalDataPage.tsx` | Historical data download and sync surface. |

## Supabase Files

| Relative Path | Description |
| --- | --- |
| `Helper/Supabase/supabaseClient.ts` | Shared Supabase client with runtime config fallback. |
| `Helper/Supabase/idealTrades.ts` | `ideal_trades` schema helper and default user bootstrap logic. |
| `Helper/StrategyMaster/strategyService.ts` | Supabase CRUD for strategies. |
| `Helper/StrategyMaster/useStrategies.ts` | Strategy Master state orchestration around Supabase CRUD. |
| `Strategies/EMA-Intraday/Masters/mastersService.ts` | Supabase CRUD and transition logic for entry reasons, exit reasons, and transition rules. |
| `Strategies/EMA-Intraday/Masters/useMasters.ts` | Master-data state orchestration and refresh logic. |
| `Strategies/EMA-Intraday/Masters/masters.ts` | Shared type definitions for master records and transition planning. |

## Strategy Master Files

| Relative Path | Description |
| --- | --- |
| `Helper/StrategyMaster/strategy.ts` | Strategy data types and type-format helper. |
| `Helper/StrategyMaster/StrategyForm.tsx` | Strategy create/edit form. |
| `Helper/StrategyMaster/StrategyTable.tsx` | Strategy list table and row actions. |
| `Helper/StrategyMaster/strategyService.ts` | Strategy CRUD and active-state updates. |
| `Helper/StrategyMaster/useStrategies.ts` | Strategy loading, saving, editing, and deletion state. |
| `Helper/StrategyMaster/StrategyMasterPage.tsx` | Strategy master page shell and strategy navigation. |

## EMA Intraday Files

| Relative Path | Description |
| --- | --- |
| `Strategies/EMA-Intraday/README.md` | Strategy-specific navigation and storage notes. |
| `Strategies/EMA-Intraday/config.ts` | EMA Intraday configuration data. |
| `Strategies/EMA-Intraday/parameters.md` | Strategy parameters reference. |
| `Strategies/EMA-Intraday/strategy rules.md` | Strategy rules reference. |
| `Strategies/EMA-Intraday/EmaIntradayPage.tsx` | EMA Intraday shell page and modal launcher. |

## Trade Dashboard Files

| Relative Path | Description |
| --- | --- |
| `Strategies/EMA-Intraday/TradeDashboard/tradeDashboard.ts` | Browser-storage-backed trade dashboard data model and helpers. |
| `Strategies/EMA-Intraday/TradeDashboard/TradeDashboardPage.tsx` | Trade dashboard UI and form flow. |
| `Strategies/EMA-Intraday/TradeDashboard/trade-log.md` | Appended trade log written by the local server. |

## Historical Data Files

| Relative Path | Description |
| --- | --- |
| `Strategies/EMA-Intraday/HistoricalData/KiteConnectService.ts` | Kite session handling and browser storage for auth state. |
| `Strategies/EMA-Intraday/HistoricalData/HistoricalDataPage.tsx` | Historical data UI for download and sync actions. |
| `Strategies/EMA-Intraday/HistoricalData/types.ts` | Historical-data type definitions. |
| `Strategies/EMA-Intraday/HistoricalData/build_historical_db.py` | Builds the local historical SQLite database. |
| `Strategies/EMA-Intraday/HistoricalData/get_trade_context.py` | Resolves trade-date context for the historical workflow. |
| `Strategies/EMA-Intraday/HistoricalData/get_trade_calendar.py` | Resolves expiry and calendar context for the historical workflow. |
| `Strategies/EMA-Intraday/HistoricalData/README.md` | Notes for the historical-data workflow, including Supabase-backed expiry calendar context. |
| `Strategies/EMA-Intraday/HistoricalData/Data/ema_intraday_historical.db` | Local SQLite cache for historical candle data. |
| `Strategies/EMA-Intraday/HistoricalData/Data/metadata.json` | Metadata for the local historical database. |

## Workspace Support Files

| Relative Path | Description |
| --- | --- |
| `Helper/README.md` | Workspace overview and launcher notes. |
| `README_ARCHITECTURE.md` | Architecture summary created during verification. |
| `DATABASE_SCHEMA.md` | Live Supabase schema and row-count reference. |
| `REPOSITORY_STRUCTURE.md` | Repository structure reference. |
| `Helper/App/package.json` | App scripts and dependencies. |
| `Helper/App/vite.config.ts` | Vite dev server and local API middleware. |
| `Helper/App/index.html` | Vite HTML entry page. |
| `Helper/App/tsconfig.json` | TypeScript build configuration. |
| `Helper/App/src/styles.css` | Global app styles. |
| `Helper/App/src/vite-env.d.ts` | Vite env type declarations. |

## Other Strategy Files

| Relative Path | Description |
| --- | --- |
| `Strategies/Intraday-Weekly/config.ts` | Intraday Weekly configuration stub. |
| `Strategies/Intraday-Weekly/notes.md` | Intraday Weekly notes. |
| `Strategies/Intraday-Weekly/rules.md` | Intraday Weekly rules reference. |
| `Strategies/Nifty-Fing/config.ts` | Nifty Fing configuration stub. |
| `Strategies/Nifty-Fing/notes.md` | Nifty Fing notes. |
| `Strategies/Nifty-Fing/rules.md` | Nifty Fing rules reference. |
| `Strategies/OS/config.ts` | OS strategy configuration stub. |
| `Strategies/OS/notes.md` | OS strategy notes. |
| `Strategies/OS/rules.md` | OS strategy rules reference. |

## Notes

- The repository is currently organized around `Helper/App` for the runnable shell and `Strategies/EMA-Intraday` for the live strategy workflow.
- The current Supabase schema scope is `ideal_trades`.
- Browser-storage-backed behavior remains in the trade dashboard and Kite session flow.
