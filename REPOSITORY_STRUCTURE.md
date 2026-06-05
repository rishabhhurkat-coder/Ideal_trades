# Repository Structure

This is the current repository layout for the Ideal Trades workspace. Generated folders are omitted unless they are important to runtime or verification.

## Top Level

- `IdealTrades.vbs` - desktop launcher.
- `Helper/` - app shell, shared Supabase helpers, and support folders.
- `Strategies/` - strategy-specific workspaces and notes.
- `.gitignore`

## Helper

### `Helper/App`

Important files:

- `Helper/App/index.html`
- `Helper/App/package.json`
- `Helper/App/package-lock.json`
- `Helper/App/vite.config.ts`
- `Helper/App/tsconfig.json`
- `Helper/App/src/App.tsx`
- `Helper/App/src/main.tsx`
- `Helper/App/src/styles.css`
- `Helper/App/src/vite-env.d.ts`

Runtime notes:

- This is the primary Vite app.
- The launcher points here first.
- The dev server and local API middleware live in `vite.config.ts`.

### `Helper/StrategyMaster`

Important files:

- `Helper/StrategyMaster/StrategyMasterPage.tsx`
- `Helper/StrategyMaster/StrategyForm.tsx`
- `Helper/StrategyMaster/StrategyTable.tsx`
- `Helper/StrategyMaster/strategy.ts`
- `Helper/StrategyMaster/strategyService.ts`
- `Helper/StrategyMaster/useStrategies.ts`

Role:

- Strategy master CRUD and navigation hub.

### `Helper/Supabase`

Important files:

- `Helper/Supabase/idealTrades.ts`
- `Helper/Supabase/supabaseClient.ts`

Role:

- Shared Supabase client and schema helper.

### Other Helper directories

- `Helper/Components/`
- `Helper/Database/`
- `Helper/Hooks/`
- `Helper/Services/`
- `Helper/Types/`
- `Helper/Utils/`
- `Helper/README.md`

These directories exist in the workspace but were not the focus of the current verification pass.

## Strategies

### `Strategies/EMA-Intraday`

Important files:

- `Strategies/EMA-Intraday/EmaIntradayPage.tsx`
- `Strategies/EMA-Intraday/README.md`
- `Strategies/EMA-Intraday/config.ts`
- `Strategies/EMA-Intraday/parameters.md`
- `Strategies/EMA-Intraday/strategy rules.md`

Subdirectories:

- `Strategies/EMA-Intraday/Masters/`
- `Strategies/EMA-Intraday/HistoricalData/`
- `Strategies/EMA-Intraday/TradeDashboard/`

### `Strategies/EMA-Intraday/Masters`

Important files:

- `Strategies/EMA-Intraday/Masters/MastersPage.tsx`
- `Strategies/EMA-Intraday/Masters/masters.ts`
- `Strategies/EMA-Intraday/Masters/mastersService.ts`
- `Strategies/EMA-Intraday/Masters/useMasters.ts`

Role:

- Entry reasons, exit reasons, and trade transition rules.

### `Strategies/EMA-Intraday/HistoricalData`

Important files:

- `Strategies/EMA-Intraday/HistoricalData/HistoricalDataPage.tsx`
- `Strategies/EMA-Intraday/HistoricalData/KiteConnectService.ts`
- `Strategies/EMA-Intraday/HistoricalData/types.ts`
- `Strategies/EMA-Intraday/HistoricalData/build_historical_db.py`
- `Strategies/EMA-Intraday/HistoricalData/get_trade_calendar.py`
- `Strategies/EMA-Intraday/HistoricalData/get_trade_context.py`
- `Strategies/EMA-Intraday/HistoricalData/README.md`
- `Strategies/EMA-Intraday/HistoricalData/Data/ema_intraday_historical.db`
- `Strategies/EMA-Intraday/HistoricalData/Data/metadata.json`

Role:

- Kite session handling, historical download flow, local historical candle persistence, and Supabase-backed expiry context.

### `Strategies/EMA-Intraday/TradeDashboard`

Important files:

- `Strategies/EMA-Intraday/TradeDashboard/TradeDashboardPage.tsx`
- `Strategies/EMA-Intraday/TradeDashboard/tradeDashboard.ts`
- `Strategies/EMA-Intraday/TradeDashboard/trade-log.md`

Role:

- Trade dashboard UI and browser-storage-backed records.

### Other strategy folders

- `Strategies/Intraday-Weekly/`
- `Strategies/Nifty-Fing/`
- `Strategies/OS/`

These contain strategy-specific notes and config stubs.

## Important Files By Responsibility

### App entry files

- `IdealTrades.vbs`
- `Helper/App/src/main.tsx`
- `Helper/App/src/App.tsx`
- `Helper/StrategyMaster/StrategyMasterPage.tsx`
- `Strategies/EMA-Intraday/EmaIntradayPage.tsx`

### Service files

- `Helper/StrategyMaster/strategyService.ts`
- `Strategies/EMA-Intraday/Masters/mastersService.ts`
- `Strategies/EMA-Intraday/HistoricalData/KiteConnectService.ts`
- `Helper/Supabase/supabaseClient.ts`
- `Helper/Supabase/idealTrades.ts`

### Database and data files

- `Strategies/EMA-Intraday/HistoricalData/Data/ema_intraday_historical.db`
- `Strategies/EMA-Intraday/HistoricalData/Data/metadata.json`
- `Strategies/EMA-Intraday/TradeDashboard/trade-log.md`

### Config files

- `Helper/App/package.json`
- `Helper/App/vite.config.ts`
- `Helper/App/tsconfig.json`
- `Helper/App/.env.local`
- `Strategies/EMA-Intraday/config.ts`
- `Strategies/EMA-Intraday/parameters.md`

## Notes

- `Helper/App/node_modules` and `Helper/App/dist` are generated working directories.
- The repository currently has unrelated worktree changes outside this documentation pass. Those were left untouched.
