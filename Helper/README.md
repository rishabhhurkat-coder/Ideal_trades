# Ideal Trades

Workspace for the Ideal Trades strategy app.

The repository root is mostly a container for the strategy workspace. The live app and support code are under `Helper/App`, while the strategy assets live under `Strategies`.

## Current Layout

- `Helper/App` - React + Vite application shell.
- `Helper/StrategyMaster` - strategy master screens and local fallback data helpers.
- `Helper/Supabase` - shared Supabase client wrapper.
- `Strategies/EMA-Intraday` - EMA Intraday strategy pages, trade dashboard, masters, and historical data helpers.
- `Strategies/Intraday-Weekly`, `Strategies/Nifty-Fing`, `Strategies/OS` - strategy stubs and notes.
- `IdealTrades.vbs` - launcher script.

## Launcher Path

- Use `IdealTrades.vbs` to start the workspace from the desktop shortcut flow.
- The app entrypoint is `Helper/App/src/main.tsx`.
- The visible strategy shell is rendered from `Helper/App/src/App.tsx`.

## Generated Or Unused Files

These should stay out of the source tree unless you explicitly need a build or local install:

- `Helper/App/node_modules`
- `Helper/App/dist`
- `Helper/App/tsconfig.tsbuildinfo`
- `Helper/App/node_modules/.vite` cache files

## Active Notes

- The app boots from `Helper/App/src/main.tsx`.
- The visible page comes from `Helper/App/src/App.tsx`, which loads `Helper/StrategyMaster/StrategyMasterPage.tsx`.
- Supabase is optional at runtime now. If the env vars are missing, the app falls back to local storage instead of blanking the page.
- The EMA Intraday add-trade modal now follows a 4-step layout: Trade Setup, Entry, Exit, and read-only Results.
- `Quantity` is now stored and used in the calculated results section.
- Run `npm install` inside `Helper/App` before starting the dev server if `node_modules` is not present.

## Update Log

- 2026-06-03: refreshed the workspace README to match the current folder layout and launcher path.
- 2026-06-02: restored the workspace README, documented the active layout, and recorded the generated files that should remain cleaned up.
- 2026-06-02: updated the EMA Intraday add-trade modal so setup hides after expiry save, the leg selector sits above the popup content instead of on the side, and the trade row stays horizontal for strike, entry, and exit fields.
