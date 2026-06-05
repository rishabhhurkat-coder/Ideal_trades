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
};

export type TradeCalendarResponse = {
  status: 'success' | 'error';
  dates?: TradeCalendarDateOption[];
  message?: string;
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
  trade_date?: string;
  trade_time?: string;
  atm?: number | null;
  gap_value?: number | null;
  gap_percent?: number | null;
  gap_status?: string | null;
  ema_interaction?: string | null;
  near_ema?: number | null;
  ema1000?: number | null;
};

type ExpiryCalendarRow = {
  trade_date?: string;
  expiry_date?: string;
  dte?: number | null;
  eff_dte?: number | null;
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

const IDEAL_TRADES_SCHEMA = 'ideal_trades';

function schemaClient(client: IdealTradesClient) {
  return typeof client.schema === 'function' ? client.schema(IDEAL_TRADES_SCHEMA) : client;
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function readTradeCalendar(client: IdealTradesClient): Promise<TradeCalendarResponse> {
  const universeClient = typeof client.schema === 'function' ? client.schema('emaintraday') : client;
  const { data, error } = await universeClient
    .from('candidate_universe')
    .select('trade_date,expiry')
    .order('trade_date', { ascending: true })
    .order('expiry', { ascending: true });

  if (error) {
    return {
      status: 'error',
      message: error.message ?? 'Unable to load trade dates from Supabase.',
    };
  }

  const rows = Array.isArray(data) ? (data as Array<{ trade_date?: string; expiry?: string }>) : [];
  const seen = new Set<string>();
  const dates = rows.reduce<TradeCalendarDateOption[]>((accumulator, row) => {
    const date = formatDate(row.trade_date);
    const expiry = formatDate(row.expiry);
    if (!date || !expiry || seen.has(date)) return accumulator;
    seen.add(date);
    accumulator.push({ date, expiry });
    return accumulator;
  }, []);

  return {
    status: 'success',
    dates,
  };
}

export async function readTradeContext(client: IdealTradesClient, tradeDate: string): Promise<TradeContextResponse> {
  const calendarQuery = schemaClient(client)
    .from('expiry_calendar')
    .select('trade_date,expiry_date,dte,eff_dte')
    .eq('trade_date', tradeDate)
    .limit(1);
  const candleQuery = schemaClient(client)
    .from('ema_intraday_candles')
    .select('trade_date,trade_time,atm,gap_value,gap_percent,gap_status,ema_interaction,near_ema,ema1000')
    .eq('trade_date', tradeDate)
    .order('trade_time', { ascending: false })
    .limit(1);

  const [calendarResult, candleResult] = await Promise.all([calendarQuery, candleQuery]);

  if (calendarResult.error) {
    return {
      status: 'error',
      message: calendarResult.error.message ?? 'Unable to read expiry context from Supabase.',
    };
  }

  if (candleResult.error) {
    return {
      status: 'error',
      message: candleResult.error.message ?? 'Unable to read market context from Supabase.',
    };
  }

  const calendarRow = Array.isArray(calendarResult.data) ? (calendarResult.data[0] as ExpiryCalendarRow | undefined) : undefined;
  const candleRow = Array.isArray(candleResult.data) ? (candleResult.data[0] as EmaIntradayCandleRow | undefined) : undefined;

  if (!calendarRow || !candleRow) {
    return {
      status: 'error',
      message: `Trade context not found for ${tradeDate}.`,
    };
  }

  const atmStrike = toNumberOrNull(candleRow.atm);
  const expiry = formatDate(calendarRow.expiry_date);
  const dte = toNumberOrNull(calendarRow.dte);
  const effDte = toNumberOrNull(calendarRow.eff_dte);

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
    atmSourceDate: candleRow.trade_date ?? tradeDate,
    expirySourceDate: calendarRow.trade_date ?? tradeDate,
    gapValue: toNumberOrNull(candleRow.gap_value),
    gapPercent: toNumberOrNull(candleRow.gap_percent),
    gapStatus: candleRow.gap_status ?? null,
    emaStatus: candleRow.ema_interaction ?? null,
    nearEma: toNumberOrNull(candleRow.near_ema),
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
