# Calendar Root Cause

Date: 2026-06-06

## Scope

Investigated backend data flow only.

No UI, CSS, or React component files were changed.

## Exact Failing File

`Helper/Supabase/emaIntradayHistorical.ts`

## Exact Function

`readTradeCalendar(client)` at `Helper/Supabase/emaIntradayHistorical.ts:204`

Call path:

1. `Strategies/EMA-Intraday/TradeDashboard/tradeDashboard.ts:457`
2. `fetchTradeCalendar()`
3. `readSupabaseTradeCalendar(supabase)`
4. `Helper/Supabase/emaIntradayHistorical.ts:204`
5. `readTradeCalendar(client)`

## Exact Query

Code query:

```ts
schemaClient(client, 'emaintraday')
  .from('date_selection')
  .select('"Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No"')
  .order('Date', { ascending: true })
  .order('Candle No', { ascending: false })
  .range(from, to)
```

Logical Supabase query:

```text
emaintraday.date_selection
  .select("Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No")
  .order("Date", ascending true)
  .order("Candle No", ascending false)
  .range(0, 999)
```

REST/Data API equivalent tested:

```text
GET /rest/v1/date_selection
Accept-Profile: emaintraday
select="Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No"
order=Date.asc,"Candle No".desc
offset=0
limit=1000
```

## Database Evidence

Rows in table:

```sql
SELECT COUNT(*)
FROM emaintraday.date_selection;
```

Result:

```text
546
```

Date range:

```sql
SELECT MIN("Date"), MAX("Date")
FROM emaintraday.date_selection;
```

Result:

```text
MIN("Date") = 2021-01-06
MAX("Date") = 2026-06-02
```

Indexes:

```sql
SELECT *
FROM pg_indexes
WHERE schemaname='emaintraday'
AND tablename='date_selection';
```

Result:

```text
No indexes found.
```

Privilege check:

```sql
select role_name,
       has_schema_privilege(role_name, 'emaintraday', 'USAGE') as schema_usage,
       has_table_privilege(role_name, 'emaintraday.date_selection', 'SELECT') as table_select
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);
```

Result:

```text
anon           schema_usage=true  table_select=false
authenticated  schema_usage=true  table_select=false
service_role   schema_usage=true  table_select=false
```

RLS check:

```text
emaintraday.date_selection rls_enabled=false, force_rls=false
```

## Direct Query Timing

Database execution plan for the same ordered first page:

```sql
explain (analyze, buffers, format json)
select "Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No"
from emaintraday.date_selection
order by "Date" asc, "Candle No" desc
limit 1000 offset 0;
```

Result:

```text
Actual rows: 546
Execution time: 0.47 ms
Plan: Seq Scan -> Sort -> Limit
Sort method: quicksort in memory
```

## Supabase API Evidence

Browser-equivalent request using the app publishable key reached Supabase.

Result:

```text
HTTP 401
Time: 728.4 ms
Rows returned to app: 0
Error code: 42501
Message: permission denied for table date_selection
Hint: Grant the required privileges to the current role with:
      GRANT SELECT ON emaintraday.date_selection TO anon;
```

Service-role REST request also reached Supabase.

Result:

```text
HTTP 403
Time: 462.4 ms
Rows returned: 0
Error code: 42501
Message: permission denied for table date_selection
Hint: Grant the required privileges to the current role with:
      GRANT SELECT ON emaintraday.date_selection TO service_role;
```

## Query Shape Review

The code does not use `select *`.

The code requests these columns:

```text
"Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No"
```

Unnecessary for the calendar result:

```text
eff_dte
```

Sorting:

```text
Date ASC
Candle No DESC
```

The sort is not the bottleneck for the current table size. SQL execution completed in `0.47 ms` for all `546` rows.

The code requests all rows through pagination. With the current row count, that means one page of `546` rows because page size is `1000`.

## Determination

Is the query reaching Supabase?

```text
Yes.
```

Is the query returning rows through direct SQL?

```text
Yes. 546 rows exist and the ordered SQL query returns 546 rows.
```

Is the query returning rows through the app's Supabase Data API path?

```text
No. It returns 0 usable rows because Supabase rejects SELECT on the table.
```

Is the database query hanging?

```text
No. Direct SQL execution time is 0.47 ms.
```

Is the Data API request hanging?

```text
No in the direct backend probe. It returns a 42501 permission error in under 1 second.
```

Is the query timing out?

```text
The prior browser trace timed out waiting for the calendar render, but the proven backend cause is the Supabase Data API permission failure before rows can be returned.
```

Is the query returning empty results?

```text
No. The table is not empty. The API path errors before returning data.
```

## Root Cause

`emaintraday.date_selection` has data, and the SQL query is fast, but the Supabase Data API roles used by the application do not have `SELECT` privilege on the table.

The schema is reachable:

```text
schema_usage=true
```

The table is not selectable:

```text
table_select=false
```

Therefore the calendar cannot receive rows from Supabase. The modal opens quickly, but the calendar data path fails at the backend access-control layer.

## Single Fix

Grant read access on the calendar source table to the role used by the app.

Minimum app-facing fix:

```sql
GRANT SELECT ON emaintraday.date_selection TO anon;
```

If authenticated users are also expected to read the calendar:

```sql
GRANT SELECT ON emaintraday.date_selection TO authenticated;
```

Do not change UI code for this issue.
