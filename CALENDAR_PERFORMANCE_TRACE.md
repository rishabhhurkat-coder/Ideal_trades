# Calendar Performance Trace

Status: paused on 2026-06-06 after instrumentation and scripted trace attempts.

## Scope

Requested path:

User click -> EMA Intraday -> +Trade -> Trade Date Calendar

Current calendar source:

`emaintraday.date_selection`

## Files Inspected

1. `Helper/Supabase/emaIntradayHistorical.ts`
2. `Strategies/EMA-Intraday/TradeDashboard/tradeDashboard.ts`
3. `Strategies/EMA-Intraday/TradeDashboard/TradeDashboardPage.tsx`
4. `Helper/Supabase/supabaseClient.ts`
5. `Helper/App/src/App.tsx`
6. `Helper/App/src/main.tsx`

Additional path context inspected:

1. `Helper/StrategyMaster/StrategyMasterPage.tsx`
2. `Strategies/EMA-Intraday/EmaIntradayPage.tsx`
3. `Helper/App/vite.config.ts`
4. `Helper/App/package.json`

## Load Path Found

1. `Helper/App/src/main.tsx`
   - `createRoot(...).render(<StrictMode><App /></StrictMode>)`

2. `Helper/App/src/App.tsx`
   - Renders `StrategyMasterPage`.

3. `Helper/StrategyMaster/StrategyMasterPage.tsx`
   - `handleStrategySelect(strategyName)` routes `EMA Intraday` to `activePage = 'ema-intraday'`.

4. `Strategies/EMA-Intraday/EmaIntradayPage.tsx`
   - Renders `TradeDashboardPage`.

5. `Strategies/EMA-Intraday/TradeDashboard/TradeDashboardPage.tsx`
   - `beginAddTradeDay()` runs on `+Trade`.
   - Sets the modal state and records T1.
   - `TradeModal` renders when `open = true`.
   - The `open` effect starts calendar loading through a hardcoded `window.setTimeout(..., 150)`.
   - `fetchTradeCalendar()` is called after that delay.

6. `Strategies/EMA-Intraday/TradeDashboard/tradeDashboard.ts`
   - `fetchTradeCalendar()` calls `readTradeCalendar(supabase)`.

7. `Helper/Supabase/emaIntradayHistorical.ts`
   - `readTradeCalendar(client)` calls `schemaClient(client, 'emaintraday').from('date_selection')`.
   - Rows are paged through `fetchAllRows()` with page size 1000.
   - Returned rows are reduced into one calendar option per unique date.

8. `TradeDashboardPage.tsx`
   - `setTradeDates(calendar.dates ?? [])` populates calendar state.
   - `TradeModal` builds calendar months with `buildTradeDateCalendar(tradeDates)`.
   - First rendered frame is captured with `useLayoutEffect` plus `requestAnimationFrame`.

## Query Being Executed

```ts
schemaClient(client, 'emaintraday')
  .from('date_selection')
  .select('"Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No"')
  .order('Date', { ascending: true })
  .order('Candle No', { ascending: false })
  .range(from, to)
```

Logical query:

`emaintraday.date_selection.select("Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No").order("Date", ascending true).order("Candle No", ascending false).range(...)`

## Instrumentation Added

### `Helper/Supabase/emaIntradayHistorical.ts`

Added `TradeCalendarPerformanceTrace` and returns it from `readTradeCalendar()`.

Captured:

1. `t2QueryStart`
2. `t3ResponseReceived`
3. `t4TransformComplete`
4. `backendMs`
5. `transformMs`
6. `rowsReturned`
7. `uniqueDatesReturned`
8. `duplicateRowsSkipped`
9. `pageCount`
10. query string, selected columns, order clauses, page size

### `Strategies/EMA-Intraday/TradeDashboard/tradeDashboard.ts`

Added matching `TradeCalendarPerformanceTrace` type and propagated `trace` through `TradeCalendarResponse`.

### `Strategies/EMA-Intraday/TradeDashboard/TradeDashboardPage.tsx`

Added T1/T5/T6 timeline capture:

1. `T1 = t1ModalOpenStart` in `beginAddTradeDay()`
2. modal visible time in `TradeModal`
3. `T5 = t5CalendarStatePopulated` in `useLayoutEffect`
4. `T6 = t6FirstCalendarRenderComplete` in `requestAnimationFrame`
5. `calendarBuildMs` around `buildTradeDateCalendar(tradeDates)`

Final console line format:

```text
[EMA Trade Perf] T1-T6 total=...ms backend=...ms transform=...ms reactState=...ms render=...ms rows=... uniqueDates=... duplicateRows=... pages=... calendarBuild=...ms
```

## Verification Performed

Build command:

```powershell
npm run build
```

Working directory:

`G:\My Drive\H&L\Ideal Trades\Helper\App`

Result:

Build passed after one strict-null guard fix.

Build warning:

Vite reported one chunk above 500 kB after minification. This was not related to the calendar trace.

## Scripted Trace Attempts

No manual browser testing was done.

Vite dev server was started from:

`G:\My Drive\H&L\Ideal Trades\Helper\App`

Command:

```powershell
npm run dev -- --host 127.0.0.1
```

Vite selected:

`http://127.0.0.1:6776/`

Temporary Playwright setup was created outside the repo:

`C:\Users\Dell\AppData\Local\Temp\ideal-trades-calendar-trace`

Chromium was installed into Playwright cache because no Chrome/Edge executable was found in standard paths.

Scripted click path:

1. Load `http://127.0.0.1:6776/`
2. Click `EMA Intraday` if present
3. Click `+Trade`
4. Wait for `window.__emaTradePerf.t6FirstCalendarRenderComplete`

## Evidence Captured

Run 1:

```text
[EMA Trade Perf] T1->modalVisible=70.4ms
[EMA Trade Perf] fetchTradeCalendar start #1
Timeout after 30000ms waiting for T6.
```

Run 2:

```text
[EMA Trade Perf] T1->modalVisible=51.4ms
[EMA Trade Perf] fetchTradeCalendar start #1
Timeout after 30000ms waiting for T6.
```

Run 3:

```text
[EMA Trade Perf] T1->modalVisible=59.4ms
[EMA Trade Perf] fetchTradeCalendar start #1
Timeout after 120000ms waiting for T6.
```

No `trade_calendar rows=...` line was emitted in these runs. That means `readTradeCalendar()` did not complete before the scripted timeout.

## Current Timing Breakdown

Only T1 to modal-visible has measured values so far:

| Segment | Measured |
|---|---:|
| Modal visible after +Trade | 51.4 ms to 70.4 ms |
| Backend Time = T3 - T2 | not completed; query did not return within 120000 ms |
| Transform Time = T4 - T3 | not reached |
| React State Time = T5 - T4 | not reached |
| Render Time = T6 - T5 | not reached |
| Total Time = T6 - T1 | not reached; exceeded 120000 ms in scripted run |

## Target Check

Expected:

1. Modal Open: `< 300ms`
2. Calendar Data: `< 1000ms`
3. Total: `< 2.5 sec`

Observed:

1. Modal Open: passed, measured `51.4ms` to `70.4ms`.
2. Calendar Data: failed, Supabase fetch did not finish within `120000ms`.
3. Total: failed, T6 was not reached within `120000ms`.

Flag thresholds:

| Step | Status |
|---|---|
| `> 100ms` | calendar fetch exceeded |
| `> 250ms` | calendar fetch exceeded |
| `> 500ms` | calendar fetch exceeded |
| `> 1000ms` | calendar fetch exceeded |

## Query Review

Columns requested:

1. `Date`
2. `expiry`
3. `dte`
4. `ATM`
5. `GAP`
6. `GAP_STATUS`
7. `EMA_Status`
8. `eff_dte`
9. `Candle No`

Columns used for calendar output:

1. `Date`
2. `expiry`
3. `dte`
4. `ATM`
5. `GAP`
6. `GAP_STATUS`
7. `EMA_Status`

Potential unnecessary column:

1. `eff_dte` is selected but not used in `readTradeCalendar()`.

Columns used only for deduping/sorting:

1. `Candle No` is selected only because the query orders by it and the reducer keeps the first row per date.

Duplicate fetch check:

1. Only one `fetchTradeCalendar start #1` appeared per scripted click.
2. No duplicate calendar fetch was observed in the scripted runs.

Repeated `useEffect` check:

1. `TradeDashboardPage` has one `useEffect` keyed on `[open]` for calendar fetch.
2. React `StrictMode` is enabled in `main.tsx`, but the calendar fetch effect only ran once in the captured scripted click evidence.

Sorting and mapping:

1. Supabase sorts by `Date ASC`, then `Candle No DESC`.
2. `readTradeCalendar()` performs a reduce over all returned rows and skips duplicate `Date` values.
3. `buildTradeDateCalendar()` maps `tradeDates`, parses dates twice, sorts parsed dates, and builds 42 day cells for every month between first and last eligible date.

## Bottleneck Ranking

Current evidence ranks only the reached stages:

1. Supabase calendar fetch: slowest; did not complete within `120000ms`.
2. Modal open/render: `51.4ms` to `70.4ms`.

The exact backend vs transform vs render ranking is not yet available because T3/T4/T5/T6 were not reached.

## Single Biggest Reason Calendar Feels Slow

Current evidence points to the calendar data request against `emaintraday.date_selection` not returning in time. The UI modal opens quickly; the delay happens after `fetchTradeCalendar start #1` and before any Supabase response/transform log.

The code also intentionally waits `150ms` before starting the fetch, but that delay is small compared with the observed `>120000ms` non-completion.

## Recommended Fix

Do not implement yet.

Recommended next investigation:

1. Run the same query directly against Supabase/PostgREST or SQL to confirm whether the request hangs because of row volume, ordering, RLS, network, or missing indexes.
2. Replace full-table paged fetch with a purpose-built date-selection query/view that returns one row per `Date`.
3. Remove unused `eff_dte` from the calendar query.
4. Avoid fetching all candles/rows if the calendar only needs unique eligible dates.
5. Remove or justify the `150ms` delayed fetch once backend latency is fixed.

## Exact Next Steps For Continuation

1. Keep the instrumentation changes currently in:
   - `Helper/Supabase/emaIntradayHistorical.ts`
   - `Strategies/EMA-Intraday/TradeDashboard/tradeDashboard.ts`
   - `Strategies/EMA-Intraday/TradeDashboard/TradeDashboardPage.tsx`

2. Check whether Vite is still running:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:6776/' -TimeoutSec 5
```

3. If not running, start:

```powershell
cd 'G:\My Drive\H&L\Ideal Trades\Helper\App'
npm run dev -- --host 127.0.0.1
```

4. Reuse the temp Playwright runner at:

`C:\Users\Dell\AppData\Local\Temp\ideal-trades-calendar-trace\trace.spec.js`

5. Run:

```powershell
cd "$env:TEMP\ideal-trades-calendar-trace"
npx playwright test trace.spec.js --reporter=line
```

6. If it still times out, query `emaintraday.date_selection` directly outside the browser to measure row count and database latency.

## Important Constraint

No UI fix, commit, or push has been done.
