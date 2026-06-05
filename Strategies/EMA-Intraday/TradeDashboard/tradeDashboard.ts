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
};

export type TradeCalendarResponse = {
  status: 'success' | 'error';
  dates?: TradeCalendarDateOption[];
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
const TRADE_DASHBOARD_ENDPOINT = '/api/ema-intraday/trade-dashboard';

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidQuantity(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
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

type TradeDashboardApiResponse =
  | {
      status: 'success';
      records?: TradeRecord[];
      record?: TradeRecord;
      message?: string;
    }
  | {
      status: 'error';
      message?: string;
    };
type TradeDashboardSuccessResponse = Extract<TradeDashboardApiResponse, { status: 'success' }>;

async function readTradeDashboardResponse(response: Response): Promise<TradeDashboardSuccessResponse> {
  const result = (await response.json()) as TradeDashboardApiResponse;

  if (!response.ok || result.status !== 'success') {
    throw new Error(result.message ?? `Trade dashboard request failed with HTTP ${response.status}.`);
  }

  return result;
}

export async function loadTradeRecords(): Promise<TradeRecord[]> {
  const response = await fetch(TRADE_DASHBOARD_ENDPOINT, {
    method: 'GET',
    credentials: 'include',
  });
  const result = await readTradeDashboardResponse(response);
  const records = result.records ?? [];

  return records.map((record) => normalizeLegacyRecord(record)).filter((value): value is TradeRecord => value !== null);
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
  const response = await fetch(TRADE_DASHBOARD_ENDPOINT, {
    method: editingId ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      editingId,
      record: {
        id: editingId,
        trade_date: draft.trade_date,
        track_strike: draft.track_strike,
        expiry: draft.expiry,
        gap_status: draft.gap_status,
        ema_status: draft.ema_status,
        legs: draft.legs,
      },
    }),
  });
  const result = await readTradeDashboardResponse(response);
  const record = result.record ?? null;
  if (!record) {
    throw new Error('Trade dashboard save did not return a record.');
  }

  return normalizeLegacyRecord(record) ?? record;
}

export async function deleteTradeEntry(recordId: string, tradeId: string) {
  const response = await fetch(TRADE_DASHBOARD_ENDPOINT, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      recordId,
      tradeId,
    }),
  });
  await readTradeDashboardResponse(response);
}

export async function fetchTradeCalendar(): Promise<TradeCalendarResponse> {
  const result = await readSupabaseTradeCalendar(supabase);
  if (result.status !== 'success') {
    throw new Error(result.message ?? 'Unable to load trade calendar.');
  }

  return result;
}
