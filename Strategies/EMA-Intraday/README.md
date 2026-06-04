# EMA Intraday

Strategy-specific files for the EMA Intraday workflow live here.

## Navigation

- Open the EMA Intraday page from the main strategy list.
- Use the `Masters` button inside EMA Intraday to edit entry reasons, exit reasons, and transition rules.
- Use the `Trade Dashboard` button inside EMA Intraday to add and review trades.
- Use the `Historical Data` button inside EMA Intraday to view the historical data workflow.
- Trade Dashboard rows are stored in browser `localStorage` as JSON under `ideal-trades.ema-intraday.trade-dashboard`.
- Saved trade sessions are also appended to `TradeDashboard/trade-log.md` by the local app server.

## Moved into this folder

- `config.ts`
- `parameters.md`
- `strategy rules.md`
- `EmaIntradayPage.tsx`
- `Masters/masters.ts`
- `Masters/mastersService.ts`
- `Masters/useMasters.ts`
- `Masters/MastersPage.tsx`

## Existing strategy assets

- `HistoricalData/`
- `HistoricalData/README.md`
- `HistoricalData/Data/`
