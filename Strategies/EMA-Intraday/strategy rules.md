# EMA Intraday Strategy Rules

Research and observations will be documented here.

## Stored Strategy Parameters

- Default timeframe: `3m`
- Indicators: `EMA 1000`, `EMA 9`, `EMA 100`
- Entry reasons:
  - `1000 EMA Trade`
  - `ATM EMA 100 SL Trigg`
  - `CE SL Trigg`
  - `EMA 100 SL Trigg`
  - `EMA 9 Entry`
  - `Normal Entry`
  - `PE SL Trigg`
  - `Rollover EMA 100 Sell`
- Exit reasons:
  - `1000 EMA Trade`
  - `ATM EMA 100 SL Trigg`
  - `CE SL Trigg`
  - `EMA 100 SL Trigg`
  - `EOD`
  - `PE SL Trigg`
  - `Rollover EMA 100 Sell`
  - `Swing High Break`
  - `Sudden Spike`

These parameters are mirrored in [`parameters.md`](./parameters.md) for quick reference.
