import { readTradeCalendar as readSupabaseTradeCalendar } from '../../../Helper/Supabase/emaIntradayHistorical';
import { supabase } from '../../../Helper/Supabase/supabaseClient';

export type TradeOption = 'CE' | 'PE';

export type TradeEntryRecord = {
  id: string;
  option: TradeOption;
  trade_strike: number | null;
  quantity: number | null;
  entry_reason: string;
  exit_reason: string;
  entry_time: string;
  entry_price: number | null;
  exit_time: string;
  exit_price: number | null;
  pl: number | null;
};

export type TradeEntryDraft = {
  id: string;
  option: TradeOption;
  trade_strike: string;
  quantity: string;
  entry_reason: string;
  exit_reason: string;
  entry_time: string;
  entry_price: string;
  exit_time: string;
  exit_price: string;
};

export type TradeLegRecord = {
  leg_no: number;
  trades: TradeEntryRecord[];
};

export type TradeLegDraft = {
  leg_no: number;
  trades: TradeEntryDraft[];
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

export type TradeCalendarResponse = {
  status: 'success' | 'error';
  dates?: TradeCalendarDateOption[];
  trace?: TradeCalendarPerformanceTrace;
  message?: string;
};

export type TradeRecord = {
  id: string;
  trade_date: string;
  track_strike: number | null;
  expiry: string | null;
  gap_status: string;
  ema_status: string;
  legs: TradeLegRecord[];
  created_at: string;
  updated_at: string;
};

export type TradeRecordDraft = {
  trade_date: string;
  track_strike: string;
  expiry: string;
  gap_status: string;
  ema_status: string;
  legs: TradeLegDraft[];
};

const DEFAULT_TRADE_QUANTITY = '75';
const EOD_EXIT_TIME = '15:30';
const TRADE_DASHBOARD_STORAGE_KEY = 'ideal-trades.ema-intraday.trade-dashboard';
let tradeCalendarRequestCount = 0;

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getRememberedTradeQuantity() {
  return DEFAULT_TRADE_QUANTITY;
}

export function rememberTradeQuantity(quantity: string) {
  void quantity;
}

function emptyTradeEntryDraft(option: TradeOption = 'CE'): TradeEntryDraft {
  return {
    id: uuid(),
    option,
    trade_strike: '',
    quantity: getRememberedTradeQuantity(),
    entry_reason: '',
    exit_reason: '',
    entry_time: '',
    entry_price: '',
    exit_time: '',
    exit_price: '',
  };
}

function emptyTradeLegDraft(legNo: number): TradeLegDraft {
  return {
    leg_no: legNo,
    trades: [emptyTradeEntryDraft('CE')],
  };
}

function toNumberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTradeOption(value: unknown): value is TradeOption {
  return value === 'CE' || value === 'PE';
}

function oppositeOption(option: TradeOption): TradeOption {
  return option === 'CE' ? 'PE' : 'CE';
}

function computePoints(entryPrice: number | null, exitPrice: number | null) {
  if (entryPrice === null || exitPrice === null) return null;
  return Number((entryPrice - exitPrice).toFixed(2));
}

function computePl(entryPrice: number | null, exitPrice: number | null, quantity: number | null = 1) {
  const points = computePoints(entryPrice, exitPrice);
  if (points === null || quantity === null) return null;
  return Number((points * quantity).toFixed(2));
}

function hasDraftTradeContent(trade: TradeEntryDraft) {
  return Boolean(
    trade.trade_strike.trim() ||
      trade.quantity.trim() ||
      trade.entry_reason.trim() ||
      trade.exit_reason.trim() ||
      trade.entry_time.trim() ||
      trade.entry_price.trim() ||
      trade.exit_time.trim() ||
      trade.exit_price.trim(),
  );
}

function hasRecordTradeContent(trade: TradeEntryRecord) {
  return Boolean(
    trade.trade_strike !== null ||
      trade.quantity !== null ||
      trade.entry_reason.trim() ||
      trade.exit_reason.trim() ||
      trade.entry_time.trim() ||
      trade.entry_price !== null ||
      trade.exit_time.trim() ||
      trade.exit_price !== null,
  );
}

function normalizeDraftTrades(trades: TradeEntryDraft[]) {
  return trades
    .map((trade) => ({
      id: trade.id || uuid(),
      option: trade.option,
      trade_strike: trade.trade_strike.trim(),
      quantity: trade.quantity.trim(),
      entry_reason: trade.entry_reason.trim(),
      exit_reason: trade.exit_reason.trim(),
      entry_time: trade.entry_time,
      entry_price: trade.entry_price.trim(),
      exit_time: trade.exit_reason.trim() === 'EOD' ? EOD_EXIT_TIME : trade.exit_time,
      exit_price: trade.exit_price.trim(),
    }))
    .filter(hasDraftTradeContent);
}

function normalizeLoadedTrade(item: any): TradeEntryRecord | null {
  if (!item || typeof item !== 'object') return null;

  const option = isTradeOption(item.option) ? item.option : isTradeOption(item.side) ? item.side : 'CE';
  const tradeStrike = toNumberOrNull(typeof item.trade_strike === 'string' ? item.trade_strike : String(item.trade_strike ?? ''));
  const quantity = toNumberOrNull(typeof item.quantity === 'string' ? item.quantity : String(item.quantity ?? ''));
  const entryPrice = typeof item.entry_price === 'number' && Number.isFinite(item.entry_price) ? item.entry_price : null;
  const exitPrice = typeof item.exit_price === 'number' && Number.isFinite(item.exit_price) ? item.exit_price : null;
  const pl = typeof item.pl === 'number' && Number.isFinite(item.pl) ? item.pl : computePl(entryPrice, exitPrice, quantity);

  const trade: TradeEntryRecord = {
    id: typeof item.id === 'string' ? item.id : uuid(),
    option,
    trade_strike: tradeStrike,
    quantity: quantity ?? 1,
    entry_reason: typeof item.entry_reason === 'string' ? item.entry_reason : '',
    exit_reason: typeof item.exit_reason === 'string' ? item.exit_reason : '',
    entry_time: typeof item.entry_time === 'string' ? item.entry_time : '',
    entry_price: entryPrice,
    exit_time:
      typeof item.exit_time === 'string' && item.exit_time
        ? item.exit_time
        : typeof item.exit_reason === 'string' && item.exit_reason === 'EOD'
          ? EOD_EXIT_TIME
          : '',
    exit_price: exitPrice,
    pl,
  };

  return hasRecordTradeContent(trade) ? trade : null;
}

function normalizeLoadedLeg(item: any, fallbackLegNo: number): TradeLegRecord | null {
  if (!item || typeof item !== 'object') return null;

  if (Array.isArray(item.trades)) {
    const trades = (item.trades as unknown[]).map(normalizeLoadedTrade).filter((trade): trade is TradeEntryRecord => trade !== null);
    if (trades.length === 0) return null;
    return {
      leg_no: Number.isFinite(item.leg_no) ? Number(item.leg_no) : fallbackLegNo,
      trades,
    };
  }

  const legacyTrade = normalizeLoadedTrade({
    id: item.id,
    option: item.option ?? item.side ?? 'CE',
    trade_strike: item.trade_strike ?? item.atm_strike,
    quantity: item.quantity ?? 1,
    entry_reason: item.entry_reason ?? '',
    exit_reason: item.exit_reason ?? '',
    entry_time: item.entry_time ?? '',
    entry_price: item.entry_price ?? null,
    exit_time: item.exit_time ?? '',
    exit_price: item.exit_price ?? null,
    pl: item.pl ?? null,
  });

  if (!legacyTrade) return null;
  return {
    leg_no: Number.isFinite(item.leg_no) ? Number(item.leg_no) : fallbackLegNo,
    trades: [legacyTrade],
  };
}

function normalizeLegacyRecord(item: any): TradeRecord | null {
  if (!item || typeof item !== 'object') return null;

  const legs: TradeLegRecord[] = [];
  if (Array.isArray(item.legs)) {
    item.legs.forEach((leg: any, index: number) => {
      const normalizedLeg = normalizeLoadedLeg(leg, index + 1);
      if (normalizedLeg) legs.push(normalizedLeg);
    });
  }

  if (legs.length === 0) {
    const fallbackTrade = normalizeLoadedTrade({
      id: item.id,
      option: item.option ?? item.side ?? 'CE',
      trade_strike: item.trade_strike ?? item.atm_strike ?? item.track_strike,
      quantity: item.quantity ?? 1,
      entry_reason: item.entry_reason ?? '',
      exit_reason: item.exit_reason ?? '',
      entry_time: item.entry_time ?? '',
      entry_price: item.entry_price ?? null,
      exit_time: item.exit_time ?? '',
      exit_price: item.exit_price ?? null,
      pl: item.pl ?? null,
    });

    if (fallbackTrade) {
      legs.push({
        leg_no: 1,
        trades: [fallbackTrade],
      });
    }
  }

  if (legs.length === 0) return null;

  return {
    id: typeof item.id === 'string' ? item.id : uuid(),
    trade_date: typeof item.trade_date === 'string' ? item.trade_date : '',
    track_strike: typeof item.track_strike === 'number' && Number.isFinite(item.track_strike)
      ? item.track_strike
      : typeof item.atm_strike === 'number' && Number.isFinite(item.atm_strike)
        ? item.atm_strike
        : null,
    expiry: typeof item.expiry === 'string' && item.expiry ? item.expiry : null,
    gap_status: typeof item.gap_status === 'string' ? item.gap_status : '',
    ema_status: typeof item.ema_status === 'string' ? item.ema_status : '',
    legs,
    created_at: typeof item.created_at === 'string' ? item.created_at : nowIso(),
    updated_at: typeof item.updated_at === 'string' ? item.updated_at : nowIso(),
  };
}

export function emptyTradeDraft(): TradeRecordDraft {
  return {
    trade_date: '',
    track_strike: '',
    expiry: '',
    gap_status: '',
    ema_status: '',
    legs: [emptyTradeLegDraft(1)],
  };
}

export function emptyTradeEntry(option: TradeOption = 'CE') {
  return emptyTradeEntryDraft(option);
}

export function emptyTradeLeg(legNo: number) {
  return emptyTradeLegDraft(legNo);
}

function readStoredTradeRecords(): TradeRecord[] {
  if (typeof window === 'undefined') return [];

  const rawValue = window.localStorage.getItem(TRADE_DASHBOARD_STORAGE_KEY);
  console.info('SAVE_T6 JSON Parse', {
    storageKey: TRADE_DASHBOARD_STORAGE_KEY,
    hasValue: Boolean(rawValue),
    rawLength: rawValue?.length ?? 0,
  });

  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLegacyRecord).filter((value): value is TradeRecord => value !== null);
  } catch (error) {
    console.warn('Failed to parse stored trade dashboard records.', error);
    return [];
  }
}

function writeStoredTradeRecords(records: TradeRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TRADE_DASHBOARD_STORAGE_KEY, JSON.stringify(records));
}

function buildTradeRecordFromDraft(draft: TradeRecordDraft, editingId: string | null): TradeRecord {
  const existingRecord = editingId ? readStoredTradeRecords().find((record) => record.id === editingId) ?? null : null;
  const now = nowIso();

  return {
    id: existingRecord?.id ?? editingId ?? uuid(),
    trade_date: draft.trade_date,
    track_strike: toNumberOrNull(draft.track_strike),
    expiry: draft.expiry || null,
    gap_status: draft.gap_status,
    ema_status: draft.ema_status,
    legs: normalizeDraftLegs(draft.legs),
    created_at: existingRecord?.created_at ?? now,
    updated_at: now,
  };
}

export async function loadTradeRecords(): Promise<TradeRecord[]> {
  return readStoredTradeRecords();
}

function normalizeDraftLegs(legs: TradeLegDraft[]): TradeLegRecord[] {
  return legs
    .map((leg, index) => {
      const trades = normalizeDraftTrades(leg.trades)
        .map((trade) => {
          const entryPrice = toNumberOrNull(trade.entry_price);
          const exitPrice = toNumberOrNull(trade.exit_price);
          const quantity = toNumberOrNull(trade.quantity);
          return {
            id: trade.id || uuid(),
            option: trade.option,
            trade_strike: toNumberOrNull(trade.trade_strike),
            quantity,
            entry_reason: trade.entry_reason,
            exit_reason: trade.exit_reason,
            entry_time: trade.entry_time,
            entry_price: entryPrice,
            exit_time: trade.exit_time,
            exit_price: exitPrice,
            pl: computePl(entryPrice, exitPrice, quantity ?? 1),
          };
        })
        .filter(hasRecordTradeContent);

      return trades.length > 0
        ? {
            leg_no: Number.isFinite(leg.leg_no) ? Number(leg.leg_no) : index + 1,
            trades,
          }
        : null;
    })
    .filter((leg): leg is TradeLegRecord => leg !== null);
}

export async function saveTradeRecord(draft: TradeRecordDraft, editingId: string | null): Promise<TradeRecord> {
  const record = buildTradeRecordFromDraft(draft, editingId);
  console.info('SAVE_T2 Payload Created', {
    storageKey: TRADE_DASHBOARD_STORAGE_KEY,
    action: editingId ? 'update' : 'create',
    recordId: record.id,
    tradeDate: record.trade_date,
    legs: record.legs.length,
  });
  console.info('SAVE_T3 Request Sent', {
    storageKey: TRADE_DASHBOARD_STORAGE_KEY,
    action: editingId ? 'update' : 'create',
    recordId: record.id,
  });

  const records = readStoredTradeRecords();
  const nextRecords = records.some((entry) => entry.id === record.id)
    ? records.map((entry) => (entry.id === record.id ? record : entry))
    : [...records, record];
  writeStoredTradeRecords(nextRecords);

  console.info('SAVE_T4 Response Status', {
    storageKey: TRADE_DASHBOARD_STORAGE_KEY,
    status: 'success',
    recordCount: nextRecords.length,
  });
  console.info('SAVE_T5 Response Body', record);

  return record;
}

export async function deleteTradeEntry(recordId: string, tradeId: string) {
  const records = readStoredTradeRecords();
  const nextRecords = records
    .map((record) => {
      if (record.id !== recordId) return record;

      const nextLegs = record.legs
        .map((leg) => ({
          ...leg,
          trades: leg.trades.filter((trade) => trade.id !== tradeId),
        }))
        .filter((leg) => leg.trades.length > 0);

      return nextLegs.length > 0 ? { ...record, legs: nextLegs, updated_at: nowIso() } : null;
    })
    .filter((record): record is TradeRecord => record !== null);

  writeStoredTradeRecords(nextRecords);
}

export async function fetchTradeCalendar(): Promise<TradeCalendarResponse> {
  const requestId = ++tradeCalendarRequestCount;
  const startedAt = performance.now();
  console.info(`[EMA Trade Perf] fetchTradeCalendar start #${requestId}`);
  const result = await readSupabaseTradeCalendar(supabase);
  if (result.status !== 'success') {
    throw new Error(result.message ?? 'Unable to load trade calendar.');
  }

  if (result.trace) {
    console.info(
      `[EMA Trade Perf] fetchTradeCalendar end #${requestId} duration=${(performance.now() - startedAt).toFixed(1)}ms rows=${result.trace.rowsReturned} uniqueDates=${result.trace.uniqueDatesReturned} pages=${result.trace.pageCount}`,
    );
  } else {
    console.info(`[EMA Trade Perf] fetchTradeCalendar end #${requestId} duration=${(performance.now() - startedAt).toFixed(1)}ms`);
  }
  return result;
}
