export type IdealTradesClient = {
  from: (table: string) => {
    select: (columns: string) => any;
    insert?: (rows: unknown[] | Record<string, unknown>) => any;
    upsert?: (rows: unknown[] | Record<string, unknown>, options?: { onConflict?: string; ignoreDuplicates?: boolean }) => any;
    update?: (values: Record<string, unknown>) => any;
    eq?: (column: string, value: unknown) => any;
    in?: (column: string, values: unknown[]) => any;
    order?: (column: string, options?: { ascending?: boolean }) => any;
    limit?: (count: number) => any;
    range?: (from: number, to: number) => any;
  };
  schema?: (name: string) => IdealTradesClient;
};

export type TradeCalendarExpiryOption = {
  expiry: string;
  firstDate: string;
  lastDate: string;
  eligibleDates: number;
};

export type TradeCalendarDateOption = {
  date: string;
  expiry: string;
  dte: number | null;
  strike: number | null;
  gapValue: number | null;
  gapStatus: string | null;
  emaStatus: string | null;
};

export type TradeCalendarResponse = {
  status: 'success' | 'error';
  dates?: TradeCalendarDateOption[];
  trace?: TradeCalendarPerformanceTrace;
  message?: string;
};

export type EmaIntradayTimeRow = {
  hour: number | string | null;
  minute: number | string | null;
  candle_time: string | null;
};

export type EmaIntradayTimeResponse = {
  status: 'success' | 'error';
  rows?: EmaIntradayTimeRow[];
  message?: string;
};

export type UniverseLoadRow = {
  trade_date: string;
  expiry: string;
  load_status: string | null;
};

export type UniverseLoadResponse = {
  status: 'success' | 'error';
  rows?: UniverseLoadRow[];
  message?: string;
};

export type TradeCalendarPerformanceTrace = {
  query: string;
  columns: string;
  orderBy: string[];
  pageSize: number;
  pageCount: number;
  rowsReturned: number;
  uniqueDatesReturned: number;
  duplicateRowsSkipped: number;
  t2QueryStart: number;
  t3ResponseReceived: number;
  t4TransformComplete: number;
  backendMs: number;
  transformMs: number;
};

export type TradeContextResponse = {
  status: 'success' | 'error';
  tradeDate?: string;
  atmStrike?: number;
  expiry?: string;
  dte?: number;
  effDte?: number;
  atmSourceDate?: string | null;
  expirySourceDate?: string | null;
  gapValue?: number | null;
  gapPercent?: number | null;
  gapStatus?: string | null;
  emaStatus?: string | null;
  nearEma?: number | null;
  message?: string;
};

export type NiftyMarketStateResponse = {
  status: 'success' | 'error';
  stateKey?: string;
  symbol?: string;
  instrumentToken?: number;
  timeframe?: string;
  interval?: string;
  firstCandle?: string;
  lastCandle?: string;
  latestCandleTimestamp?: string | null;
  latestOpen?: number | null;
  latestHigh?: number | null;
  latestLow?: number | null;
  latestClose?: number | null;
  latestVolume?: number | null;
  latestAtm?: number | null;
  latestEma1000?: number | null;
  latestEmaInteraction?: string | null;
  latestGapValue?: number | null;
  latestGapPercent?: number | null;
  latestGapStatus?: string | null;
  latestNearEma?: number | null;
  totalRecords?: number;
  lastUpdate?: string | null;
  source?: string | null;
  message?: string;
};

type EmaIntradayCandleRow = {
  Date?: string;
  expiry?: string;
  dte?: number | null;
  ATM?: number | null;
  GAP?: number | null;
  GAP_STATUS?: string | null;
  EMA_Status?: string | null;
  eff_dte?: number | null;
  'Candle No'?: number | null;
};

type NiftyMarketStateRow = {
  state_key?: string;
  symbol?: string;
  instrument_token?: number | null;
  timeframe?: string;
  interval?: string;
  first_candle?: string | null;
  last_candle?: string | null;
  latest_candle_timestamp?: string | null;
  latest_open?: number | null;
  latest_high?: number | null;
  latest_low?: number | null;
  latest_close?: number | null;
  latest_volume?: number | null;
  latest_atm?: number | null;
  latest_ema_1000?: number | null;
  latest_ema_interaction?: string | null;
  latest_gap_value?: number | null;
  latest_gap_percent?: number | null;
  latest_gap_status?: string | null;
  latest_near_ema?: number | null;
  total_records?: number | null;
  last_update?: string | null;
  source?: string | null;
};

const EMA_INTRADAY_SCHEMA = 'emaintraday';

function schemaClient(client: IdealTradesClient, schema = EMA_INTRADAY_SCHEMA) {
  return typeof client.schema === 'function' ? client.schema(schema) : client;
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: unknown) {
  return typeof value === 'string' ? value : '';
}

type TimedRows<T> = {
  data: T[];
  error: { message?: string } | null;
  durationMs: number;
  pageCount: number;
  startedAt: number;
  completedAt: number;
};

async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => Promise<{ data: unknown; error: { message?: string } | null }>,
): Promise<TimedRows<T>> {
  const pageSize = 1000;
  const rows: T[] = [];
  const startedAt = performance.now();
  let pageCount = 0;

  for (let start = 0; ; start += pageSize) {
    pageCount += 1;
    const response = await buildQuery(start, start + pageSize - 1);
    if (response.error) {
      return {
        data: rows,
        error: response.error,
        durationMs: performance.now() - startedAt,
        pageCount,
        startedAt,
        completedAt: performance.now(),
      };
    }

    const pageRows = Array.isArray(response.data) ? (response.data as T[]) : [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }
  }

  return {
    data: rows,
    error: null,
    durationMs: performance.now() - startedAt,
    pageCount,
    startedAt,
    completedAt: performance.now(),
  };
}

export async function readTradeCalendar(client: IdealTradesClient): Promise<TradeCalendarResponse> {
  const dateSelectionClient = schemaClient(client, 'emaintraday');
  const calendarColumns = '"Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No"';

  const startedAt = performance.now();
  const selectionResult = await fetchAllRows<EmaIntradayCandleRow>(async (from, to) =>
    dateSelectionClient
      .from('date_selection')
      .select(calendarColumns)
      .order('Date', { ascending: true })
      .order('Candle No', { ascending: false })
      .range(from, to),
  );

  if (selectionResult.error) {
    return {
      status: 'error',
      message: selectionResult.error.message ?? 'Unable to load trade dates from Supabase.',
    };
  }

  const seen = new Set<string>();
  let duplicateRowsSkipped = 0;
  const dates = selectionResult.data.reduce<TradeCalendarDateOption[]>((accumulator, row) => {
    const date = formatDate(row.Date);
    const expiry = formatDate(row.expiry);
    if (!date || !expiry) return accumulator;
    if (seen.has(date)) {
      duplicateRowsSkipped += 1;
      return accumulator;
    }
    seen.add(date);
    accumulator.push({
      date,
      expiry,
      dte: toNumberOrNull(row.dte),
      strike: toNumberOrNull(row.ATM),
      gapValue: toNumberOrNull(row.GAP),
      gapStatus: row.GAP_STATUS ?? null,
      emaStatus: row.EMA_Status ?? null,
    });
    return accumulator;
  }, []);
  const transformCompletedAt = performance.now();
  const trace: TradeCalendarPerformanceTrace = {
    query:
      'emaintraday.date_selection.select("Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No").order("Date", ascending true).order("Candle No", ascending false).range(...)',
    columns: calendarColumns,
    orderBy: ['Date ASC', 'Candle No DESC'],
    pageSize: 1000,
    pageCount: selectionResult.pageCount,
    rowsReturned: selectionResult.data.length,
    uniqueDatesReturned: dates.length,
    duplicateRowsSkipped,
    t2QueryStart: selectionResult.startedAt,
    t3ResponseReceived: selectionResult.completedAt,
    t4TransformComplete: transformCompletedAt,
    backendMs: selectionResult.completedAt - selectionResult.startedAt,
    transformMs: transformCompletedAt - selectionResult.completedAt,
  };

  console.info(
    `[EMA Trade Perf] trade_calendar rows=${trace.rowsReturned} uniqueDates=${trace.uniqueDatesReturned} duplicateRows=${trace.duplicateRowsSkipped} backend=${trace.backendMs.toFixed(1)}ms transform=${trace.transformMs.toFixed(1)}ms total=${(performance.now() - startedAt).toFixed(1)}ms pages=${selectionResult.pageCount}`,
  );

  return {
    status: 'success',
    dates,
    trace,
  };
}

export async function readEmaIntradayTimeTable(client: IdealTradesClient): Promise<EmaIntradayTimeResponse> {
  const timeClient = schemaClient(client, 'emaintraday');
  const { data, error } = await timeClient
    .from('time')
    .select('hour,minute,candle_time')
    .order('candle_time', { ascending: true });

  if (error) {
    return {
      status: 'error',
      message: error.message ?? 'Unable to load emaintraday.time from Supabase.',
    };
  }

  return {
    status: 'success',
    rows: Array.isArray(data) ? (data as EmaIntradayTimeRow[]) : [],
  };
}

export async function readUniverseLoadRows(client: IdealTradesClient): Promise<UniverseLoadResponse> {
  const loadClient = schemaClient(client, 'emaintraday');
  const { data, error } = await loadClient.from('universe_loads').select('trade_date,expiry,load_status').order('trade_date', { ascending: true }).order('expiry', { ascending: true });

  if (error) {
    return {
      status: 'error',
      message: error.message ?? 'Unable to load emaintraday.universe_loads from Supabase.',
    };
  }

  return {
    status: 'success',
    rows: Array.isArray(data)
      ? (data as UniverseLoadRow[])
      : [],
  };
}

export async function readTradeContext(client: IdealTradesClient, tradeDate: string): Promise<TradeContextResponse> {
  const dateSelectionClient = schemaClient(client, 'emaintraday');

  const startedAt = performance.now();
  const selectionResult = await fetchAllRows<EmaIntradayCandleRow>(async (from, to) =>
    dateSelectionClient
      .from('date_selection')
      .select('"Date","expiry","dte","ATM","GAP","GAP_STATUS","EMA_Status","eff_dte","Candle No"')
      .eq('Date', tradeDate)
      .order('Candle No', { ascending: false })
      .range(from, to),
  );

  if (selectionResult.error) {
    return {
      status: 'error',
      message: selectionResult.error.message ?? 'Unable to read trade date context from Supabase.',
    };
  }

  console.info(
    `[EMA Trade Perf] trade_context query duration=${selectionResult.durationMs.toFixed(1)}ms (${selectionResult.pageCount} calls) total=${(performance.now() - startedAt).toFixed(1)}ms`,
  );

  const selectionRow = selectionResult.data[0] ?? null;
  if (!selectionRow) {
    return {
      status: 'error',
      message: `Trade context not found for ${tradeDate}.`,
    };
  }

  const expiry = formatDate(selectionRow.expiry);
  const atmStrike = toNumberOrNull(selectionRow.ATM);
  const dte = toNumberOrNull(selectionRow.dte);
  const effDte = toNumberOrNull(selectionRow.eff_dte);

  if (atmStrike === null || !expiry || dte === null || effDte === null) {
    return {
      status: 'error',
      message: `Trade context is incomplete for ${tradeDate}.`,
    };
  }

  return {
    status: 'success',
    tradeDate,
    atmStrike,
    expiry,
    dte,
    effDte,
    atmSourceDate: selectionRow.Date ?? tradeDate,
    expirySourceDate: selectionRow.Date ?? tradeDate,
    gapValue: toNumberOrNull(selectionRow.GAP),
    gapPercent: null,
    gapStatus: selectionRow.GAP_STATUS ?? null,
    emaStatus: selectionRow.EMA_Status ?? null,
    nearEma: null,
  };
}

export async function readNiftyMarketState(
  client: IdealTradesClient,
  stateKey = 'NIFTY_50_3MIN',
): Promise<NiftyMarketStateResponse> {
  const { data, error } = await schemaClient(client)
    .from('nifty_market_state')
    .select(
      'state_key,symbol,instrument_token,timeframe,interval,first_candle,last_candle,latest_candle_timestamp,latest_open,latest_high,latest_low,latest_close,latest_volume,latest_atm,latest_ema_1000,latest_ema_interaction,latest_gap_value,latest_gap_percent,latest_gap_status,latest_near_ema,total_records,last_update,source',
    )
    .eq('state_key', stateKey)
    .limit(1);

  if (error) {
    return {
      status: 'error',
      message: error.message ?? 'Unable to load market state from Supabase.',
    };
  }

  const row = Array.isArray(data) ? (data[0] as NiftyMarketStateRow | undefined) : undefined;
  if (!row) {
    return {
      status: 'error',
      message: `No market state found for ${stateKey}.`,
    };
  }

  return {
    status: 'success',
    stateKey: row.state_key,
    symbol: row.symbol,
    instrumentToken: row.instrument_token ?? undefined,
    timeframe: row.timeframe,
    interval: row.interval,
    firstCandle: row.first_candle ?? undefined,
    lastCandle: row.last_candle ?? undefined,
    latestCandleTimestamp: row.latest_candle_timestamp ?? undefined,
    latestOpen: toNumberOrNull(row.latest_open),
    latestHigh: toNumberOrNull(row.latest_high),
    latestLow: toNumberOrNull(row.latest_low),
    latestClose: toNumberOrNull(row.latest_close),
    latestVolume: toNumberOrNull(row.latest_volume),
    latestAtm: toNumberOrNull(row.latest_atm),
    latestEma1000: toNumberOrNull(row.latest_ema_1000),
    latestEmaInteraction: row.latest_ema_interaction ?? undefined,
    latestGapValue: toNumberOrNull(row.latest_gap_value),
    latestGapPercent: toNumberOrNull(row.latest_gap_percent),
    latestGapStatus: row.latest_gap_status ?? undefined,
    latestNearEma: toNumberOrNull(row.latest_near_ema),
    totalRecords: toNumberOrNull(row.total_records) ?? undefined,
    lastUpdate: row.last_update ?? undefined,
    source: row.source ?? undefined,
  };
}
