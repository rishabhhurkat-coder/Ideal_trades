import { createPortal } from 'react-dom';
import { type CSSProperties, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readTradeCalendar as readSupabaseTradeCalendar } from '../../../Helper/Supabase/emaIntradayHistorical';
import { supabase } from '../../../Helper/Supabase/supabaseClient';
import { fetchEntryReasons, fetchExitReasons, fetchTradeTransitionRules } from '../Masters/mastersService';
import type { EntryReason, ExitReason, TradeTransitionRule } from '../Masters/masters';
import { TradeDateCalendar } from './TradeDateCalendar';

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
  pl_points: number | null;
  pl_amount: number | null;
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
  created_from_leg_no: number | null;
  trigger_exit_reason: string;
  trades: TradeEntryRecord[];
};

export type TradeLegDraft = {
  leg_no: number;
  created_from_leg_no: number | null;
  trigger_exit_reason: string;
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

type OptionSeriesStrikeOption = {
  strike: string;
  close: number | null;
};

type OptionSeriesStrikeResponse = {
  status: 'success' | 'error';
  rows?: OptionSeriesStrikeOption[];
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

const DEFAULT_TRADE_QUANTITY = '1300';
const NORMAL_ENTRY_CUTOFF_MINUTES = 9 * 60 + 30;
const TRADE_DATA_SCHEMA = 'emaintraday';
const TRADE_DATA_TABLE = 'trade_data';
const TRADE_DATA_STRATEGY = 'EMA Intraday';
const TRADE_DATA_SCRIPT = 'NIFTY';
const LEGACY_TRADE_DASHBOARD_STORAGE_KEY = 'ideal-trades.ema-intraday.trade-dashboard';
const HIDDEN_REASON_NAMES = new Set(['CE SL Trigger', 'PE SL Trigger', 'Manual Entry']);
let tradeCalendarRequestCount = 0;

if (typeof window !== 'undefined') {
  window.localStorage.removeItem(LEGACY_TRADE_DASHBOARD_STORAGE_KEY);
}

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
    created_from_leg_no: null,
    trigger_exit_reason: '',
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

function computeRowPnl(entryPrice: string, exitPrice: string, quantity: string) {
  return computePl(parseNumberOrNull(entryPrice), parseNumberOrNull(exitPrice), parseNumberOrNull(quantity));
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
      exit_time: trade.exit_time,
      exit_price: trade.exit_price.trim(),
    }))
    .filter(hasDraftTradeContent);
}

type TradeDataRow = {
  id: string;
  lifecycle_id: string;
  strategy: string | null;
  script: string | null;
  trade_date: string | null;
  expiry: string | null;
  gap_status: string | null;
  ema_status: string | null;
  leg_no: number | null;
  option_type: string | null;
  strike: number | null;
  quantity: number | null;
  entry_date: string | null;
  entry_time: string | null;
  entry_price: number | null;
  entry_reason: string | null;
  exit_date: string | null;
  exit_time: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  pl_points: number | null;
  pl_amount: number | null;
  trade_status: string | null;
  remarks: string | null;
  trade: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeLoadedTrade(item: any): TradeEntryRecord | null {
  if (!item || typeof item !== 'object') return null;

  const option = isTradeOption(item.option_type) ? item.option_type : isTradeOption(item.option) ? item.option : isTradeOption(item.side) ? item.side : 'CE';
  const tradeStrike = toNumberOrNull(
    typeof item.strike === 'number' || typeof item.strike === 'string' ? String(item.strike ?? '') : typeof item.trade_strike === 'string' ? item.trade_strike : String(item.trade_strike ?? ''),
  );
  const quantity = toNumberOrNull(typeof item.quantity === 'number' || typeof item.quantity === 'string' ? String(item.quantity ?? '') : String(item.quantity ?? ''));
  const entryPrice = typeof item.entry_price === 'number' && Number.isFinite(item.entry_price) ? item.entry_price : null;
  const exitPrice = typeof item.exit_price === 'number' && Number.isFinite(item.exit_price) ? item.exit_price : null;
  const plPoints = typeof item.pl_points === 'number' && Number.isFinite(item.pl_points) ? item.pl_points : null;
  const plAmount =
    typeof item.pl_amount === 'number' && Number.isFinite(item.pl_amount)
      ? item.pl_amount
      : typeof item.pl === 'number' && Number.isFinite(item.pl)
        ? item.pl
        : null;

  const trade: TradeEntryRecord = {
    id: typeof item.id === 'string' ? item.id : uuid(),
    option,
    trade_strike: tradeStrike,
    quantity: quantity ?? 1,
    entry_reason: typeof item.entry_reason === 'string' ? item.entry_reason : '',
    exit_reason: typeof item.exit_reason === 'string' ? item.exit_reason : '',
    entry_time: typeof item.entry_time === 'string' ? item.entry_time : '',
    entry_price: entryPrice,
    exit_time: typeof item.exit_time === 'string' ? item.exit_time : '',
    exit_price: exitPrice,
    pl_points: plPoints,
    pl_amount: plAmount,
    pl: plAmount,
  };

  return hasRecordTradeContent(trade) ? trade : null;
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

function normalizeDraftLegs(legs: TradeLegDraft[]): TradeLegRecord[] {
  return legs
    .map((leg, index) => {
      const trades = normalizeDraftTrades(leg.trades)
        .map((trade) => {
          const entryPrice = toNumberOrNull(trade.entry_price);
          const exitPrice = toNumberOrNull(trade.exit_price);
          const quantity = toNumberOrNull(trade.quantity);
          const plAmount = computePl(entryPrice, exitPrice, quantity ?? 1);
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
            pl_points: null,
            pl_amount: plAmount,
            pl: plAmount,
          } satisfies TradeEntryRecord;
        })
        .filter((trade) => hasRecordTradeContent(trade as TradeEntryRecord)) as TradeEntryRecord[];

      return trades.length > 0
        ? {
            leg_no: Number.isFinite(leg.leg_no) ? Number(leg.leg_no) : index + 1,
            created_from_leg_no:
              typeof leg.created_from_leg_no === 'number' && Number.isFinite(leg.created_from_leg_no) ? Number(leg.created_from_leg_no) : null,
            trigger_exit_reason: typeof leg.trigger_exit_reason === 'string' ? leg.trigger_exit_reason : '',
            trades,
          }
        : null;
    })
    .filter((leg): leg is TradeLegRecord => leg !== null);
}

function getTradeDataSchemaClient() {
  return typeof supabase.schema === 'function' ? supabase.schema(TRADE_DATA_SCHEMA) : supabase;
}

function parseRowNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildTradeDataRowsFromDraft(draft: TradeRecordDraft, lifecycleId: string, existingRows: TradeDataRow[] = []) {
  const existingRowsById = new Map(existingRows.map((row) => [row.id, row] as const));
  const now = nowIso();

  return normalizeDraftLegs(draft.legs).flatMap((leg) =>
    leg.trades.map((trade) => {
      const hasEntryTime = Boolean(trade.entry_time.trim());
      const hasExitTime = Boolean(trade.exit_time.trim());
      const existingRow = existingRowsById.get(trade.id);

      if (!hasEntryTime || !hasExitTime) {
        if (existingRow) {
          return existingRow;
        }
        return null;
      }

      const entryPrice = trade.entry_price;
      const exitPrice = trade.exit_price;
      const quantity = trade.quantity;
      const points = computePoints(entryPrice, exitPrice);
      const amount = computePl(entryPrice, exitPrice, quantity ?? 1);
      const isClosed = Boolean(trade.exit_reason.trim() || trade.exit_time.trim() || trade.exit_price !== null);

      return {
        id: trade.id,
        lifecycle_id: lifecycleId,
        strategy: TRADE_DATA_STRATEGY,
        script: TRADE_DATA_SCRIPT,
        trade_date: draft.trade_date || null,
        expiry: draft.expiry || null,
        gap_status: draft.gap_status || null,
        ema_status: draft.ema_status || null,
        leg_no: leg.leg_no,
        option_type: trade.option,
        strike: trade.trade_strike,
        quantity,
        entry_date: draft.trade_date || null,
        entry_time: trade.entry_time || null,
        entry_price: entryPrice,
        entry_reason: trade.entry_reason || null,
        exit_date: draft.trade_date || null,
        exit_time: trade.exit_time || null,
        exit_price: exitPrice,
        exit_reason: trade.exit_reason || null,
        pl_points: points,
        pl_amount: amount,
        trade_status: isClosed ? 'CLOSED' : 'OPEN',
        remarks: null,
        trade: 'SELL',
        created_at: existingRow?.created_at ?? now,
        updated_at: now,
      } satisfies TradeDataRow;
    }).filter((row): row is TradeDataRow => row !== null),
  );
}

function groupTradeDataRows(rows: TradeDataRow[]): TradeRecord[] {
  const recordsByLifecycle = new Map<string, TradeDataRow[]>();
  rows.forEach((row) => {
    const lifecycleId = row.lifecycle_id?.trim();
    if (!lifecycleId) return;
    const current = recordsByLifecycle.get(lifecycleId) ?? [];
    current.push(row);
    recordsByLifecycle.set(lifecycleId, current);
  });

  return Array.from(recordsByLifecycle.entries())
    .map(([lifecycleId, lifecycleRows]) => {
      const recordRows = [...lifecycleRows].sort((left, right) => {
        const legCompare = (left.leg_no ?? 0) - (right.leg_no ?? 0);
        if (legCompare !== 0) return legCompare;
        const leftOption = left.option_type === 'PE' ? 1 : 0;
        const rightOption = right.option_type === 'PE' ? 1 : 0;
        if (leftOption !== rightOption) return leftOption - rightOption;
        return (left.entry_time ?? '').localeCompare(right.entry_time ?? '');
      });

      const legsByNo = new Map<number, TradeDataRow[]>();
      recordRows.forEach((row) => {
        const legNo = parseRowNumber(row.leg_no) ?? 0;
        const current = legsByNo.get(legNo) ?? [];
        current.push(row);
        legsByNo.set(legNo, current);
      });

      const legs = Array.from(legsByNo.entries())
        .sort(([left], [right]) => left - right)
        .map(([legNo, legRows]) => ({
          leg_no: legNo,
          created_from_leg_no: null,
          trigger_exit_reason: '',
          trades: legRows
            .sort((left, right) => {
              const leftOption = left.option_type === 'PE' ? 1 : 0;
              const rightOption = right.option_type === 'PE' ? 1 : 0;
              if (leftOption !== rightOption) return leftOption - rightOption;
              return (left.entry_time ?? '').localeCompare(right.entry_time ?? '');
            })
            .map(normalizeLoadedTrade)
            .filter((trade): trade is TradeEntryRecord => trade !== null),
        }))
        .filter((leg) => leg.trades.length > 0);

      const firstRow = recordRows[0] ?? null;
      const firstNonNullStrike = recordRows.find((row) => row.strike !== null)?.strike ?? null;
      const createdAt = recordRows
        .map((row) => row.created_at)
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .sort((left, right) => left.localeCompare(right))[0] ?? nowIso();
      const updatedAt = recordRows
        .map((row) => row.updated_at)
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .sort((left, right) => right.localeCompare(left))[0] ?? nowIso();

      return {
        id: lifecycleId,
        trade_date: firstRow?.trade_date ?? '',
        track_strike: firstNonNullStrike,
        expiry: firstRow?.expiry ?? null,
        gap_status: firstRow?.gap_status ?? '',
        ema_status: firstRow?.ema_status ?? '',
        legs,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

async function readTradeDataRowsByLifecycleId(lifecycleId: string) {
  const { data, error } = await getTradeDataSchemaClient()
    .from(TRADE_DATA_TABLE)
    .select('*')
    .eq('lifecycle_id', lifecycleId)
    .order('leg_no', { ascending: true })
    .order('option_type', { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? (data as TradeDataRow[]) : [];
}

export async function loadTradeRecords(): Promise<TradeRecord[]> {
  const { data, error } = await getTradeDataSchemaClient()
    .from(TRADE_DATA_TABLE)
    .select('*')
    .order('lifecycle_id', { ascending: true })
    .order('leg_no', { ascending: true })
    .order('option_type', { ascending: true })
    .order('entry_time', { ascending: true });

  if (error) throw error;
  return groupTradeDataRows(Array.isArray(data) ? (data as TradeDataRow[]) : []);
}

export async function saveTradeRecord(draft: TradeRecordDraft, editingId: string | null): Promise<TradeRecord> {
  const lifecycleId = editingId ?? uuid();
  const existingRows = editingId ? await readTradeDataRowsByLifecycleId(lifecycleId) : [];
  const record = {
    id: lifecycleId,
    trade_date: draft.trade_date,
    track_strike: toNumberOrNull(draft.track_strike),
    expiry: draft.expiry || null,
    gap_status: draft.gap_status,
    ema_status: draft.ema_status,
    legs: normalizeDraftLegs(draft.legs),
    created_at: existingRows[0]?.created_at ?? nowIso(),
    updated_at: nowIso(),
  } satisfies TradeRecord;
  const rowsToSave = buildTradeDataRowsFromDraft(draft, lifecycleId, existingRows);
  const rowsToSaveIds = new Set(rowsToSave.map((row) => row.id));

  console.info('SAVE_T2 Payload Created', {
    table: TRADE_DATA_TABLE,
    action: editingId ? 'update' : 'create',
    lifecycleId,
    rowCount: rowsToSave.length,
    tradeDate: record.trade_date,
    legs: record.legs.length,
  });

  const db = getTradeDataSchemaClient().from(TRADE_DATA_TABLE);
  if (rowsToSave.length > 0) {
    const { error: upsertError } = await db.upsert(rowsToSave, { onConflict: 'id' });
    if (upsertError) throw upsertError;
  }

  const staleRowIds = existingRows.map((row) => row.id).filter((id) => !rowsToSaveIds.has(id));
  if (staleRowIds.length > 0) {
    const { error: deleteError } = await db.delete().eq('lifecycle_id', lifecycleId).in('id', staleRowIds);
    if (deleteError) throw deleteError;
  }

  console.info('SAVE_T3 Supabase Write Complete', {
    table: TRADE_DATA_TABLE,
    lifecycleId,
    rowCount: rowsToSave.length,
    deletedRows: staleRowIds.length,
  });

  return record;
}

export async function deleteTradeEntry(recordId: string, tradeId: string) {
  const { error } = await getTradeDataSchemaClient().from(TRADE_DATA_TABLE).delete().eq('lifecycle_id', recordId).eq('id', tradeId);
  if (error) throw error;
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


type TradePerfTimeline = {
  t1ModalOpenStart?: number;
  t2QueryStart?: number;
  t3ResponseReceived?: number;
  t4TransformComplete?: number;
  t5CalendarStatePopulated?: number;
  t6FirstCalendarRenderComplete?: number;
  rowsReturned?: number;
  uniqueDatesReturned?: number;
  duplicateRowsSkipped?: number;
  pageCount?: number;
  query?: string;
  columns?: string;
  orderBy?: string[];
  backendMs?: number;
  transformMs?: number;
  reactStateMs?: number;
  renderMs?: number;
  totalMs?: number;
  calendarBuildMs?: number;
  modalVisibleMs?: number;
  sourceTrace?: TradeCalendarPerformanceTrace;
  modalVisibleAt?: number;
};

function getTradePerfTimeline() {
  return window as Window & {
    __emaTradePerf?: TradePerfTimeline;
  };
}

function toStatusClass(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function formatGapBadge(option: TradeCalendarDateOption | null) {
  if (!option?.gapStatus) {
    return {
      label: '-',
      statusClass: '',
    };
  }

  const normalizedStatus = option.gapStatus.trim().toLowerCase();
  const roundedGapValue = option.gapValue === null || option.gapValue === undefined ? null : Math.round(Math.abs(option.gapValue));

  if (normalizedStatus === 'no gap') {
    return {
      label: 'NO GAP',
      statusClass: 'status-no-gap',
    };
  }

  if (normalizedStatus.includes('gap dn') || normalizedStatus.includes('gap down') || (option.gapValue ?? 0) < 0) {
    return {
      label: `GAP DN - ${roundedGapValue ?? ''}`.trim(),
      statusClass: 'status-gap-down',
    };
  }

  if (normalizedStatus.includes('gap up') || (option.gapValue ?? 0) > 0) {
    return {
      label: `GAP UP + ${roundedGapValue ?? ''}`.trim(),
      statusClass: 'status-gap-up',
    };
  }

  return {
    label: option.gapStatus.toUpperCase(),
    statusClass: `status-${toStatusClass(option.gapStatus)}`,
  };
}

type TradeRow = {
  recordId: string;
  tradeId: string;
  expiry: string;
  trackStrike: number | null;
  legNo: number;
  tradeIndex: number;
  option: TradeOption;
  tradeStrike: number | null;
  entryReason: string;
  exitReason: string;
  tradeDate: string;
  entryTime: string;
  entryPrice: number | null;
  exitTime: string;
  exitPrice: number | null;
  pl: number | null;
  record: TradeRecord;
  leg: { leg_no: number; trades: TradeEntryRecord[] };
  trade: TradeEntryRecord;
};

type DashboardPreset = 'all' | 'today' | 'week' | 'month' | 'profitable' | 'losing' | 'maxDd' | 'custom';

type DashboardColumnKey =
  | 'tradeDate'
  | 'expiry'
  | 'trade'
  | 'option'
  | 'strike'
  | 'entryReason'
  | 'entryDate'
  | 'entryTime'
  | 'entryPrice'
  | 'exitReason'
  | 'exitDate'
  | 'exitTime'
  | 'exitPrice'
  | 'quantity'
  | 'plPoints'
  | 'plAmount'
  | 'ddPoints'
  | 'ddAmount'
  ;

type DashboardRow = TradeRow & {
  qtyDisplay: number;
  plPoints: number;
  ddPoints: number;
  plAmount: number;
  ddAmount: number;
};

type ColumnFilterMap = Record<DashboardColumnKey, string[]>;

type TradeDashboardSettings = {
  allowedDte: number[];
  emaProximity: number[];
  gapValues: number[];
};

type TradeDashboardSettingsKey = keyof TradeDashboardSettings;

type SettingsOptionGroupProps = {
  label: string;
  description: string;
  values: number[];
  selectedValues: number[];
  onToggle: (value: number) => void;
};

type TradeDashboardSettingsModalProps = {
  open: boolean;
  settings: TradeDashboardSettings;
  onClose: () => void;
  onSave: (settings: TradeDashboardSettings) => void;
};

const DASHBOARD_COLUMN_KEYS: DashboardColumnKey[] = [
  'tradeDate',
  'expiry',
  'trade',
  'option',
  'strike',
  'entryReason',
  'entryDate',
  'entryTime',
  'entryPrice',
  'exitReason',
  'exitDate',
  'exitTime',
  'exitPrice',
  'quantity',
  'plPoints',
  'plAmount',
  'ddPoints',
  'ddAmount',
];

const DASHBOARD_COLUMN_LABELS: Record<DashboardColumnKey, string> = {
  tradeDate: 'Trade Date',
  expiry: 'Expiry',
  trade: 'Trade',
  option: 'Option',
  strike: 'Strike',
  entryReason: 'Entry Reason',
  entryDate: 'Entry Date',
  entryTime: 'Entry Time',
  entryPrice: 'Entry Price',
  exitReason: 'Exit Reason',
  exitDate: 'Exit Date',
  exitTime: 'Exit Time',
  exitPrice: 'Exit Price',
  quantity: 'Quantity',
  plPoints: 'PL Points',
  plAmount: 'PL Amount',
  ddPoints: 'DD Points',
  ddAmount: 'DD Amount',
};

const DASHBOARD_TILE_KEYS: DashboardPreset[] = ['all', 'today', 'week', 'month', 'profitable', 'losing', 'maxDd', 'custom'];
const TRADE_DTE_OPTIONS = [0, 1, 2, 3, 4, 5];
const TRADE_EMA_PROXIMITY_OPTIONS = [50, 100, 150, 200, 250, 300, 400, 500];
const TRADE_GAP_OPTIONS = [0, 25, 50, 75, 100, 125, 150, 175, 200];
const DEFAULT_TRADE_DASHBOARD_SETTINGS: TradeDashboardSettings = {
  allowedDte: [0, 1],
  emaProximity: [100],
  gapValues: [],
};

function createDefaultVisibleDashboardColumns() {
  return DASHBOARD_COLUMN_KEYS.reduce((accumulator, key) => {
    accumulator[key] = key !== 'trade' && key !== 'ddPoints' && key !== 'ddAmount';
    return accumulator;
  }, {} as Record<DashboardColumnKey, boolean>);
}

function createEmptyColumnFilters(): ColumnFilterMap {
  return DASHBOARD_COLUMN_KEYS.reduce((accumulator, key) => {
    accumulator[key] = [];
    return accumulator;
  }, {} as ColumnFilterMap);
}

function formatCurrency(value: number) {
  return `\u20B9 ${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedCurrency(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}${formatCurrency(value)}`;
}

type PnlDisplayValue = number | string | null | undefined;

type PnlTone = 'positive' | 'negative' | 'neutral';

function parsePnlDisplayValue(value: PnlDisplayValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[^0-9.-]/g, '');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPnlTone(value: PnlDisplayValue): PnlTone {
  const parsedValue = parsePnlDisplayValue(value);
  if (parsedValue === null || parsedValue === 0) return 'neutral';
  return parsedValue > 0 ? 'positive' : 'negative';
}

function getPnlColor(value: PnlDisplayValue) {
  switch (getPnlTone(value)) {
    case 'positive':
      return '#16A34A';
    case 'negative':
      return '#DC2626';
    default:
      return 'inherit';
  }
}

function getPnlCellStyle(value: PnlDisplayValue): CSSProperties {
  const tone = getPnlTone(value);
  return tone === 'neutral'
    ? { color: 'inherit', fontWeight: 400 }
    : {
        color: tone === 'positive' ? '#16A34A' : '#DC2626',
        fontWeight: 700,
      };
}

function getPnlTextStyle(value: PnlDisplayValue, emphasis = false): CSSProperties {
  return {
    display: 'block',
    color: getPnlColor(value),
    fontWeight: getPnlTone(value) === 'neutral' ? 400 : 700,
    fontSize: emphasis ? '16px' : '14px',
    lineHeight: 1.1,
    letterSpacing: '0.01em',
  };
}

const CENTERED_SUMMARY_CARD_STYLE: CSSProperties = {
  textAlign: 'center',
  placeItems: 'center',
};

const CENTERED_SUMMARY_VALUE_WRAP_STYLE: CSSProperties = {
  justifyContent: 'center',
  width: '100%',
};

const CENTERED_SUMMARY_VALUE_STYLE: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
};

function formatDashboardNumber(value: number | null) {
  if (value === null) return '-';
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cloneTradeDashboardSettings(settings: TradeDashboardSettings): TradeDashboardSettings {
  return {
    allowedDte: [...settings.allowedDte],
    emaProximity: [...settings.emaProximity],
    gapValues: [...settings.gapValues],
  };
}

function formatSelectedSettingValues(values: number[]) {
  return values.length > 0 ? values.join(', ') : 'None selected';
}

function sortNumericValues(values: number[]) {
  return [...values].sort((left, right) => left - right);
}

function SettingsOptionGroup({ label, description, values, selectedValues, onToggle }: SettingsOptionGroupProps) {
  return (
    <section className="trade-settings-section">
      <div className="trade-settings-section-copy">
        <h4>{label}</h4>
        <p>{description}</p>
      </div>
      <div className="trade-settings-option-grid" role="group" aria-label={label}>
        {values.map((value) => {
          const isActive = selectedValues.includes(value);
          return (
            <button
              key={value}
              className={`trade-settings-option${isActive ? ' active' : ''}`}
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggle(value)}
            >
              {value}
            </button>
          );
        })}
      </div>
      <div className="trade-settings-selection">
        <span>Current selection</span>
        <strong>{formatSelectedSettingValues(selectedValues)}</strong>
      </div>
    </section>
  );
}

function TradeDashboardSettingsModal({ open, settings, onClose, onSave }: TradeDashboardSettingsModalProps) {
  const [draft, setDraft] = useState<TradeDashboardSettings>(() => cloneTradeDashboardSettings(settings));

  useEffect(() => {
    if (open) {
      setDraft(cloneTradeDashboardSettings(settings));
    }
  }, [open, settings]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  function toggleSettingValue(key: TradeDashboardSettingsKey, value: number) {
    setDraft((current) => {
      const currentValues = current[key];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : sortNumericValues([...currentValues, value]);
      return {
        ...current,
        [key]: nextValues,
      };
    });
  }

  function handleSave() {
    onSave(cloneTradeDashboardSettings(draft));
  }

  if (!open) {
    return null;
  }

  return (
    <div className="trade-settings-backdrop" role="presentation" onClick={onClose}>
      <div
        className="trade-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-dashboard-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="trade-settings-modal-header">
          <div className="trade-settings-modal-title">
            <span>Dashboard</span>
            <h2 id="trade-dashboard-settings-title">Leg Dashboard Settings</h2>
          </div>
          <button className="button secondary trade-settings-close" type="button" onClick={onClose} aria-label="Close settings">
            âœ•
          </button>
        </div>

        <div className="trade-settings-modal-body">
          <SettingsOptionGroup
            label="Allowed DTE Values"
            description="Controls the selected allowed DTE state for future expiry filtering."
            values={TRADE_DTE_OPTIONS}
            selectedValues={draft.allowedDte}
            onToggle={(value) => toggleSettingValue('allowedDte', value)}
          />

          <SettingsOptionGroup
            label="Near EMA 1000 Values"
            description="Controls the near-EMA configuration state for future dashboard behavior."
            values={TRADE_EMA_PROXIMITY_OPTIONS}
            selectedValues={draft.emaProximity}
            onToggle={(value) => toggleSettingValue('emaProximity', value)}
          />

          <SettingsOptionGroup
            label="Gap Values"
            description="Stores the gap configuration state for future dashboard behavior."
            values={TRADE_GAP_OPTIONS}
            selectedValues={draft.gapValues}
            onToggle={(value) => toggleSettingValue('gapValues', value)}
          />
        </div>

        <div className="trade-settings-footer">
          <div className="trade-settings-summary">
            <div>
              <span>Allowed DTE Values</span>
              <strong>{formatSelectedSettingValues(draft.allowedDte)}</strong>
            </div>
            <div>
              <span>Near EMA 1000 Values</span>
              <strong>{formatSelectedSettingValues(draft.emaProximity)}</strong>
            </div>
            <div>
              <span>Gap Values</span>
              <strong>{formatSelectedSettingValues(draft.gapValues)}</strong>
            </div>
          </div>

          <div className="trade-settings-actions">
            <button className="button secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" type="button" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 20h14v-2H5v2Zm7-18v11.17l3.59-3.58L17 11l-5 5-5-5 1.41-1.41L12 13.17V2h0Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.89 1h-3.78a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L1.71 7.48a.5.5 0 0 0 .12.64L3.86 9.7c-.04.31-.06.63-.06.94s.02.63.06.94L1.83 13.16a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.51.4 1.06.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.78a.5.5 0 0 0 .49-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.25A3.25 3.25 0 1 1 12 8.75a3.25 3.25 0 0 1 0 6.5Z" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Zm4.83 2L11 10.31 14.17 7H7.83Z" />
    </svg>
  );
}

function CalendarChevronIcon({ direction }: { direction: 'left' | 'right' | 'down' }) {
  const rotation = direction === 'left' ? 180 : direction === 'down' ? 90 : 0;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

type TimeOption = {
  value: string;
  label: string;
  compact: string;
  hour: string;
};

const TIME_OPTIONS: TimeOption[] = Array.from({ length: ((15 * 60 + 30) - (9 * 60 + 15)) / 3 + 1 }, (_, index) => {
  const totalMinutes = 9 * 60 + 15 + index * 3;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return {
    value,
    label: value,
    compact: value.replace(':', ''),
    hour: String(hour).padStart(2, '0'),
  };
});
const TIME_CANONICAL_VALUES = new Set(TIME_OPTIONS.map((timeOption) => timeOption.value));

function formatPrice(value: number | null) {
  return value === null ? '-' : value.toFixed(2);
}

function formatTimeDisplay(value: string) {
  if (!value) return '-';
  const [hour, minute] = value.split(':');
  if (!hour || !minute) return value;
  return `${String(Number(hour))}.${minute.padStart(2, '0')}`;
}

function normalizeStoredTimeValue(value: string | null | undefined) {
  if (!value) return '';
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return trimmed;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function parseNumberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value: number | null) {
  return value === null ? '-' : `${value.toFixed(2)}%`;
}

function formatHoldingTime(minutes: number | null) {
  if (minutes === null) return '-';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder.toString().padStart(2, '0')}m` : `${remainder}m`;
}

function computeTradeResults(trade: TradeEntryDraft) {
  const entryPrice = parseNumberOrNull(trade.entry_price);
  const exitPrice = parseNumberOrNull(trade.exit_price);
  const quantity = parseNumberOrNull(trade.quantity);
  const entryMinutes = parseTimeToMinutes(trade.entry_time);
  const exitMinutes = parseTimeToMinutes(trade.exit_time);

  const points = entryPrice !== null && exitPrice !== null ? Number((entryPrice - exitPrice).toFixed(2)) : null;
  const pl = points !== null && quantity !== null ? Number((points * quantity).toFixed(2)) : null;
  const roi =
    pl !== null && entryPrice !== null && quantity !== null && entryPrice * quantity !== 0
      ? Number(((pl / (entryPrice * quantity)) * 100).toFixed(2))
      : null;
  const holdingTime =
    entryMinutes !== null && exitMinutes !== null && exitMinutes >= entryMinutes ? exitMinutes - entryMinutes : null;

  return {
    points,
    pl,
    roi,
    holdingTime,
  };
}

function parseTimeToMinutes(value: string) {
  if (!value.trim()) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function normalizeCandleTimeInput(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 3) {
    const canonical = `0${digits.slice(0, 1)}:${digits.slice(1)}`;
    return TIME_CANONICAL_VALUES.has(canonical) ? canonical : null;
  }

  if (digits.length === 4) {
    const canonical = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    return TIME_CANONICAL_VALUES.has(canonical) ? canonical : null;
  }

  return null;
}

function isPotentialCandleTimeInput(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return false;
  return TIME_OPTIONS.some((timeOption) => timeOption.compact.includes(digits));
}

function rankTimeOption(rawValue: string, timeOption: TimeOption) {
  const trimmed = rawValue.trim();
  if (!trimmed) return 0;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  const queryVariants = digits.length === 1 ? [digits, digits.padStart(2, '0')] : [digits];

  if (queryVariants.some((query) => query.length <= 2 && timeOption.hour.startsWith(query))) {
    return 0;
  }

  if (queryVariants.some((query) => timeOption.compact.startsWith(query))) {
    return 1;
  }

  if (queryVariants.some((query) => timeOption.compact.includes(query))) {
    return 2;
  }

  return null;
}

function isTimeOptionAfterMin(timeOption: TimeOption, minimumValue?: string, inclusive = false) {
  if (!minimumValue) return true;
  const normalizedMinimum = normalizeCandleTimeInput(minimumValue);
  if (!normalizedMinimum) return true;
  return inclusive ? timeOption.value >= normalizedMinimum : timeOption.value > normalizedMinimum;
}

function getTimeSuggestions(rawValue: string, minimumValue?: string, inclusive = false) {
  const ranked = TIME_OPTIONS
    .map((timeOption, index) => {
      if (!isTimeOptionAfterMin(timeOption, minimumValue, inclusive)) return null;
      const rank = rankTimeOption(rawValue, timeOption);
      return rank === null ? null : { timeOption, rank, index };
    })
    .filter((entry): entry is { timeOption: TimeOption; rank: number; index: number } => entry !== null)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.timeOption);

  if (ranked.length > 0) {
    return ranked.slice(0, 10);
  }

  return rawValue.trim() ? [] : TIME_OPTIONS.slice(0, 10);
}

function getOptionSeriesLookupKey(tradeDate: string, expiry: string, option: TradeOption, time: string) {
  return [tradeDate.trim(), expiry.trim(), option, time.trim()].join('|');
}

function formatStrikeValueForDisplay(value: string) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
    return String(parsed);
  }
  return value;
}

function normalizeOptionSeriesStrikeValues(rows: unknown[]) {
  const entries = new Map<string, number | null>();

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const strikeValue = toNumberOrNull(String((row as { strike?: unknown }).strike ?? ''));
    if (strikeValue === null) return;
    const closeValue = toNumberOrNull(String((row as { close?: unknown }).close ?? ''));
    const strikeKey = String(strikeValue);
    if (!entries.has(strikeKey)) {
      entries.set(strikeKey, closeValue);
    }
  });

  return Array.from(entries.entries())
    .map(([strike, close]) => ({ strike, close }))
    .sort((left, right) => Number(left.strike) - Number(right.strike));
}

function rankStrikeOption(strikeOption: OptionSeriesStrikeOption) {
  const close = strikeOption.close;
  const closePriority = close !== null && close >= 15 && close <= 30 ? 0 : 1;
  const distanceFromTwenty = close === null ? Number.POSITIVE_INFINITY : Math.abs(close - 20);
  return {
    closePriority,
    distanceFromTwenty,
    strike: Number(strikeOption.strike),
  };
}

function getStrikeSuggestions(rawValue: string, options: OptionSeriesStrikeOption[]) {
  const ranked = options
    .map((option, index) => {
      const rank = rankStrikeOption(option);
      const query = rawValue.trim().replace(/\D/g, '');
      const strikeDigits = option.strike.replace(/\D/g, '');
      const queryMatch = query ? (strikeDigits.startsWith(query) || strikeDigits.includes(query) ? 0 : 1) : 0;
      return { option, rank, index, queryMatch };
    })
    .sort(
      (left, right) =>
        left.queryMatch - right.queryMatch ||
        left.rank.closePriority - right.rank.closePriority ||
        left.rank.distanceFromTwenty - right.rank.distanceFromTwenty ||
        left.rank.strike - right.rank.strike ||
        left.index - right.index,
    )
    .map((entry) => entry.option);
  return ranked;
}

function getTopRankedStrikeOption(options: OptionSeriesStrikeOption[]) {
  return getStrikeSuggestions('', options)[0] ?? null;
}

async function readOptionSeriesStrikes(
  tradeDate: string,
  expiry: string,
  option: TradeOption,
  time: string,
): Promise<OptionSeriesStrikeResponse> {
  if (!tradeDate.trim() || !expiry.trim() || !time.trim()) {
    return {
      status: 'success',
      rows: [],
    };
  }

  const { data, error } = await supabase
    .schema('emaintraday')
    .from('option_series')
    .select('strike,close')
    .eq('trade_date', tradeDate.trim())
    .eq('expiry', expiry.trim())
    .eq('option_type', option)
    .eq('candle_time', time.trim())
    .order('strike', { ascending: true });

  if (error) {
    return {
      status: 'error',
      message: error.message ?? 'Unable to load option series strikes from Supabase.',
    };
  }

  return {
    status: 'success',
    rows: normalizeOptionSeriesStrikeValues(Array.isArray(data) ? data : []),
  };
}

type TimeInputFieldProps = {
  value: string;
  placeholder?: string;
  inputClassName: string;
  disabled?: boolean;
  readOnly?: boolean;
  inputMode?: 'numeric';
  ariaLabel?: string;
  minimumValue?: string;
  minimumInclusive?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

function TimeInputField({
  value,
  placeholder,
  inputClassName,
  disabled = false,
  readOnly = false,
  inputMode = 'numeric',
  ariaLabel,
  minimumValue,
  minimumInclusive = false,
  onChange,
  onBlur,
}: TimeInputFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [overlayStyle, setOverlayStyle] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const suggestions = useMemo(() => getTimeSuggestions(value, minimumValue, minimumInclusive), [minimumInclusive, minimumValue, value]);
  const isNormalized = normalizeCandleTimeInput(value) !== null;
  const normalizedMinimumValue = normalizeCandleTimeInput(minimumValue ?? '');
  const isBelowMinimum = Boolean(
    isNormalized &&
      normalizedMinimumValue &&
      (minimumInclusive ? value < normalizedMinimumValue : value <= normalizedMinimumValue),
  );
  const isInvalid =
    value.trim() !== '' &&
    (!isNormalized || !isPotentialCandleTimeInput(value) || isBelowMinimum);
  const hasSuggestions = !disabled && !readOnly && suggestions.length > 0 && isOpen;
  const activeSuggestion = hasSuggestions ? suggestions[activeIndex] ?? suggestions[0] ?? null : null;
  const listboxId = `${inputId}-listbox`;

  useLayoutEffect(() => {
    if (!isOpen || disabled || readOnly) {
      setOverlayStyle(null);
      return;
    }

    const syncPosition = () => {
      const element = inputRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      setOverlayStyle({
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width,
      });
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);
    window.addEventListener('scroll', syncPosition, true);

    return () => {
      window.removeEventListener('resize', syncPosition);
      window.removeEventListener('scroll', syncPosition, true);
    };
  }, [disabled, isOpen, readOnly, suggestions.length]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex(0);
  }, [isOpen, value]);

  function commitSuggestion(timeOption: TimeOption) {
    onChange(timeOption.value);
    setIsOpen(false);
    setActiveIndex(0);
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      <input
        ref={inputRef}
        id={inputId}
        className={inputClassName}
        type="text"
        inputMode={inputMode}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={hasSuggestions}
        aria-haspopup="listbox"
        aria-controls={hasSuggestions ? listboxId : undefined}
        aria-activedescendant={hasSuggestions && activeSuggestion ? `${listboxId}-${activeIndex}` : undefined}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        value={value}
        onMouseDown={() => {
          if (disabled || readOnly) return;
          setIsOpen(true);
        }}
        onFocus={() => {
          if (disabled || readOnly) return;
          setIsOpen(true);
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          if (normalizeCandleTimeInput(nextValue) !== null) {
            setIsOpen(false);
            setActiveIndex(0);
            return;
          }

          setIsOpen(true);
        }}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(0);
          onBlur();
        }}
        onKeyDown={(event) => {
          if (!hasSuggestions) {
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !disabled && !readOnly) {
              event.preventDefault();
              setIsOpen(true);
            }
            return;
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % suggestions.length);
            return;
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
            return;
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            const selected = suggestions[activeIndex] ?? suggestions[0];
            if (selected) {
              commitSuggestion(selected);
            }
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
            setActiveIndex(0);
          }
        }}
        style={
          isInvalid
            ? {
                borderColor: 'rgba(216, 110, 96, 0.92)',
                backgroundColor: 'rgba(216, 110, 96, 0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(216, 110, 96, 0.08)',
                paddingRight: '2rem',
              }
            : undefined
        }
      />
      {isInvalid ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '0.55rem',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '1rem',
            height: '1rem',
            borderRadius: '999px',
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.7rem',
            lineHeight: 1,
            color: 'rgba(216, 110, 96, 0.95)',
            background: 'rgba(216, 110, 96, 0.12)',
            border: '1px solid rgba(216, 110, 96, 0.28)',
            pointerEvents: 'none',
          }}
        >
          !
        </span>
      ) : null}
      {hasSuggestions ? (
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              pointerEvents: 'none',
            }}
          >
            <div
              id={listboxId}
              role="listbox"
              style={{
                position: 'fixed',
                left: overlayStyle?.left ?? 0,
                top: overlayStyle?.top ?? 0,
                width: overlayStyle?.width ?? 0,
                maxHeight: 'none',
                overflowY: 'visible',
                borderRadius: '1rem',
                border: '1px solid rgba(226, 193, 135, 0.45)',
                background: 'linear-gradient(180deg, rgba(255, 251, 245, 0.98) 0%, rgba(251, 244, 232, 0.98) 100%)',
                boxShadow: '0 20px 40px rgba(88, 67, 34, 0.16)',
                padding: '0.45rem',
                backdropFilter: 'blur(8px)',
                pointerEvents: 'auto',
              }}
            >
              {suggestions.map((timeOption, index) => {
                const isActive = index === activeIndex;

                return (
                  <div
                    key={timeOption.value}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commitSuggestion(timeOption);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.58rem 0.8rem',
                      borderRadius: '0.75rem',
                      color: 'rgba(69, 52, 31, 0.96)',
                      cursor: 'pointer',
                      backgroundColor: isActive ? 'rgba(246, 183, 107, 0.22)' : 'rgba(255, 255, 255, 0.72)',
                      boxShadow: isActive ? 'inset 0 0 0 1px rgba(196, 137, 51, 0.28)' : 'inset 0 0 0 1px rgba(224, 210, 188, 0.42)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <span>{timeOption.label}</span>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      ) : null}
    </div>
  );
}

type StrikeInputFieldProps = {
  value: string;
  options: OptionSeriesStrikeOption[];
  placeholder?: string;
  inputClassName: string;
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  onChange: (value: string) => void;
  onSelectOption: (option: OptionSeriesStrikeOption) => void;
  onBlur: () => void;
};

function StrikeInputField({
  value,
  options,
  placeholder,
  inputClassName,
  disabled = false,
  readOnly = false,
  ariaLabel,
  onChange,
  onSelectOption,
  onBlur,
}: StrikeInputFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [overlayStyle, setOverlayStyle] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const suggestions = useMemo(() => getStrikeSuggestions(value, options), [options, value]);
  const hasSuggestions = !disabled && !readOnly && suggestions.length > 0 && isOpen;
  const activeSuggestion = hasSuggestions ? suggestions[activeIndex] ?? suggestions[0] ?? null : null;
  const listboxId = `${inputId}-listbox`;

  useLayoutEffect(() => {
    if (!isOpen || disabled || readOnly) {
      setOverlayStyle(null);
      return;
    }

    const syncPosition = () => {
      const element = inputRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      setOverlayStyle({
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width,
      });
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);
    window.addEventListener('scroll', syncPosition, true);

    return () => {
      window.removeEventListener('resize', syncPosition);
      window.removeEventListener('scroll', syncPosition, true);
    };
  }, [disabled, isOpen, readOnly, suggestions.length]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex(0);
  }, [isOpen, value]);

  function commitSuggestion(strikeOption: OptionSeriesStrikeOption) {
    onSelectOption(strikeOption);
    setIsOpen(false);
    setActiveIndex(0);
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      <input
        ref={inputRef}
        id={inputId}
        className={inputClassName}
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={hasSuggestions}
        aria-haspopup="listbox"
        aria-controls={hasSuggestions ? listboxId : undefined}
        aria-activedescendant={hasSuggestions && activeSuggestion ? `${listboxId}-${activeIndex}` : undefined}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        value={value}
        onFocus={() => {
          if (disabled || readOnly) return;
          setIsOpen(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(0);
          onBlur();
        }}
        onKeyDown={(event) => {
          if (!hasSuggestions) {
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !disabled && !readOnly) {
              event.preventDefault();
              setIsOpen(true);
            }
            return;
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % suggestions.length);
            return;
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
            return;
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            const selected = suggestions[activeIndex] ?? suggestions[0];
            if (selected) {
              commitSuggestion(selected);
            }
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
            setActiveIndex(0);
          }
        }}
      />
      {hasSuggestions ? (
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              pointerEvents: 'none',
            }}
          >
            <div
              id={listboxId}
              role="listbox"
              style={{
                position: 'fixed',
                left: overlayStyle?.left ?? 0,
                top: overlayStyle?.top ?? 0,
                width: overlayStyle?.width ?? 0,
                maxHeight: '14rem',
                overflowY: 'auto',
                borderRadius: '1rem',
                border: '1px solid rgba(226, 193, 135, 0.45)',
                background: 'linear-gradient(180deg, rgba(255, 251, 245, 0.98) 0%, rgba(251, 244, 232, 0.98) 100%)',
                boxShadow: '0 20px 40px rgba(88, 67, 34, 0.16)',
                padding: '0.45rem',
                backdropFilter: 'blur(8px)',
                pointerEvents: 'auto',
              }}
            >
              {suggestions.map((strikeOption, index) => {
                const isActive = index === activeIndex;
                return (
                  <div
                    key={`${strikeOption.strike}-${index}`}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commitSuggestion(strikeOption);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.58rem 0.8rem',
                      borderRadius: '0.75rem',
                      color: 'rgba(69, 52, 31, 0.96)',
                      cursor: 'pointer',
                      backgroundColor: isActive ? 'rgba(246, 183, 107, 0.22)' : 'rgba(255, 255, 255, 0.72)',
                      boxShadow: isActive ? 'inset 0 0 0 1px rgba(196, 137, 51, 0.28)' : 'inset 0 0 0 1px rgba(224, 210, 188, 0.42)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <span>{`${formatStrikeValueForDisplay(strikeOption.strike)} | ${formatPrice(strikeOption.close)}`}</span>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      ) : null}
    </div>
  );
}

function createTimeDraftKey(cardId: string, rowIndex: number, field: 'entryTime' | 'exitTime') {
  return `${cardId}:${rowIndex}:${field}`;
}

function hasCompleteEntryDraft(trade: TradeEntryDraft) {
  return Boolean(
    trade.option &&
      trade.trade_strike.trim() &&
      trade.quantity.trim() &&
      trade.entry_reason.trim() &&
      trade.entry_time.trim() &&
      trade.entry_price.trim(),
  );
}

function hasCompleteExitDraft(trade: TradeEntryDraft) {
  return Boolean(
    trade.option &&
      trade.trade_strike.trim() &&
      trade.quantity.trim() &&
      trade.entry_reason.trim() &&
      trade.exit_reason.trim() &&
      trade.entry_time.trim() &&
      trade.entry_price.trim() &&
      trade.exit_time.trim() &&
      trade.exit_price.trim(),
  );
}

function isLegComplete(leg: TradeLegDraft) {
  return leg.trades.length > 0 && leg.trades.every(hasCompleteExitDraft);
}

function hasAnyTradeContent(trade: TradeEntryDraft) {
  return Boolean(
    trade.trade_strike.trim() ||
      trade.entry_reason.trim() ||
      trade.exit_reason.trim() ||
      trade.entry_time.trim() ||
      trade.entry_price.trim() ||
      trade.exit_time.trim() ||
      trade.exit_price.trim(),
  );
}

function createTradeDraft(option: TradeOption = 'CE') {
  return emptyTradeEntry(option);
}

function isEodExitReason(reason: string) {
  return reason.trim() === 'EOD';
}

function formatCalendarDay(date: Date) {
  return String(date.getDate());
}

function parseCalendarDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toCalendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatSelectedDateDisplay(dateKey: string) {
  if (!dateKey) return 'Select a trade day';
  const parsed = parseCalendarDate(dateKey);
  if (!parsed) return dateKey;
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
  }).format(parsed);
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
    .format(parsed)
    .replace(/\s+/g, '-');
  return `${weekday}\n${formattedDate}`;
}

function formatModalDateDisplay(dateKey: string) {
  if (!dateKey) return '';
  const parsed = parseCalendarDate(dateKey);
  if (!parsed) return dateKey;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
    .format(parsed)
    .replace(/\s+/g, '-');
}

function getTodayDateKey() {
  return toCalendarDateKey(new Date());
}

function ExpiryHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2h2v2h6V2h2v2h2.5A2.5 2.5 0 0 1 22 6.5v13A2.5 2.5 0 0 1 19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-13A2.5 2.5 0 0 1 4.5 4H7V2Zm12 7H5v10.5h14V9ZM7 12h3v3H7v-3Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z" />
    </svg>
  );
}

function getTradeOptionStyle(option: TradeOption) {
  if (option === 'CE') {
    return { color: '#DC2626', fontWeight: 700 } as const;
  }

  return { color: '#16A34A', fontWeight: 700 } as const;
}

function TradeOptionValue({ option }: { option: TradeOption }) {
  return <span style={getTradeOptionStyle(option)}>{option}</span>;
}

type TradeDateCalendarDay = {
  dateKey: string;
  dayLabel: string;
  inMonth: boolean;
  isEligible: boolean;
  option: TradeCalendarDateOption | null;
};

type TradeDateCalendarMonth = {
  monthKey: string;
  label: string;
  days: TradeDateCalendarDay[];
};

const CALENDAR_WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CALENDAR_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatIndianNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString('en-IN');
}

function parseIndianNumberInput(value: string) {
  return value.replace(/,/g, '');
}

function buildTradeDateCalendar(tradeDates: TradeCalendarDateOption[]) {
  const dateMap = new Map(
    tradeDates
      .map((option) => {
        const parsed = parseCalendarDate(option.date);
        return parsed ? [toCalendarDateKey(parsed), option] : null;
      })
      .filter((entry): entry is [string, TradeCalendarDateOption] => entry !== null),
  );

  const parsedDates = tradeDates
    .map((option) => parseCalendarDate(option.date))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  if (parsedDates.length === 0) return [];

  const firstMonth = getMonthStart(parsedDates[0]);
  const lastMonth = getMonthStart(parsedDates[parsedDates.length - 1]);
  const months: TradeDateCalendarMonth[] = [];

  for (
    let cursor = new Date(firstMonth);
    cursor.getTime() <= lastMonth.getTime();
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const monthStart = getMonthStart(cursor);
    const startOffset = (monthStart.getDay() + 6) % 7;
    const calendarStart = addCalendarDays(monthStart, -startOffset);

    const days = Array.from({ length: 42 }, (_, index) => {
      const current = addCalendarDays(calendarStart, index);
      const dateKey = toCalendarDateKey(current);
      const option = dateMap.get(dateKey) ?? null;

      return {
        dateKey,
        dayLabel: formatCalendarDay(current),
        inMonth: current.getMonth() === cursor.getMonth(),
        isEligible: option !== null,
        option,
      };
    });

    months.push({
      monthKey: toCalendarDateKey(monthStart).slice(0, 7),
      label: formatMonthLabel(monthStart),
      days,
    });
  }

  return months;
}



function formatTradeCalendarOption(option: TradeCalendarDateOption) {
  return formatSelectedDateDisplay(option.date);
}

function findMatchingTransitionRule(trade: TradeEntryDraft, rules: TradeTransitionRule[]) {
  return rules.find(
    (rule) => rule.is_active && rule.trigger_option === trade.option && rule.exit_reason === trade.exit_reason.trim(),
  ) ?? null;
}

type ReasonOptionLike = {
  id: string;
  name: string;
};

function withSelectedReasonOption<T extends ReasonOptionLike>(rows: T[], selectedValue: string | null | undefined) {
  if (!selectedValue) return rows;
  if (rows.some((row) => row.name === selectedValue)) return rows;
  return [{ id: `selected-${selectedValue}`, name: selectedValue } as T, ...rows];
}

function getEntryReasonOptions(rows: EntryReason[], selectedValue: string) {
  return withSelectedReasonOption(rows, selectedValue);
}

function getExitReasonOptions(rows: ExitReason[], selectedValue: string) {
  return withSelectedReasonOption(rows, selectedValue);
}

function getTransitionExitTime(leg: TradeLegDraft, tradeIndex: number, exitReason: string) {
  const selectedTrade = leg.trades[tradeIndex];
  const selectedExitTime = selectedTrade?.exit_time.trim() ?? '';
  if (selectedExitTime) return selectedExitTime;

  return leg.trades.find((trade) => trade.exit_time.trim())?.exit_time.trim() ?? '';
}

function createTransitionTrade(option: TradeOption, entryReason: string | null, entryTime = '') {
  return {
    ...emptyTradeEntry(option),
    entry_reason: entryReason ?? '',
    entry_time: entryTime,
  };
}

function getTransitionEntryReason(rule: TradeTransitionRule) {
  return rule.entry_reason?.trim() || rule.exit_reason.trim();
}

function getAutoEntryReasonForLeg(legNo: number, entryTime: string) {
  const entryMinutes = parseTimeToMinutes(entryTime);
  if (legNo <= 1) {
    return entryMinutes !== null && entryMinutes <= NORMAL_ENTRY_CUTOFF_MINUTES ? 'Normal Entry' : 'EMA 9 Entry';
  }

  return 'EMA 9 Entry';
}

function shiftLegMetadata(leg: TradeLegDraft, shiftFromLegNo: number, delta: number): TradeLegDraft {
  return {
    ...leg,
    leg_no: leg.leg_no >= shiftFromLegNo ? leg.leg_no + delta : leg.leg_no,
    created_from_leg_no:
      leg.created_from_leg_no !== null && leg.created_from_leg_no >= shiftFromLegNo
        ? leg.created_from_leg_no + delta
        : leg.created_from_leg_no,
  };
}

function applyTransitionRuleToDraft(
  draft: TradeRecordDraft,
  legIndex: number,
  tradeIndex: number,
  rule: TradeTransitionRule,
) {
  const currentLeg = draft.legs[legIndex];
  if (!currentLeg) return draft;

  const transitionTime = getTransitionExitTime(currentLeg, tradeIndex, rule.exit_reason);
  const exitReasonFor = (option: TradeOption) =>
    option === rule.trigger_option ? rule.exit_reason : rule.other_leg_exit_reason ?? rule.exit_reason;

  const exitTargets = new Set<TradeOption>();
  if (rule.exit_ce_position) exitTargets.add('CE');
  if (rule.exit_pe_position) exitTargets.add('PE');

  const updatedLegs = draft.legs.map((leg, index) => {
    if (index !== legIndex) return leg;

    return {
      ...leg,
      trades: leg.trades.map((trade, index) => {
        if (!exitTargets.has(trade.option)) return trade;
        if (index !== tradeIndex && trade.exit_reason.trim()) return trade;

        const nextExitReason = exitReasonFor(trade.option);
        const nextExitTime = transitionTime || trade.exit_time;

        return {
          ...trade,
          exit_reason: nextExitReason,
          exit_time: nextExitTime,
        };
      }),
    };
  });

  const nextLegNo = currentLeg.leg_no + 1;
  const existingNextLegIndex = updatedLegs.findIndex((leg) => leg.leg_no === nextLegNo);

  if (!rule.create_new_leg || !rule.new_leg_option) {
    return {
      ...draft,
      legs: updatedLegs,
    };
  }

  if (existingNextLegIndex >= 0) {
    const entryReason = getTransitionEntryReason(rule);
    return {
      ...draft,
      legs: updatedLegs.map((leg, index) =>
        index !== existingNextLegIndex
          ? leg
          : {
              ...leg,
              created_from_leg_no: currentLeg.leg_no,
              trigger_exit_reason: rule.exit_reason,
              trades: leg.trades.map((trade, tradeIndex) =>
                tradeIndex === 0
                  ? {
                      ...trade,
                      entry_reason: entryReason,
                      entry_time: trade.entry_time || transitionTime,
                    }
                  : trade,
              ),
            },
      ),
    };
  }

  const nextLegs = updatedLegs.map((leg) =>
    shiftLegMetadata(leg, nextLegNo, 1),
  );

  const nextLeg: TradeLegDraft = {
    leg_no: nextLegNo,
    created_from_leg_no: currentLeg.leg_no,
    trigger_exit_reason: rule.exit_reason,
    trades: [createTransitionTrade(rule.new_leg_option, getTransitionEntryReason(rule), transitionTime)],
  };

  return {
    ...draft,
    legs: [...nextLegs.slice(0, legIndex + 1), nextLeg, ...nextLegs.slice(legIndex + 1)],
  };
}

function createLegDraft(legNo: number): TradeLegDraft {
  return emptyTradeLeg(legNo);
}

function toDraftFromRecord(record: TradeRecord): TradeRecordDraft {
  return {
    trade_date: record.trade_date,
    track_strike: record.track_strike?.toString() ?? '',
    expiry: record.expiry ?? '',
    gap_status: record.gap_status ?? '',
    ema_status: record.ema_status ?? '',
    legs:
      record.legs.length > 0
        ? record.legs.map((leg) => ({
            leg_no: leg.leg_no,
            created_from_leg_no: leg.created_from_leg_no ?? null,
            trigger_exit_reason: leg.trigger_exit_reason ?? '',
            trades: leg.trades.map((trade) => ({
              id: trade.id,
              option: trade.option,
              trade_strike: trade.trade_strike?.toString() ?? '',
              quantity: trade.quantity?.toString() ?? DEFAULT_TRADE_QUANTITY,
              entry_reason: trade.entry_reason,
              exit_reason: trade.exit_reason,
              entry_time: normalizeStoredTimeValue(trade.entry_time),
              entry_price: trade.entry_price?.toString() ?? '',
              exit_time: normalizeStoredTimeValue(trade.exit_time),
              exit_price: trade.exit_price?.toString() ?? '',
            })),
          }))
        : [createLegDraft(1)],
  };
}

function flattenTradeRows(records: TradeRecord[]): TradeRow[] {
  return records.flatMap((record) =>
    record.legs.flatMap((leg) =>
      leg.trades.map((trade, tradeIndex) => ({
        recordId: record.id,
        tradeId: trade.id,
        expiry: record.expiry ?? '-',
        trackStrike: record.track_strike,
        legNo: leg.leg_no,
        tradeIndex,
        option: trade.option,
        tradeStrike: trade.trade_strike,
        entryReason: trade.entry_reason,
        exitReason: trade.exit_reason,
        tradeDate: record.trade_date,
        entryTime: trade.entry_time,
        entryPrice: trade.entry_price,
        exitTime: trade.exit_time,
        exitPrice: trade.exit_price,
        pl: trade.pl,
        record,
        leg,
        trade,
      })),
    ),
  );
}

function sortTradeRowsForDashboard(rows: TradeRow[]) {
  return [...rows].sort((left, right) => {
    const leftDate = new Date(`${left.tradeDate}T00:00:00`).getTime();
    const rightDate = new Date(`${right.tradeDate}T00:00:00`).getTime();
    if (leftDate !== rightDate) return rightDate - leftDate;

    const leftCreatedAt = new Date(left.record.created_at).getTime();
    const rightCreatedAt = new Date(right.record.created_at).getTime();
    if (leftCreatedAt !== rightCreatedAt) return rightCreatedAt - leftCreatedAt;

    if (left.legNo !== right.legNo) return left.legNo - right.legNo;

    if (left.tradeIndex !== right.tradeIndex) return left.tradeIndex - right.tradeIndex;

    return left.tradeId.localeCompare(right.tradeId);
  });
}

function buildDashboardRows(rows: TradeRow[]): DashboardRow[] {
  return sortTradeRowsForDashboard(rows).map((row) => {
    return {
      ...row,
      qtyDisplay: Math.max(1, row.trade.quantity ?? 1),
      plPoints: row.trade.pl_points ?? 0,
      ddPoints: 0,
      plAmount: row.trade.pl_amount ?? 0,
      ddAmount: 0,
    };
  });
}

function getDashboardValue(row: DashboardRow, key: DashboardColumnKey) {
  switch (key) {
    case 'tradeDate':
      return formatDateTile(row.tradeDate);
    case 'expiry':
      return formatDateTile(row.expiry || '');
    case 'trade':
      return 'SELL';
    case 'option':
      return row.option;
    case 'strike':
      return row.tradeStrike === null ? '-' : String(row.tradeStrike);
    case 'entryReason':
      return row.entryReason || '-';
    case 'entryDate':
      return formatDateTile(row.tradeDate);
    case 'entryTime':
      return formatTimeDisplay(row.entryTime);
    case 'entryPrice':
      return formatPrice(row.entryPrice);
    case 'exitReason':
      return row.exitReason || '-';
    case 'exitDate':
      return formatDateTile(row.tradeDate);
    case 'exitTime':
      return formatTimeDisplay(row.exitTime);
    case 'exitPrice':
      return formatPrice(row.exitPrice);
    case 'quantity':
      return String(row.qtyDisplay);
    case 'plPoints':
      return formatDashboardNumber(row.plPoints);
    case 'plAmount':
      return formatDashboardNumber(row.plAmount);
    case 'ddPoints':
      return formatDashboardNumber(row.ddPoints);
    case 'ddAmount':
      return formatDashboardNumber(row.ddAmount);
    default:
      return '-';
  }
}

function parseDateKey(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinCurrentWeek(date: Date, now: Date) {
  const start = new Date(now);
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(now.getDate() + diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return date >= start && date < end;
}

function isWithinCurrentMonth(date: Date, now: Date) {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function updateLegTrades(draft: TradeRecordDraft, legIndex: number, updater: (current: TradeLegDraft) => TradeLegDraft) {
  return {
    ...draft,
    legs: draft.legs.map((leg, index) => (index === legIndex ? updater(leg) : leg)),
  };
}

function updateTradeInLeg(
  draft: TradeRecordDraft,
  legIndex: number,
  tradeIndex: number,
  updater: (current: TradeEntryDraft) => TradeEntryDraft,
) {
  return updateLegTrades(draft, legIndex, (leg) => ({
    ...leg,
    trades: leg.trades.map((trade, index) => (index === tradeIndex ? updater(trade) : trade)),
  }));
}

function addTradeToLeg(draft: TradeRecordDraft, legIndex: number) {
  return updateLegTrades(draft, legIndex, (leg) => {
    if (leg.trades.length >= 2) return leg;

    const nextOption = leg.trades.length === 1 ? oppositeOption(leg.trades[0].option) : 'CE';
    return {
      ...leg,
      trades: [...leg.trades, createTradeDraft(nextOption)],
    };
  });
}

function removeTradeFromLeg(draft: TradeRecordDraft, legIndex: number, tradeIndex: number) {
  const nextLegs = draft.legs
    .map((leg, index) =>
      index === legIndex
        ? {
            ...leg,
            trades: leg.trades.filter((_, currentIndex) => currentIndex !== tradeIndex),
          }
        : leg,
    )
    .filter((leg) => leg.trades.length > 0);

  return {
    ...draft,
    legs:
      nextLegs.length > 0
        ? nextLegs.map((leg, index) => ({
            ...leg,
            leg_no: index + 1,
          }))
        : [createLegDraft(1)],
  };
}

function addLeg(draft: TradeRecordDraft) {
  const nextLegNo = draft.legs.length + 1;
  return {
    ...draft,
    legs: [...draft.legs, createLegDraft(nextLegNo)],
  };
}

function removeLeg(draft: TradeRecordDraft, legIndex: number) {
  const nextLegs = draft.legs.filter((_, index) => index !== legIndex);
  return {
    ...draft,
    legs:
      nextLegs.length > 0
        ? nextLegs.map((leg) => shiftLegMetadata(leg, legIndex + 2, -1))
        : [createLegDraft(1)],
  };
}

function TradeModal({
  draft,
  editingId,
  isEditingExistingTrade,
  selectedTradeId,
  entryReasons,
  exitReasons,
  tradeDates,
  loadingCalendar,
  transitionRules,
  flowStage,
  open,
  saving,
  onClose,
  onUpdateDraft,
  onSave,
  onSaveAndExit,
  onOpenSettings,
}: {
  draft: TradeRecordDraft;
  editingId: string | null;
  isEditingExistingTrade: boolean;
  selectedTradeId: string | null;
  entryReasons: EntryReason[];
  exitReasons: ExitReason[];
  tradeDates: TradeCalendarDateOption[];
  loadingCalendar: boolean;
  transitionRules: TradeTransitionRule[];
  flowStage: 'expiry' | 'entry' | 'exit';
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onUpdateDraft: (updater: (current: TradeRecordDraft) => TradeRecordDraft) => void;
  onSave: () => void;
  onSaveAndExit: () => void;
  onOpenSettings: () => void;
}) {
  const [activeLegIndex, setActiveLegIndex] = useState(0);
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({});
  const tradeCalendarMonths = useMemo(() => {
    const startedAt = performance.now();
    const months = buildTradeDateCalendar(tradeDates);
    const durationMs = performance.now() - startedAt;
    if (open && tradeDates.length > 0) {
      const timeline = getTradePerfTimeline();
      timeline.__emaTradePerf = {
        ...(timeline.__emaTradePerf ?? {}),
        calendarBuildMs: durationMs,
      };
    }
    return months;
  }, [open, tradeDates]);
  const [visibleTradeMonthIndex, setVisibleTradeMonthIndex] = useState(0);
  const [calendarView, setCalendarView] = useState<'dates' | 'months' | 'years'>('dates');
  const latestTradeDateOption = useMemo(() => {
    if (tradeDates.length === 0) return null;
    return tradeDates.reduce((latest, current) => (current.date > latest.date ? current : latest));
  }, [tradeDates]);
  const latestTradeMonthIndex = useMemo(() => {
    if (!latestTradeDateOption) return 0;
    const monthKey = latestTradeDateOption.date.slice(0, 7);
    const foundIndex = tradeCalendarMonths.findIndex((month) => month.monthKey === monthKey);
    return foundIndex >= 0 ? foundIndex : Math.max(tradeCalendarMonths.length - 1, 0);
  }, [latestTradeDateOption, tradeCalendarMonths]);

  function handleTimeDraftChange(
    tradeIndex: number,
    field: 'entry_time' | 'exit_time',
    value: string,
  ) {
    const key = createTimeDraftKey(activeLeg?.trades[tradeIndex]?.id ?? `trade-${tradeIndex}`, tradeIndex, field === 'entry_time' ? 'entryTime' : 'exitTime');
    const normalized = normalizeCandleTimeInput(value);
    if (normalized !== null) {
      setTimeDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      onUpdateDraft((current) => {
        const updatedDraft = updateTradeInLeg(current, activeLegIndex, tradeIndex, (trade) => ({
          ...trade,
          [field]: normalized,
        }));
        if (isEditingExistingTrade) return updatedDraft;
        return field === 'entry_time'
          ? applyAutoEntryReasonToDraft(updatedDraft, activeLegIndex, tradeIndex, normalized)
          : updatedDraft;
      });
      return;
    }

    setTimeDrafts((current) => ({ ...current, [key]: value }));
  }

  function handleTimeDraftBlur(tradeIndex: number, field: 'entry_time' | 'exit_time') {
    const key = createTimeDraftKey(activeLeg?.trades[tradeIndex]?.id ?? `trade-${tradeIndex}`, tradeIndex, field === 'entry_time' ? 'entryTime' : 'exitTime');
    const draftValue = timeDrafts[key];
    if (draftValue === undefined) return;

    const normalized = normalizeCandleTimeInput(draftValue);
    if (normalized !== null) {
      onUpdateDraft((current) => {
        const updatedDraft = updateTradeInLeg(current, activeLegIndex, tradeIndex, (trade) => ({
          ...trade,
          [field]: normalized,
        }));
        if (isEditingExistingTrade) return updatedDraft;
        return field === 'entry_time'
          ? applyAutoEntryReasonToDraft(updatedDraft, activeLegIndex, tradeIndex, normalized)
          : updatedDraft;
      });
      setTimeDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
  }

  useEffect(() => {
    if (!open) return;
    const selectedLegIndex = selectedTradeId
      ? draft.legs.findIndex((leg) => leg.trades.some((trade) => trade.id === selectedTradeId))
      : -1;

    if (selectedLegIndex >= 0) {
      setActiveLegIndex(selectedLegIndex);
      return;
    }

    setActiveLegIndex((current) => Math.min(current, Math.max(draft.legs.length - 1, 0)));
  }, [draft.legs, open, selectedTradeId]);

  useEffect(() => {
    if (!open) {
      setActiveLegIndex(0);
      setVisibleTradeMonthIndex(0);
      setCalendarView('dates');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (tradeCalendarMonths.length === 0) {
      setVisibleTradeMonthIndex(0);
      return;
    }

    const selectedTradeDate = draft.trade_date ? parseCalendarDate(draft.trade_date) : null;
    const selectedMonthKey = selectedTradeDate ? toCalendarDateKey(getMonthStart(selectedTradeDate)).slice(0, 7) : tradeCalendarMonths[tradeCalendarMonths.length - 1]?.monthKey ?? '';
    const selectedMonthIndex = tradeCalendarMonths.findIndex((month) => month.monthKey === selectedMonthKey);

    setVisibleTradeMonthIndex(selectedMonthIndex >= 0 ? selectedMonthIndex : 0);
  }, [draft.trade_date, open, tradeCalendarMonths]);

  useEffect(() => {
    if (isEditingExistingTrade || !open || tradeDates.length === 0 || draft.trade_date || !latestTradeDateOption) return;

    onUpdateDraft((current) => {
      if (current.trade_date) return current;
      return {
        ...current,
        trade_date: latestTradeDateOption.date,
        expiry: latestTradeDateOption.expiry,
        track_strike: latestTradeDateOption.strike === null ? '' : String(latestTradeDateOption.strike),
        gap_status: latestTradeDateOption.gapStatus ?? '',
        ema_status: latestTradeDateOption.emaStatus ?? '',
      };
    });

    setVisibleTradeMonthIndex(latestTradeMonthIndex);
    setCalendarView('dates');
  }, [draft.trade_date, isEditingExistingTrade, latestTradeDateOption, latestTradeMonthIndex, onUpdateDraft, open, tradeDates.length]);

  useEffect(() => {
    if (!open) return;

    const frameId = window.requestAnimationFrame(() => {
      const timeline = getTradePerfTimeline();
      const modalOpenStart = timeline.__emaTradePerf?.t1ModalOpenStart;
      if (typeof modalOpenStart === 'number' && timeline.__emaTradePerf?.modalVisibleAt === undefined) {
        const modalVisibleAt = performance.now();
        timeline.__emaTradePerf = {
          ...(timeline.__emaTradePerf ?? {}),
          modalVisibleAt,
          modalVisibleMs: modalVisibleAt - modalOpenStart,
        };
        console.info(`[EMA Trade Perf] T1->modalVisible=${(modalVisibleAt - modalOpenStart).toFixed(1)}ms`);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  const activeLeg = draft.legs[activeLegIndex] ?? draft.legs[0];
  const activeTradeCount = activeLeg?.trades.length ?? 0;
  const activeLegEntryMinimumTime = getPreviousLegExitTime(draft.legs, activeLegIndex, (leg) => leg.trades.map((trade) => trade.exit_time));
  const isEntryStage = flowStage === 'entry';
  const isExitStage = flowStage === 'exit';
  const isSetupReady = Boolean(
    draft.expiry &&
      draft.trade_date &&
      draft.track_strike.trim() &&
      draft.gap_status.trim() &&
      draft.ema_status.trim(),
  );
  const visibleTradeMonth = tradeCalendarMonths[visibleTradeMonthIndex] ?? tradeCalendarMonths[0] ?? null;
  const canGoToPreviousTradeMonth = visibleTradeMonthIndex > 0;
  const canGoToNextTradeMonth = visibleTradeMonthIndex < tradeCalendarMonths.length - 1;
  const visibleTradeYear = visibleTradeMonth ? Number(visibleTradeMonth.monthKey.slice(0, 4)) : new Date().getFullYear();
  const availableMonthKeys = new Set(tradeCalendarMonths.map((month) => month.monthKey));
  const availableTradeYears = Array.from(new Set(tradeCalendarMonths.map((month) => Number(month.monthKey.slice(0, 4))))).sort((left, right) => left - right);
  const todayDateKey = getTodayDateKey();
  const selectedTradeDateOption =
    tradeDates.find((option) => option.date === draft.trade_date) ?? {
      date: '',
      expiry: '',
      dte: null,
      strike: null,
      gapValue: null,
      gapStatus: '',
      emaStatus: '',
    };

  useEffect(() => {
    if (isEditingExistingTrade || !selectedTradeDateOption || selectedTradeDateOption.strike === null || !draft.trade_date) return;
    if (draft.track_strike.trim()) return;

    onUpdateDraft((current) => {
      if (current.trade_date !== draft.trade_date || current.track_strike.trim()) return current;
      return {
        ...current,
        track_strike: String(selectedTradeDateOption.strike),
      };
    });
  }, [draft.trade_date, draft.track_strike, isEditingExistingTrade, onUpdateDraft, selectedTradeDateOption]);

  useLayoutEffect(() => {
    if (!open || loadingCalendar || tradeDates.length === 0) return;
    const timeline = getTradePerfTimeline();
    const trace = timeline.__emaTradePerf;
    if (!trace || trace.t5CalendarStatePopulated !== undefined) return;

    const t5 = performance.now();
    timeline.__emaTradePerf = {
      ...trace,
      t5CalendarStatePopulated: t5,
      reactStateMs: typeof trace.t4TransformComplete === 'number' ? t5 - trace.t4TransformComplete : undefined,
    };

    const frameId = window.requestAnimationFrame(() => {
      const currentTimeline = getTradePerfTimeline();
      const currentTrace = currentTimeline.__emaTradePerf;
      const t1 = currentTrace?.t1ModalOpenStart;
      const t2 = currentTrace?.t2QueryStart;
      const t3 = currentTrace?.t3ResponseReceived;
      const t4 = currentTrace?.t4TransformComplete;
      const currentT5 = currentTrace?.t5CalendarStatePopulated;
      if (
        typeof t1 !== 'number' ||
        typeof t2 !== 'number' ||
        typeof t3 !== 'number' ||
        typeof t4 !== 'number' ||
        typeof currentT5 !== 'number'
      ) {
        return;
      }
      if (!currentTrace) return;

      if (currentTrace.t6FirstCalendarRenderComplete === undefined) {
        const t6 = performance.now();
        const nextTrace = {
          ...currentTrace,
          t6FirstCalendarRenderComplete: t6,
          backendMs: t3 - t2,
          transformMs: t4 - t3,
          reactStateMs: currentT5 - t4,
          renderMs: t6 - currentT5,
          totalMs: t6 - t1,
        };
        currentTimeline.__emaTradePerf = nextTrace;
        console.info(
          `[EMA Trade Perf] T1-T6 total=${nextTrace.totalMs.toFixed(1)}ms backend=${nextTrace.backendMs.toFixed(1)}ms transform=${nextTrace.transformMs.toFixed(1)}ms reactState=${nextTrace.reactStateMs.toFixed(1)}ms render=${nextTrace.renderMs.toFixed(1)}ms rows=${nextTrace.rowsReturned ?? 0} uniqueDates=${nextTrace.uniqueDatesReturned ?? 0} duplicateRows=${nextTrace.duplicateRowsSkipped ?? 0} pages=${nextTrace.pageCount ?? 0} calendarBuild=${(nextTrace.calendarBuildMs ?? 0).toFixed(1)}ms`,
        );
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [loadingCalendar, open, tradeDates.length]);

  function updateTradeWithOptionalRule(
    legIndex: number,
    tradeIndex: number,
    updater: (currentTrade: TradeEntryDraft) => TradeEntryDraft,
  ) {
    onUpdateDraft((current) => updateTradeInLeg(current, legIndex, tradeIndex, updater));
  }

  function updateExitReasonWithTransition(legIndex: number, tradeIndex: number, nextExitReason: string) {
    onUpdateDraft((current) => {
      if (isEditingExistingTrade) {
        return updateTradeInLeg(current, legIndex, tradeIndex, (trade) => ({
          ...trade,
          exit_reason: nextExitReason,
        }));
      }

      const updatedDraft = updateTradeInLeg(current, legIndex, tradeIndex, (trade) => ({
        ...trade,
        exit_reason: nextExitReason,
        exit_time: trade.exit_time,
      }));

      const matchingRule = findMatchingTransitionRule(
        updatedDraft.legs[legIndex]?.trades[tradeIndex] ?? emptyTradeEntryDraft('CE'),
        transitionRules,
      );

      return matchingRule ? applyTransitionRuleToDraft(updatedDraft, legIndex, tradeIndex, matchingRule) : updatedDraft;
    });
  }

  function moveCalendarYear(direction: -1 | 1) {
    const targetYear = visibleTradeYear + direction;
    const targetMonth = visibleTradeMonth ? Number(visibleTradeMonth.monthKey.slice(5, 7)) - 1 : 0;
    const exactMonthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
    const exactIndex = tradeCalendarMonths.findIndex((month) => month.monthKey === exactMonthKey);
    if (exactIndex >= 0) {
      setVisibleTradeMonthIndex(exactIndex);
      return;
    }

    const fallbackIndex = tradeCalendarMonths.findIndex((month) => month.monthKey.startsWith(`${targetYear}-`));
    if (fallbackIndex >= 0) {
      setVisibleTradeMonthIndex(fallbackIndex);
    }
  }

  function selectCalendarMonth(monthIndex: number) {
    const monthKey = `${visibleTradeYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    const nextIndex = tradeCalendarMonths.findIndex((month) => month.monthKey === monthKey);
    if (nextIndex < 0) return;
    setVisibleTradeMonthIndex(nextIndex);
    setCalendarView('dates');
  }

  function selectCalendarYear(year: number) {
    const nextIndex = tradeCalendarMonths.findIndex((month) => month.monthKey.startsWith(`${year}-`));
    if (nextIndex < 0) return;
    setVisibleTradeMonthIndex(nextIndex);
    setCalendarView('months');
  }

  function getEntryReasonOptions(selectedValue: string) {
    return withSelectedReasonOption(entryReasons, selectedValue);
  }

  function getExitReasonOptions(selectedValue: string) {
    return withSelectedReasonOption(exitReasons, selectedValue);
  }

  if (!open) return null;

  return (
    <div className="trade-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="trade-modal" role="dialog" aria-modal="true" aria-label="Add leg" onClick={(event) => event.stopPropagation()}>
        <div className="trade-modal-topbar">
          <button className="button secondary trade-modal-close" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="trade-modal-body">
          <TradeEntryPage
            embedded
            isEditingExistingTrade={isEditingExistingTrade}
            onClose={onClose}
            onSaveAndExit={onSaveAndExit}
            saving={saving}
            entryReasons={entryReasons}
            exitReasons={exitReasons}
            transitionRules={transitionRules}
            tradeDates={tradeDates}
            loadingCalendar={loadingCalendar}
            draft={draft}
            onUpdateDraft={onUpdateDraft}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="trade-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="trade-modal" role="dialog" aria-modal="true" aria-label="Add leg" onClick={(event) => event.stopPropagation()}>
        <div className="trade-modal-topbar">
          <button className="button secondary trade-modal-close" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="trade-modal-body">
          {flowStage === 'expiry' ? (
            <section className="trade-form-section trade-setup-section">
              <div className="trade-setup-heading" style={{ justifyContent: 'space-between', gap: '16px' }}>
                <div className="trade-setup-brand">
                  <div className="trade-setup-icon">
                    <ExpiryHeaderIcon />
                  </div>
                  <h4>Trade Day Calendar</h4>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
                  <button className="button secondary trade-settings-button" type="button" onClick={onOpenSettings} aria-label="Open trade dashboard settings">
                    <SettingsIcon />
                  </button>
                </div>
              </div>

              <div className="trade-setup-divider" />

              <div className="trade-date-layout">
                <section className="trade-date-left-panel">
                  <div className="trade-date-toolbar">
                    <div className="trade-date-toolbar-actions">
                      <button
                        type="button"
                        className="button secondary trade-date-nav-button"
                        onClick={() => {
                          const todayIndex = tradeCalendarMonths.findIndex((month) => month.monthKey === todayDateKey.slice(0, 7));
                          if (todayIndex >= 0) setVisibleTradeMonthIndex(todayIndex);
                          setCalendarView('dates');
                        }}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="button secondary trade-date-icon-button"
                        onClick={() => {
                          if (calendarView === 'months' || calendarView === 'years') {
                            moveCalendarYear(-1);
                          } else {
                            setVisibleTradeMonthIndex((current) => Math.max(current - 1, 0));
                          }
                        }}
                        disabled={calendarView === 'dates' && !canGoToPreviousTradeMonth}
                        aria-label={calendarView === 'months' ? 'Previous year' : 'Previous month'}
                      >
                        <CalendarChevronIcon direction="left" />
                      </button>
                      <button
                        type="button"
                        className="button secondary trade-date-icon-button"
                        onClick={() => {
                          if (calendarView === 'months' || calendarView === 'years') {
                            moveCalendarYear(1);
                          } else {
                            setVisibleTradeMonthIndex((current) => Math.min(current + 1, Math.max(tradeCalendarMonths.length - 1, 0)));
                          }
                        }}
                        disabled={calendarView === 'dates' && !canGoToNextTradeMonth}
                        aria-label={calendarView === 'months' ? 'Next year' : 'Next month'}
                      >
                        <CalendarChevronIcon direction="right" />
                      </button>
                      <button
                        type="button"
                        className={`button secondary trade-date-view-button${calendarView === 'dates' ? ' active' : ''}`}
                        onClick={() => setCalendarView('dates')}
                      >
                        Day
                      </button>
                      <button
                        type="button"
                        className={`button secondary trade-date-view-button${calendarView === 'months' ? ' active' : ''}`}
                        onClick={() => setCalendarView('months')}
                      >
                        Month
                      </button>
                      <button
                        type="button"
                        className={`button secondary trade-date-view-button${calendarView === 'years' ? ' active' : ''}`}
                        onClick={() => setCalendarView('years')}
                      >
                        Year
                      </button>
                    </div>
                  </div>

                  <div className="trade-date-calendar-shell">
                    {calendarView === 'years' ? (
                      <div className="trade-date-year-selector">
                        <div className="trade-date-year-nav">
                          <button type="button" className="button secondary trade-date-icon-button" onClick={() => moveCalendarYear(-1)} aria-label="Previous year">
                            <CalendarChevronIcon direction="left" />
                          </button>
                          <strong>{visibleTradeYear}</strong>
                          <button type="button" className="button secondary trade-date-icon-button" onClick={() => moveCalendarYear(1)} aria-label="Next year">
                            <CalendarChevronIcon direction="right" />
                          </button>
                        </div>
                        <div className="trade-date-year-grid">
                          {availableTradeYears.map((year) => (
                            <button
                              key={year}
                              type="button"
                              className={`trade-date-year-tile${visibleTradeYear === year ? ' active' : ''}`}
                              onClick={() => selectCalendarYear(year)}
                            >
                              {year}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : calendarView === 'months' ? (
                      <div className="trade-date-month-selector">
                        <div className="trade-date-year-nav">
                          <button type="button" className="button secondary trade-date-icon-button" onClick={() => moveCalendarYear(-1)} aria-label="Previous year">
                            <CalendarChevronIcon direction="left" />
                          </button>
                          <strong>{visibleTradeYear}</strong>
                          <button type="button" className="button secondary trade-date-icon-button" onClick={() => moveCalendarYear(1)} aria-label="Next year">
                            <CalendarChevronIcon direction="right" />
                          </button>
                        </div>
                        <div className="trade-date-month-grid">
                          {CALENDAR_MONTH_NAMES.map((month, monthIndex) => {
                            const monthKey = `${visibleTradeYear}-${String(monthIndex + 1).padStart(2, '0')}`;
                            const isActive = visibleTradeMonth?.monthKey === monthKey;
                            const hasDates = availableMonthKeys.has(monthKey);
                            return (
                              <button
                                key={month}
                                type="button"
                                className={`trade-date-month-tile${isActive ? ' active' : ''}`}
                                disabled={!hasDates}
                                onClick={() => selectCalendarMonth(monthIndex)}
                              >
                                {month}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="trade-date-calendar-view">
                        <button type="button" className="trade-date-month-heading" onClick={() => setCalendarView('months')}>
                        <span>{visibleTradeMonth?.label ?? 'Trade Day Calendar'}</span>
                          <CalendarChevronIcon direction="down" />
                        </button>
                        <div className="trade-date-weekdays">
                          {CALENDAR_WEEKDAY_NAMES.map((weekday) => (
                            <span key={weekday}>{weekday}</span>
                          ))}
                        </div>
                        <div className="trade-date-days">
                          {visibleTradeMonth ? (
                            visibleTradeMonth.days.map((day) => {
                              const isSelected = draft.trade_date === day.dateKey;
                              const isToday = day.dateKey === todayDateKey;
                              const canSelect = day.inMonth && day.isEligible && !loadingCalendar && !isExitStage;
                              return (
                                <button
                                  key={day.dateKey}
                                  type="button"
                                  className={`trade-date-day${day.inMonth && day.isEligible ? ' available' : ' unavailable'}${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                                  disabled={!canSelect}
                                  tabIndex={canSelect ? 0 : -1}
                                  title={day.option ? formatTradeCalendarOption(day.option) : day.dateKey}
                                  aria-label={day.option ? formatTradeCalendarOption(day.option) : day.dateKey}
                                  aria-pressed={isSelected}
                                  onClick={() => {
                                    const option = day.option;
                                    if (!option || !canSelect) return;
                                    onUpdateDraft((current) => ({
                                      ...current,
                                      trade_date: option.date,
                                      expiry: option.expiry,
                                      track_strike: option.strike === null ? '' : String(option.strike),
                                      gap_status: option.gapStatus ?? '',
                                      ema_status: option.emaStatus ?? '',
                                    }));
                                  }}
                                >
                                  {day.dayLabel}
                                </button>
                              );
                            })
                          ) : (
                            <div className="trade-date-calendar-empty">{loadingCalendar ? 'Loading trade days...' : 'No trade days available'}</div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                </section>

                <div className="trade-date-side-panel">
                  <label className="trade-setup-field trade-selected-date-field">
                    <span>Selected Date</span>
                    <div className="trade-selected-date-value">
                      <ExpiryHeaderIcon />
                      <strong>{formatSelectedDateDisplay(draft.trade_date)}</strong>
                    </div>
                  </label>
                  <label className="trade-setup-field">
                    <span>Expiry Date</span>
                    <input
                      className="trade-theme-control"
                      value={selectedTradeDateOption.expiry ? formatModalDateDisplay(selectedTradeDateOption.expiry) : ''}
                      readOnly
                      placeholder="Derived from trade day"
                    />
                  </label>
                  <label className="trade-setup-field">
                    <span>DTE</span>
                    <input
                      className="trade-theme-control"
                      value={selectedTradeDateOption?.dte ?? ''}
                      readOnly
                      placeholder="Derived from trade day"
                    />
                  </label>
                  <label className="trade-setup-field">
                    <span>Strike</span>
                    <input
                      className="trade-theme-control"
                      type="text"
                      inputMode="numeric"
                      placeholder={selectedTradeDateOption.strike === null ? 'ATM unavailable' : 'Enter strike'}
                      value={formatIndianNumber(draft.track_strike)}
                      disabled={isExitStage || !draft.trade_date}
                      onChange={(event) =>
                        onUpdateDraft((current) => ({
                          ...current,
                          track_strike: parseIndianNumberInput(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="trade-setup-field">
                    <span>GAP Status</span>
                    {(() => {
                      const gapBadge = formatGapBadge(selectedTradeDateOption);
                      return (
                        <div className="trade-gap-field-row">
                          <div
                            className={`trade-theme-control trade-gap-status-display trade-status-control${gapBadge.statusClass ? ` ${gapBadge.statusClass}` : ''}`}
                            aria-label="GAP status derived from the selected trade day"
                          >
                            {gapBadge.label}
                          </div>
                        </div>
                      );
                    })()}
                  </label>
                  <label className="trade-setup-field">
                    <span>EMA Status</span>
                    <div
                      className={`trade-theme-control trade-status-control${selectedTradeDateOption.emaStatus ? ` status-${toStatusClass(selectedTradeDateOption.emaStatus ?? '')}` : ''}`}
                      aria-label="EMA status derived from the selected trade day"
                    >
                      {selectedTradeDateOption?.emaStatus ?? 'â€”'}
                    </div>
                  </label>
                </div>
              </div>
            </section>
          ) : null}

        {!isEntryStage ? (
      <TradeEntryPage
        embedded
        isEditingExistingTrade={isEditingExistingTrade}
        onClose={onClose}
        onSaveAndExit={onSaveAndExit}
        saving={saving}
        entryReasons={entryReasons}
        exitReasons={exitReasons}
        transitionRules={transitionRules}
        tradeDates={tradeDates}
        loadingCalendar={loadingCalendar}
        draft={draft}
        onUpdateDraft={onUpdateDraft}
        onOpenSettings={onOpenSettings}
      />
          ) : null}
          {false ? (
            <section className="trade-workspace">
              <div className="trade-leg-toolbar">
                <div className="trade-leg-toolbar-heading">
                  <strong>Legs</strong>
                  <span>{draft.legs.length}</span>
                </div>
                <div className="trade-leg-toolbar-actions">
                  {!isEntryStage && activeLegIndex === 0 && activeLeg?.trades.length < 2 ? (
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => onUpdateDraft((current) => addTradeToLeg(current, activeLegIndex))}
                    >
                      Add Trade 2
                    </button>
                  ) : null}
                  {isExitStage && draft.legs.length > 1 ? (
                    <button
                      className="button danger"
                      type="button"
                      onClick={() => onUpdateDraft((current) => removeLeg(current, activeLegIndex))}
                    >
                      Remove Leg
                    </button>
                  ) : null}
                </div>
              </div>

              {activeLeg ? (
                <div className="trade-entry-list">
                  {activeLeg.trades.map((trade, tradeIndex) => {
                    const tradeSelected = trade.id === selectedTradeId;
                    const matchingRule = findMatchingTransitionRule(trade, transitionRules);
                    const tradeResults = computeTradeResults(trade);

                    return (
                      <div className={`trade-entry-card${tradeSelected ? ' selected' : ''}`} key={trade.id}>
                        <div className="trade-entry-card-header">
                          <strong>Trade {tradeIndex + 1}</strong>
                          {isExitStage ? (
                            <button
                              className="button danger"
                              type="button"
                              onClick={() => onUpdateDraft((current) => removeTradeFromLeg(current, activeLegIndex, tradeIndex))}
                            >
                              Remove Trade
                            </button>
                          ) : null}
                        </div>

                        {isSetupReady ? (
                          <section className="trade-form-section">
                            <div className="trade-section-heading">
                              <div>
                                <h4>TRADE</h4>
                              </div>
                            </div>
                            <div className="trade-section-grid trade-row-grid">
                              <label>
                                <span>Leg Strike</span>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={trade.trade_strike}
                                  onChange={(event) =>
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      trade_strike: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                <span>Entry Reason</span>
                                <select
                                  className="trade-theme-control"
                                  value={trade.entry_reason}
                                  onChange={(event) =>
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      entry_reason: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Select entry reason</option>
                                  {getEntryReasonOptions(trade.entry_reason).map((reason) => (
                                    <option key={reason.id} value={reason.name}>
                                      {reason.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Option Type</span>
                                <select
                                  className="trade-theme-control"
                                  value={trade.option}
                                  onChange={(event) =>
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      option: event.target.value as TradeOption,
                                    }))
                                  }
                                >
                                  <option value="CE">CE</option>
                                  <option value="PE">PE</option>
                                </select>
                              </label>
                              <label>
                                <span>Quantity</span>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={trade.quantity}
                                  onChange={(event) => {
                                    rememberTradeQuantity(event.target.value);
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      quantity: event.target.value,
                                    }));
                                  }}
                                />
                              </label>
                              <label>
                                <span>Entry Time</span>
                                <TimeInputField
                                  inputClassName="trade-theme-control"
                                  value={timeDrafts[createTimeDraftKey(trade.id, tradeIndex, 'entryTime')] ?? trade.entry_time}
                                  placeholder="09:18"
                                  minimumValue={activeLegEntryMinimumTime}
                                  minimumInclusive
                                  onChange={(nextValue) => handleTimeDraftChange(tradeIndex, 'entry_time', nextValue)}
                                  onBlur={() => handleTimeDraftBlur(tradeIndex, 'entry_time')}
                                />
                              </label>
                              <label>
                                <span>Entry Price</span>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={trade.entry_price}
                                  onChange={(event) =>
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      entry_price: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                <span>Exit Reason</span>
                                <select
                                  className="trade-theme-control"
                                  value={trade.exit_reason}
                                  disabled={!hasCompleteEntryDraft(trade) && !isExitStage}
                                  onChange={(event) => updateExitReasonWithTransition(activeLegIndex, tradeIndex, event.target.value)}
                                >
                                  <option value="">Select exit reason</option>
                                  {getExitReasonOptions(trade.exit_reason).map((reason) => (
                                    <option key={reason.id} value={reason.name}>
                                      {reason.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Exit Time</span>
                                <TimeInputField
                                  inputClassName="trade-theme-control"
                                  value={timeDrafts[createTimeDraftKey(trade.id, tradeIndex, 'exitTime')] ?? trade.exit_time}
                                  placeholder="09:18"
                                  minimumValue={timeDrafts[createTimeDraftKey(trade.id, tradeIndex, 'entryTime')] ?? trade.entry_time}
                                  disabled={!hasCompleteEntryDraft(trade) && !isExitStage}
                                  readOnly={isEodExitReason(trade.exit_reason)}
                                  onChange={(nextValue) => handleTimeDraftChange(tradeIndex, 'exit_time', nextValue)}
                                  onBlur={() => handleTimeDraftBlur(tradeIndex, 'exit_time')}
                                />
                              </label>
                              <label>
                                <span>Exit Price</span>
                                <input
                                  type="number"
                                  step="0.05"
                                  value={trade.exit_price}
                                  disabled={!hasCompleteEntryDraft(trade) && !isExitStage}
                                  onChange={(event) =>
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      exit_price: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          </section>
                        ) : null}

                        {isSetupReady && hasCompleteExitDraft(trade) ? (
                          <section className="trade-form-section trade-results-section">
                            <div className="trade-section-heading">
                              <div>
                                <h4>RESULT</h4>
                              </div>
                              <span>Auto-calculated from entry and exit</span>
                            </div>
                            <div className="trade-result-grid">
                              <label>
                                <span>Points</span>
                                <input value={formatPrice(tradeResults.points)} readOnly />
                              </label>
                              <label>
                                <span>P&amp;L</span>
                                <input value={formatPrice(tradeResults.pl)} readOnly />
                              </label>
                              <label>
                                <span>ROI %</span>
                                <input value={formatPercent(tradeResults.roi)} readOnly />
                              </label>
                              <label>
                                <span>Holding Time</span>
                                <input value={formatHoldingTime(tradeResults.holdingTime)} readOnly />
                              </label>
                            </div>
                          </section>
                        ) : null}

                        {trade.exit_reason.trim() ? (
                          matchingRule ? (
                            <div className="trade-transition-panel">
                              <div className="trade-transition-panel-copy">
                                <strong>Transition rule matched</strong>
                                <div className="trade-transition-panel-details">
                                  <span>Trigger: {matchingRule.trigger_option}</span>
                                  <span>Exit Reason: {matchingRule.exit_reason}</span>
                                  <span>Other Leg Exit Reason: {matchingRule.other_leg_exit_reason ?? '-'}</span>
                                  <span>New Leg Entry Reason: {matchingRule.entry_reason ?? '-'}</span>
                                  <span>New Leg: {matchingRule.create_new_leg && matchingRule.new_leg_option ? matchingRule.new_leg_option : 'No'}</span>
                                </div>
                              </div>
                              <button
                                className="button secondary"
                                type="button"
                                onClick={() => {
                                  onUpdateDraft((current) => applyTransitionRuleToDraft(current, activeLegIndex, tradeIndex, matchingRule));
                                }}
                              >
                                Apply Rule
                              </button>
                            </div>
                          ) : (
                            <div className="trade-transition-panel muted">
                              <span>No active transition rule matches this option and exit reason yet.</span>
                            </div>
                          )
                        ) : null}

                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

      </div>
    </div>
  );
}

function TradeDetailModal({
  row,
  onClose,
  onEdit,
  onCancelTrade,
}: {
  row: DashboardRow | null;
  onClose: () => void;
  onEdit: () => void;
  onCancelTrade: () => void;
}) {
  if (!row) return null;

  const tradeDayCount = row.record.legs.length;
  const tradeCount = row.record.legs.reduce((total, leg) => total + leg.trades.length, 0);

  return (
    <div className="trade-detail-backdrop" role="presentation" onClick={onClose}>
      <div
        className="trade-detail-modal trade-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Leg summary"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="trade-modal-topbar trade-detail-topbar">
          <div className="trade-detail-title">
            <span>Leg Summary</span>
            <strong>
              {row.tradeDate} Â· Leg {row.legNo} Â· <TradeOptionValue option={row.option} />
            </strong>
          </div>
          <button className="button secondary trade-modal-close trade-detail-close" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="trade-modal-body trade-detail-body">
          <section className="trade-form-section trade-detail-summary">
            <div className="trade-detail-summary-grid">
              <article className="trade-detail-summary-card">
                <span>Trade Day</span>
                <strong>{row.tradeDate}</strong>
              </article>
              <article className="trade-detail-summary-card">
                <span>Expiry</span>
                <strong>{row.expiry}</strong>
              </article>
              <article className="trade-detail-summary-card">
                <span>Track Strike</span>
                <strong>{row.trackStrike ?? '-'}</strong>
              </article>
              <article className="trade-detail-summary-card">
                <span>Leg / Row Count</span>
                <strong>
                  {tradeDayCount} legs Â· {tradeCount} trades
                </strong>
              </article>
            </div>

            <div className="trade-detail-grid">
              <div className="trade-detail-field">
                <span>Option</span>
                <strong>
                  <TradeOptionValue option={row.option} />
                </strong>
              </div>
              <div className="trade-detail-field">
                <span>Leg Strike</span>
                <strong>{row.tradeStrike ?? '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Quantity</span>
                <strong>{row.trade.quantity ?? 1}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Entry Reason</span>
                <strong>{row.entryReason || '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Exit Reason</span>
                <strong>{row.exitReason || '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Entry Time</span>
                <strong>{row.entryTime || '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Entry Price</span>
                <strong>{formatPrice(row.entryPrice)}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Exit Time</span>
                <strong>{row.exitTime || '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Exit Price</span>
                <strong>{formatPrice(row.exitPrice)}</strong>
              </div>
              <div className="trade-detail-field">
                <span>PL</span>
                <strong style={getPnlTextStyle(row.pl)}>{formatDashboardNumber(row.pl)}</strong>
              </div>
            </div>
          </section>
        </div>

        <div className="trade-detail-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button className="button danger" type="button" onClick={onCancelTrade}>
            Delete
          </button>
          <button className="button primary" type="button" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function TradeDetailModalLight({
  row,
  onClose,
  onEdit,
  onCancelTrade,
}: {
  row: DashboardRow | null;
  onClose: () => void;
  onEdit: () => void;
  onCancelTrade: () => void;
}) {
  if (!row) return null;

  const tradeDayCount = row.record.legs.length;
  const tradeCount = row.record.legs.reduce((total, leg) => total + leg.trades.length, 0);

  return (
    <div className="trade-detail-backdrop" role="presentation" onClick={onClose}>
      <div className="trade-detail-modal trade-modal" role="dialog" aria-modal="true" aria-label="Leg summary" onClick={(event) => event.stopPropagation()}>
        <div className="trade-modal-topbar trade-detail-topbar">
          <div className="trade-detail-title">
            <span>Leg Summary</span>
            <strong>
              {row.tradeDate} Â· Leg {row.legNo} Â· <TradeOptionValue option={row.option} />
            </strong>
          </div>
          <button className="button secondary trade-modal-close trade-detail-close" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="trade-modal-body trade-detail-body">
          <section className="trade-form-section trade-detail-summary">
            <div className="trade-section-heading">
              <div>
                <h4>TRADE OVERVIEW</h4>
              </div>
              <span>Read-only summary of the selected leg</span>
            </div>

            <div className="trade-detail-summary-grid">
              <article className="trade-detail-summary-card">
                <span>Trade Day</span>
                <strong>{row.tradeDate}</strong>
              </article>
              <article className="trade-detail-summary-card">
                <span>Expiry</span>
                <strong>{row.expiry}</strong>
              </article>
              <article className="trade-detail-summary-card">
                <span>Track Strike</span>
                <strong>{row.trackStrike ?? '-'}</strong>
              </article>
              <article className="trade-detail-summary-card">
                <span>Leg / Row Count</span>
                <strong>
                  {tradeDayCount} legs Â· {tradeCount} trades
                </strong>
              </article>
            </div>

            <div className="trade-detail-grid">
              <div className="trade-detail-field">
                <span>Option</span>
                <strong>
                  <TradeOptionValue option={row.option} />
                </strong>
              </div>
              <div className="trade-detail-field">
                <span>Leg Strike</span>
                <strong>{row.tradeStrike ?? '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Quantity</span>
                <strong>{row.trade.quantity ?? 1}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Entry Reason</span>
                <strong>{row.entryReason || '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Entry Time</span>
                <strong>{row.entryTime || '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Entry Price</span>
                <strong>{formatPrice(row.entryPrice)}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Exit Reason</span>
                <strong>{row.exitReason || '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Exit Time</span>
                <strong>{row.exitTime || '-'}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Exit Price</span>
                <strong>{formatPrice(row.exitPrice)}</strong>
              </div>
            </div>
          </section>

          <section className="trade-form-section trade-results-section trade-detail-metrics">
            <div className="trade-section-heading">
              <div>
                <h4>RESULT</h4>
              </div>
              <span>PL, DD PL, PL Amt, and DD Amt</span>
            </div>
            <div className="trade-result-grid trade-detail-metrics-grid">
              <label>
                <span>PL</span>
                <input value={formatDashboardNumber(row.plPoints)} readOnly />
              </label>
              <label>
                <span>DD PL</span>
                <input value={formatDashboardNumber(row.ddPoints)} readOnly />
              </label>
              <label>
                <span>PL Amt</span>
                <input value={formatSignedCurrency(row.plAmount)} readOnly />
              </label>
              <label>
                <span>DD Amt</span>
                <input value={formatSignedCurrency(row.ddAmount)} readOnly />
              </label>
            </div>
          </section>
        </div>

        <div className="trade-modal-footer trade-detail-footer">
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button className="button danger" type="button" onClick={onCancelTrade}>
            Delete
          </button>
          <button className="button primary" type="button" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

export function EMAIntradayTradePage() {
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [entryReasons, setEntryReasons] = useState<EntryReason[]>([]);
  const [exitReasons, setExitReasons] = useState<ExitReason[]>([]);  const [tradeDates, setTradeDates] = useState<TradeCalendarDateOption[]>([]);
  const [transitionRules, setTransitionRules] = useState<TradeTransitionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [open, setOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<DashboardRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [flowStage, setFlowStage] = useState<'expiry' | 'entry' | 'exit'>('expiry');
  const [draft, setDraft] = useState<TradeRecordDraft>(emptyTradeDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tradeDashboardSettings, setTradeDashboardSettings] = useState<TradeDashboardSettings>(
    () => cloneTradeDashboardSettings(DEFAULT_TRADE_DASHBOARD_SETTINGS),
  );
  const isEditingExistingTrade = editingId !== null;

  useEffect(() => {
    let active = true;

    void loadTradeRecords()
      .then((loadedRecords) => {
        if (!active) return;
        setRecords(loadedRecords);
      })
      .catch(() => {
        if (!active) return;
        setRecords([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {    void Promise.all([fetchEntryReasons(), fetchExitReasons(), fetchTradeTransitionRules()])
      .then(([entryRows, exitRows, transitionRows]) => {
        setEntryReasons(entryRows.filter((reason) => reason.is_active && !HIDDEN_REASON_NAMES.has(reason.name)));
        setExitReasons(exitRows.filter((reason) => reason.is_active && !HIDDEN_REASON_NAMES.has(reason.name)));
        setTransitionRules(transitionRows.filter((rule) => rule.is_active));
      })
      .catch(() => {
        setEntryReasons([]);
        setExitReasons([]);
        setTransitionRules([]);
      });
  }, []);

  useEffect(() => {    if (!open) {
      setTradeDates([]);
      setLoadingCalendar(false);
      return;
    }

    let active = true;
    setLoadingCalendar(true);
    setTradeDates([]);

    void fetchTradeCalendar()
      .then((calendar) => {
        if (!active) return;
        const timeline = getTradePerfTimeline();
        const trace = calendar.trace;
        timeline.__emaTradePerf = {
          ...(timeline.__emaTradePerf ?? {}),
          t2QueryStart: trace?.t2QueryStart,
          t3ResponseReceived: trace?.t3ResponseReceived,
          t4TransformComplete: trace?.t4TransformComplete,
          rowsReturned: trace?.rowsReturned,
          uniqueDatesReturned: trace?.uniqueDatesReturned,
          duplicateRowsSkipped: trace?.duplicateRowsSkipped,
          pageCount: trace?.pageCount,
          query: trace?.query,
          columns: trace?.columns,
          orderBy: trace?.orderBy,
          backendMs: trace?.backendMs,
          transformMs: trace?.transformMs,
          sourceTrace: trace,
        };
        setTradeDates(calendar.dates ?? []);
      })
      .catch(() => {
        if (!active) return;
        setTradeDates([]);
      })
      .finally(() => {
        if (active) setLoadingCalendar(false);
      });

    return () => {
      active = false;
    };
  }, [open]);
  const tradeRows = useMemo(() => flattenTradeRows(records), [records]);
  const dashboardRows = useMemo(() => buildDashboardRows(tradeRows), [tradeRows]);
  const [activePreset, setActivePreset] = useState<DashboardPreset>('all');
  const [openFilterColumn, setOpenFilterColumn] = useState<DashboardColumnKey | null>(null);
  const [openColumnSelector, setOpenColumnSelector] = useState(false);
  const [appliedColumnFilters, setAppliedColumnFilters] = useState<ColumnFilterMap>(() => createEmptyColumnFilters());
  const [draftColumnFilters, setDraftColumnFilters] = useState<ColumnFilterMap>(() => createEmptyColumnFilters());
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPopoverStyle, setFilterPopoverStyle] = useState<CSSProperties | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<DashboardColumnKey, boolean>>(() => createDefaultVisibleDashboardColumns());
  const filterButtonRefs = useRef<Partial<Record<DashboardColumnKey, HTMLButtonElement | null>>>({});
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const visibleDashboardColumns = DASHBOARD_COLUMN_KEYS.filter((key) => visibleColumns[key]);
  const visibleDashboardColumnCount = Math.max(visibleDashboardColumns.length, 1);

  const allColumnValues = useMemo(() => {
    return DASHBOARD_COLUMN_KEYS.reduce((accumulator, key) => {
      const values = new Set(dashboardRows.map((row) => getDashboardValue(row, key)).filter((value) => value !== '-'));
      accumulator[key] = Array.from(values).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      return accumulator;
    }, {} as Record<DashboardColumnKey, string[]>);
  }, [dashboardRows]);

  const filteredByColumns = useMemo(() => {
    return dashboardRows.filter((row) =>
      DASHBOARD_COLUMN_KEYS.every((key) => {
        const selected = appliedColumnFilters[key];
        if (selected.length === 0) return true;
        return selected.includes(getDashboardValue(row, key));
      }),
    );
  }, [appliedColumnFilters, dashboardRows]);

  const visibleRows = useMemo(() => {
    const now = new Date();
    return filteredByColumns.filter((row) => {
      const tradeDate = parseDateKey(row.tradeDate);
      switch (activePreset) {
        case 'today':
          return tradeDate ? tradeDate.toDateString() === now.toDateString() : false;
        case 'week':
          return tradeDate ? isWithinCurrentWeek(tradeDate, now) : false;
        case 'month':
          return tradeDate ? isWithinCurrentMonth(tradeDate, now) : false;
        case 'profitable':
          return (row.plPoints ?? 0) > 0;
        case 'losing':
          return (row.plPoints ?? 0) < 0;
        case 'maxDd': {
          const minDd = filteredByColumns.reduce((min, current) => Math.min(min, current.ddPoints), 0);
          return row.ddPoints === minDd;
        }
        case 'custom':
        case 'all':
        default:
          return true;
      }
    });
  }, [activePreset, filteredByColumns]);

  const ddFloor = useMemo(() => {
    return filteredByColumns.reduce((min, row) => Math.min(min, row.ddPoints), 0);
  }, [filteredByColumns]);

  const presetCounts = useMemo(() => {
    const now = new Date();
    return DASHBOARD_TILE_KEYS.reduce((accumulator, key) => {
      let count = filteredByColumns.length;
      if (key === 'today') {
        count = filteredByColumns.filter((row) => {
          const tradeDate = parseDateKey(row.tradeDate);
          return tradeDate ? tradeDate.toDateString() === now.toDateString() : false;
        }).length;
      } else if (key === 'week') {
        count = filteredByColumns.filter((row) => {
          const tradeDate = parseDateKey(row.tradeDate);
          return tradeDate ? isWithinCurrentWeek(tradeDate, now) : false;
        }).length;
      } else if (key === 'month') {
        count = filteredByColumns.filter((row) => {
          const tradeDate = parseDateKey(row.tradeDate);
          return tradeDate ? isWithinCurrentMonth(tradeDate, now) : false;
        }).length;
      } else if (key === 'profitable') {
        count = filteredByColumns.filter((row) => (row.plPoints ?? 0) > 0).length;
      } else if (key === 'losing') {
        count = filteredByColumns.filter((row) => (row.plPoints ?? 0) < 0).length;
      } else if (key === 'maxDd') {
        count = filteredByColumns.filter((row) => row.ddPoints === ddFloor).length;
      }
      accumulator[key] = count;
      return accumulator;
    }, {} as Record<DashboardPreset, number>);
  }, [ddFloor, filteredByColumns]);

  const totalDays = new Set(visibleRows.map((row) => row.tradeDate)).size;

  useEffect(() => {
    const activeFilterColumn = openFilterColumn;
    if (!activeFilterColumn) {
      setFilterSearch('');
      setFilterPopoverStyle(null);
      return;
    }

    setFilterSearch('');
    setDraftColumnFilters((current) => ({
      ...current,
      [activeFilterColumn]:
        appliedColumnFilters[activeFilterColumn].length > 0 ? [...appliedColumnFilters[activeFilterColumn]] : allColumnValues[activeFilterColumn],
    }));
  }, [allColumnValues, appliedColumnFilters, openFilterColumn]);

  useLayoutEffect(() => {
    const activeFilterColumn = openFilterColumn;
    if (!activeFilterColumn) {
      setFilterPopoverStyle(null);
      return;
    }
    const column = activeFilterColumn;

    function updateFilterPopoverPosition() {
      const anchor = filterButtonRefs.current[column];
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const viewportMargin = 8;
      const gap = 8;
      const preferredWidth = 280;
      const maxWidth = Math.max(240, Math.min(preferredWidth, window.innerWidth - viewportMargin * 2));
      const width = Math.max(240, Math.min(Math.max(preferredWidth, rect.width), maxWidth));
      const estimatedHeight = Math.min(450, 96 + allColumnValues[column].length * 32);
      const availableBelow = window.innerHeight - rect.bottom - viewportMargin;
      const canFitBelow = availableBelow >= Math.min(estimatedHeight, 240);
      const top = canFitBelow
        ? Math.min(rect.bottom + gap, window.innerHeight - viewportMargin - 120)
        : Math.max(viewportMargin, rect.top - gap - estimatedHeight);
      const left = Math.min(
        Math.max(viewportMargin, rect.left),
        Math.max(viewportMargin, window.innerWidth - width - viewportMargin),
      );

      setFilterPopoverStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight: Math.min(450, window.innerHeight - viewportMargin * 2),
        zIndex: 9999,
      });
    }

    updateFilterPopoverPosition();

    window.addEventListener('resize', updateFilterPopoverPosition);
    window.addEventListener('scroll', updateFilterPopoverPosition, true);

    return () => {
      window.removeEventListener('resize', updateFilterPopoverPosition);
      window.removeEventListener('scroll', updateFilterPopoverPosition, true);
    };
  }, [allColumnValues, openFilterColumn]);

  useEffect(() => {
    const activeFilterColumn = openFilterColumn;
    if (!activeFilterColumn) return;
    const column = activeFilterColumn;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const anchor = filterButtonRefs.current[column];
      if (anchor?.contains(target) || filterPopoverRef.current?.contains(target)) {
        return;
      }

      setOpenFilterColumn(null);
    }

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [openFilterColumn]);

  function applyColumnFilter(column: DashboardColumnKey) {
    const selected = draftColumnFilters[column] ?? [];
    setAppliedColumnFilters((current) => ({
      ...current,
      [column]: selected.length === allColumnValues[column].length ? [] : selected,
    }));
    setOpenFilterColumn(null);
  }

  function clearColumnFilter(column: DashboardColumnKey) {
    setDraftColumnFilters((current) => ({
      ...current,
      [column]: [],
    }));
    setAppliedColumnFilters((current) => ({
      ...current,
      [column]: [],
    }));
    setOpenFilterColumn(null);
  }

  function toggleDraftFilterValue(column: DashboardColumnKey, value: string) {
    setDraftColumnFilters((current) => {
      const currentValues = current[column] ?? [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value];
      return {
        ...current,
        [column]: nextValues,
      };
    });
  }

  function setDraftFilterValues(column: DashboardColumnKey, values: string[]) {
    setDraftColumnFilters((current) => ({
      ...current,
      [column]: values,
    }));
  }

  function toggleDashboardColumnVisibility(column: DashboardColumnKey) {
    setVisibleColumns((current) => {
      const visibleCount = DASHBOARD_COLUMN_KEYS.filter((key) => current[key]).length;
      if (current[column] && visibleCount <= 1) return current;
      return {
        ...current,
        [column]: !current[column],
      };
    });
  }

  function resetDashboardColumns() {
    setVisibleColumns(createDefaultVisibleDashboardColumns());
  }

  async function refreshRecords() {
    try {
      const loadedRecords = await loadTradeRecords();
      setRecords(loadedRecords);
    } catch {
      setRecords([]);
    }
  }

  function beginAddTradeDay() {
    const timeline = getTradePerfTimeline();
    timeline.__emaTradePerf = {
      t1ModalOpenStart: performance.now(),
    };
    setEditingId(null);
    setSelectedTradeId(null);
    setDetailRow(null);
    setFlowStage('expiry');
    setDraft(emptyTradeDraft());
    setOpen(true);
  }

  function beginEditTradeDay(record: TradeRecord, tradeId: string | null) {
    setEditingId(record.id);
    setSelectedTradeId(tradeId);
    setFlowStage('entry');
    setDraft(toDraftFromRecord(record));
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setSelectedTradeId(null);
    setFlowStage('entry');
    setDraft(emptyTradeDraft());
  }

  function openTradeEditor(row: DashboardRow) {
    beginEditTradeDay(row.record, null);
  }

  function closeTradeDetail() {
    setDetailRow(null);
  }

  function openSettings() {
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
  }

  function saveSettings(nextSettings: TradeDashboardSettings) {
    setTradeDashboardSettings(cloneTradeDashboardSettings(nextSettings));
    setSettingsOpen(false);
  }

  function editTradeFromDetail() {
    if (!detailRow) return;
    const { record, tradeId } = detailRow;
    closeTradeDetail();
    beginEditTradeDay(record, tradeId);
  }

  async function cancelTradeFromDetail() {
    if (!detailRow) return;
    if (!window.confirm(`Cancel trade ${detailRow.option} for leg ${detailRow.legNo} on ${detailRow.tradeDate}?`)) return;
    await deleteTradeEntry(detailRow.recordId, detailRow.tradeId);
    await refreshRecords();
    closeTradeDetail();
  }

  async function handleSave(nextStage: 'entry' | 'exit' | 'close') {
    setSaving(true);
    setError(null);
    try {
      console.info('SAVE_T1 Button Click', {
        editingId,
        nextStage,
        tradeDate: draft.trade_date,
      });
      if (nextStage !== 'close') {
        if (nextStage === 'entry') {
          setFlowStage('entry');
          setSelectedTradeId(draft.legs[0]?.trades[0]?.id ?? null);
        } else if (nextStage === 'exit') {
          const nextLeg = draft.legs[draft.legs.length - 1] ?? draft.legs[0] ?? null;
          const nextLegTradeId = nextLeg?.trades[0]?.id ?? null;
          if (draft.legs.length > 1 && nextLegTradeId) {
            setFlowStage('entry');
            setSelectedTradeId(nextLegTradeId);
          } else {
            setFlowStage('exit');
            setSelectedTradeId(draft.legs[0]?.trades[0]?.id ?? null);
          }
        }
        return;
      }

      const savedRecord = await saveTradeRecord(draft, editingId);
      const selectedTradeQuantity =
        selectedTradeId !== null
          ? draft.legs.flatMap((leg) => leg.trades).find((trade) => trade.id === selectedTradeId)?.quantity ?? null
          : savedRecord.legs[0]?.trades[0]?.quantity ?? null;
      if (typeof selectedTradeQuantity === 'number' && Number.isFinite(selectedTradeQuantity) && selectedTradeQuantity > 0) {
        rememberTradeQuantity(String(selectedTradeQuantity));
      }
      if (!editingId) {
        setEditingId(savedRecord.id);
      }
      await refreshRecords();
      closeModal();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Unable to save leg day.');
    } finally {
      setSaving(false);
    }
  }

  function renderFilterHeader(column: DashboardColumnKey, label: string) {
    const isOpen = openFilterColumn === column;
    const values = allColumnValues[column];
    const search = filterSearch.trim().toLowerCase();
    const selectedValues = draftColumnFilters[column] ?? [];
    const visibleValues = values.filter((value) => value.toLowerCase().includes(search));
    const allVisibleSelected = visibleValues.length > 0 && visibleValues.every((value) => selectedValues.includes(value));
    const someVisibleSelected = visibleValues.some((value) => selectedValues.includes(value));
    const filterPopover = isOpen
      ? createPortal(
          <div
            ref={filterPopoverRef}
            className="trade-column-filter-popover"
            role="dialog"
            aria-label={`${label} filter`}
            style={filterPopoverStyle ?? undefined}
          >
            <input
              className="trade-column-filter-search"
              type="text"
              value={filterSearch}
              onChange={(event) => setFilterSearch(event.target.value)}
              placeholder="Search"
            />
            <label className="trade-column-filter-check all">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(element) => {
                  if (element) element.indeterminate = !allVisibleSelected && someVisibleSelected;
                }}
                onChange={(event) => {
                  const nextValues = event.target.checked ? values : [];
                  setDraftFilterValues(column, nextValues);
                }}
              />
              <span>Select All</span>
            </label>
            <div className="trade-column-filter-values">
              {visibleValues.length > 0 ? (
                visibleValues.map((value) => (
                  <label key={value} className="trade-column-filter-check">
                    <input
                      type="checkbox"
                      checked={selectedValues.includes(value)}
                      onChange={() => toggleDraftFilterValue(column, value)}
                    />
                    <span>{value}</span>
                  </label>
                ))
              ) : (
                <div className="trade-column-filter-empty">No values found.</div>
              )}
            </div>
            <div className="trade-column-filter-actions">
              <button className="button secondary" type="button" onClick={() => clearColumnFilter(column)}>
                Clear
              </button>
              <button className="button primary" type="button" onClick={() => applyColumnFilter(column)}>
                Apply
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

    return (
      <th key={column} className={`trade-table-header trade-table-header--${column}`}>
        <div className="trade-table-header-copy">
          <span>{label}</span>
          <button
            className={`trade-table-filter-button${appliedColumnFilters[column].length > 0 ? ' active' : ''}`}
            type="button"
            ref={(element) => {
              filterButtonRefs.current[column] = element;
            }}
            aria-label={`Filter ${label}`}
            onClick={() => {
              setOpenFilterColumn((current) => (current === column ? null : column));
              setFilterSearch('');
            }}
          >
            <FilterIcon />
          </button>
        </div>
        {filterPopover}
      </th>
    );
  }

  function renderDashboardCell(row: DashboardRow, column: DashboardColumnKey) {
    switch (column) {
      case 'tradeDate':
        return <td key={column}>{formatDateTile(row.tradeDate)}</td>;
      case 'expiry':
        return <td key={column}>{formatDateTile(row.expiry)}</td>;
      case 'trade':
        return <td key={column}>SELL</td>;
      case 'option':
        return (
          <td key={column}>
            <TradeOptionValue option={row.option} />
          </td>
        );
      case 'strike':
        return <td key={column} className="trade-table-emphasis">{row.tradeStrike ?? '-'}</td>;
      case 'entryReason':
        return <td key={column}>{row.entryReason || '-'}</td>;
      case 'entryDate':
        return <td key={column}>{formatDateTile(row.tradeDate)}</td>;
      case 'entryTime':
        return <td key={column}>{formatTimeDisplay(row.entryTime)}</td>;
      case 'entryPrice':
        return <td key={column}>{formatPrice(row.entryPrice)}</td>;
      case 'exitReason':
        return <td key={column}>{row.exitReason || '-'}</td>;
      case 'exitDate':
        return <td key={column}>{formatDateTile(row.tradeDate)}</td>;
      case 'exitTime':
        return <td key={column}>{formatTimeDisplay(row.exitTime)}</td>;
      case 'exitPrice':
        return <td key={column}>{formatPrice(row.exitPrice)}</td>;
      case 'quantity':
        return <td key={column}>{row.qtyDisplay}</td>;
      case 'plPoints':
        return <td key={column}><span style={getPnlCellStyle(row.plPoints)}>{formatDashboardNumber(row.plPoints)}</span></td>;
      case 'plAmount':
        return <td key={column}><span style={getPnlCellStyle(row.plAmount)}>{formatSignedCurrency(row.plAmount)}</span></td>;
      case 'ddPoints':
        return <td key={column}><span style={getPnlCellStyle(row.ddPoints)}>{formatDashboardNumber(row.ddPoints)}</span></td>;
      case 'ddAmount':
        return <td key={column}><span style={getPnlCellStyle(row.ddAmount)}>{formatSignedCurrency(row.ddAmount)}</span></td>;
      default:
        return null;
    }
  }

  return (
    <section className="trade-dashboard">
      <section className="trade-log-card">
        <div className="trade-log-card-heading">
          <h3 className="trade-log-card-title">Trades</h3>
          <div className="trade-log-card-heading-actions">
            <div className="trade-column-selector-shell">
              <button
                className={`button secondary trade-column-selector-button${openColumnSelector ? ' active' : ''}`}
                type="button"
                onClick={() => setOpenColumnSelector((current) => !current)}
                aria-label="Choose visible columns"
              >
                Columns
              </button>
              {openColumnSelector ? (
                <div className="trade-column-selector-popover">
                  <div className="trade-column-selector-header">
                    <strong>Visible Columns</strong>
                    <button className="button secondary trade-column-selector-reset" type="button" onClick={resetDashboardColumns}>
                      Reset
                    </button>
                  </div>
                  <div className="trade-column-selector-list">
                    {DASHBOARD_COLUMN_KEYS.map((column) => (
                      <label key={column} className="trade-column-selector-item">
                        <input
                          type="checkbox"
                          checked={visibleColumns[column]}
                          onChange={() => toggleDashboardColumnVisibility(column)}
                        />
                        <span>{DASHBOARD_COLUMN_LABELS[column]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button className="button primary trade-add-day-button" type="button" onClick={beginAddTradeDay}>
              <span>+ Trade</span>
            </button>
          </div>
        </div>

        {error ? <div className="alert trade-alert">{error}</div> : null}

        <div className="trade-table-shell">
          <table className="trade-data-table">
            <thead>
              <tr>
                {visibleDashboardColumns.map((column) => renderFilterHeader(column, DASHBOARD_COLUMN_LABELS[column]))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={visibleDashboardColumnCount}>
                    No legs match the current filters.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.tradeId}
                    className="trade-log-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => openTradeEditor(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openTradeEditor(row);
                      }
                    }}
                    title="Open trade editor"
                  >
                    {visibleDashboardColumns.map((column) => renderDashboardCell(row, column))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="trade-table-footer">
          <div className="trade-table-footer-copy">
            <span>{visibleRows.length} rows visible</span>
            <span>{records.length} days</span>
          </div>
        </div>
      </section>

      <TradeDetailModalLight
        row={detailRow}
        onClose={closeTradeDetail}
        onEdit={editTradeFromDetail}
        onCancelTrade={cancelTradeFromDetail}
      />

      <TradeModal
        draft={draft}
        editingId={editingId}
        selectedTradeId={selectedTradeId}
        entryReasons={entryReasons}
        exitReasons={exitReasons}
        tradeDates={tradeDates}
      loadingCalendar={loadingCalendar}
      transitionRules={transitionRules}
      flowStage={flowStage}
        open={open}
        saving={saving}
        onClose={closeModal}
        onUpdateDraft={setDraft}
        onOpenSettings={openSettings}
        onSave={() => {
          if (flowStage === 'expiry') {
            void handleSave('entry');
            return;
          }
          if (flowStage === 'entry') {
            void handleSave('exit');
            return;
          }
          void handleSave('close');
        }}
        onSaveAndExit={() => void handleSave('close')}
      />
      <TradeDashboardSettingsModal open={settingsOpen} settings={tradeDashboardSettings} onClose={closeSettings} onSave={saveSettings} />
    </section>
  );
}

type TradeSide = 'CE' | 'PE';

type TradeCellState = {
  id: string;
  option: TradeSide;
  entryTime: string;
  strike: string;
  entryPrice: string;
  entryReason: string;
  exitTime: string;
  exitPrice: string;
  exitReason: string;
  pnl: string;
};

type TradeCardState = {
  id: string;
  title: string;
  legNo: number;
  createdFromLegNo: number | null;
  triggerExitReason: string;
  expanded: boolean;
  rows: TradeCellState[];
};

type SummaryCard = {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'bad' | 'pill';
  pillLabel?: string;
  editable?: boolean;
  valueOnly?: boolean;
  statusKind?: 'ema' | 'gap';
  statusClass?: string;
  statusLabel?: string;
};

function createRow(option: TradeSide): TradeCellState {
  return {
    id: uuid(),
    option,
    entryTime: '',
    strike: '',
    entryPrice: '',
    entryReason: '',
    exitTime: '',
    exitPrice: '',
    exitReason: '',
    pnl: '',
  };
}

function createTradeCard(index: number, expanded = false): TradeCardState {
  return {
    id: `leg-${index}`,
    title: `Leg ${index}`,
    legNo: index,
    createdFromLegNo: null,
    triggerExitReason: '',
    expanded,
    rows: [createRow('CE'), createRow('PE')],
  };
}

function draftLegToCard(leg: TradeLegDraft, index: number, expanded = false): TradeCardState {
  const byOption = new Map(leg.trades.map((trade) => [trade.option, trade] as const));
  return {
    id: `leg-${leg.leg_no || index + 1}`,
    title: `Leg ${leg.leg_no || index + 1}`,
    legNo: leg.leg_no || index + 1,
    createdFromLegNo: leg.created_from_leg_no ?? null,
    triggerExitReason: leg.trigger_exit_reason ?? '',
    expanded,
    rows: (['CE', 'PE'] as TradeSide[]).map((option) => {
      const trade = byOption.get(option);
      return {
        id: trade?.id || uuid(),
        option,
        entryTime: trade?.entry_time ?? '',
        strike: trade?.trade_strike?.toString() ?? '',
        entryPrice: trade?.entry_price?.toString() ?? '',
        entryReason: trade?.entry_reason ?? '',
        exitTime: trade?.exit_time ?? '',
        exitPrice: trade?.exit_price?.toString() ?? '',
        exitReason: trade?.exit_reason ?? '',
        pnl: '',
      };
    }),
  };
}

function draftToTradeCards(draft: TradeRecordDraft): TradeCardState[] {
  const legs = draft.legs.length > 0 ? draft.legs : [emptyTradeLegDraft(1)];
  return legs.map((leg, index) => draftLegToCard(leg, index, index === 0 || leg.created_from_leg_no !== null));
}

function preserveCardExpansionState(nextCards: TradeCardState[], previousCards: TradeCardState[]) {
  const previousExpansionById = new Map(previousCards.map((card) => [card.id, card.expanded] as const));
  return nextCards.map((card) => ({
    ...card,
    expanded: previousExpansionById.get(card.id) ?? card.expanded,
  }));
}

function applyAutoEntryReasonToDraft(
  draft: TradeRecordDraft,
  legIndex: number,
  tradeIndex: number,
  entryTime: string,
) {
  const leg = draft.legs[legIndex];
  const trade = leg?.trades[tradeIndex];
  if (!leg || !trade || trade.entry_reason.trim()) return draft;

  const nextEntryReason = getAutoEntryReasonForLeg(leg.leg_no, entryTime);
  if (!nextEntryReason) return draft;

  return updateTradeInLeg(draft, legIndex, tradeIndex, (currentTrade) => {
    if (currentTrade.entry_reason.trim()) return currentTrade;
    return {
      ...currentTrade,
      entry_reason: nextEntryReason,
    };
  });
}

function applyAutoEntryReasonToCard(card: TradeCardState, rowIndex: number, entryTime: string) {
  const row = card.rows[rowIndex];
  if (!row || row.entryReason.trim()) return card;

  const nextEntryReason = getAutoEntryReasonForLeg(card.legNo, entryTime);
  if (!nextEntryReason) return card;

  return {
    ...card,
    rows: card.rows.map((currentRow, index) =>
      index === rowIndex
        ? {
            ...currentRow,
            entryReason: nextEntryReason,
          }
        : currentRow,
    ),
  };
}

const LEG_ENTRY_CHAIN_START_TIME = '09:15';

function getPreviousLegExitTime<T>(legs: T[], legIndex: number, getExitTimes: (leg: T) => string[]) {
  if (legIndex <= 0) return LEG_ENTRY_CHAIN_START_TIME;

  for (let index = legIndex - 1; index >= 0; index -= 1) {
    const leg = legs[index];
    if (!leg) continue;

    const exitTimes = getExitTimes(leg)
      .map((time) => time.trim())
      .filter((time) => time)
      .sort((left, right) => left.localeCompare(right));

    if (exitTimes.length > 0) {
      return exitTimes[exitTimes.length - 1];
    }
  }

  return LEG_ENTRY_CHAIN_START_TIME;
}

function tradeCardsToDraftLegs(cards: TradeCardState[], quantity: string): TradeLegDraft[] {
  return cards.map((card) => ({
    leg_no: card.legNo,
    created_from_leg_no: card.createdFromLegNo,
    trigger_exit_reason: card.triggerExitReason,
    trades: card.rows.map((row) => ({
      id: row.id,
      option: row.option,
      trade_strike: row.strike,
      quantity,
      entry_reason: row.entryReason,
      exit_reason: row.exitReason,
      entry_time: row.entryTime,
      entry_price: row.entryPrice,
      exit_time: row.exitTime,
      exit_price: row.exitPrice,
    })),
  }));
}

function TradeEntryPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5h2v14h-2zM5 11h14v2H5z" />
    </svg>
  );
}

function TradeEntryMinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 11h14v2H5z" />
    </svg>
  );
}

function TradeEntryTrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function TradeEntryChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function formatDateTile(value: string) {
  if (!value) return '--';
  const parsed = parseDateKey(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
    .format(parsed)
    .replace(/\s+/g, '-');
}

function calculateDte(tradeDate: string, expiry: string) {
  const tradeParsed = parseDateKey(tradeDate);
  const expiryParsed = parseDateKey(expiry);
  if (!tradeParsed || !expiryParsed) return '--';
  const diff = Math.round((expiryParsed.getTime() - tradeParsed.getTime()) / 86400000);
  return String(diff);
}

function buildHeaderCards(
  draft: TradeRecordDraft,
  quantity: string,
  selectedTradeDateOption: TradeCalendarDateOption | null,
  totalPnlAmount: number | null,
): SummaryCard[] {
  const gapBadge = formatGapBadge(selectedTradeDateOption);
  const emaLabel = selectedTradeDateOption?.emaStatus ?? draft.ema_status ?? '--';

  return [
    { label: 'Trade Day', value: formatDateTile(draft.trade_date) },
    { label: 'Expiry Date', value: formatDateTile(draft.expiry) },
    { label: 'DTE', value: calculateDte(draft.trade_date, draft.expiry) },
    { label: 'Track Strike', value: draft.track_strike ? draft.track_strike : '--' },
    {
      label: 'EMA Status',
      value: emaLabel,
      valueOnly: true,
      statusKind: 'ema',
      statusClass: selectedTradeDateOption?.emaStatus ? `status-${toStatusClass(selectedTradeDateOption.emaStatus)}` : '',
      statusLabel: emaLabel,
    },
    {
      label: 'Gap Status',
      value: selectedTradeDateOption ? gapBadge.label : (draft.gap_status || '--'),
      valueOnly: true,
      statusKind: 'gap',
      statusClass: selectedTradeDateOption ? gapBadge.statusClass : '',
      statusLabel: selectedTradeDateOption ? gapBadge.label : (draft.gap_status || '--'),
    },
    { label: 'Quantity', value: quantity, editable: true },
    {
      label: 'Total P&L Amount',
      value: totalPnlAmount === null ? '--' : formatSignedCurrency(totalPnlAmount),
      tone: totalPnlAmount === null ? 'neutral' : totalPnlAmount > 0 ? 'good' : totalPnlAmount < 0 ? 'bad' : 'neutral',
    },
  ];
}

function SummaryCardView({
  card,
  quantity,
  onQuantityChange,
  onClick,
}: {
  card: SummaryCard;
  quantity: string;
  onQuantityChange: (value: string) => void;
  onClick?: () => void;
}) {
  const cardRootStyle: CSSProperties = card.statusKind
    ? { textAlign: 'center', justifyContent: 'center', alignItems: 'center' }
    : CENTERED_SUMMARY_CARD_STYLE;
  const summaryValueStyle: CSSProperties =
    card.tone === 'good' || card.tone === 'bad'
      ? { ...CENTERED_SUMMARY_VALUE_STYLE, ...getPnlTextStyle(card.tone === 'good' ? 1 : -1, true) }
      : CENTERED_SUMMARY_VALUE_STYLE;

  if (card.statusKind) {
    return (
      <div
        className={`trade-summary-card trade-summary-card--status${card.statusClass ? ` ${card.statusClass}` : ''}${onClick ? ' trade-summary-card--clickable' : ''}`}
        style={cardRootStyle}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        aria-label={`${card.label} derived from the selected trade day`}
      >
        <strong className="trade-summary-value" style={CENTERED_SUMMARY_VALUE_STYLE}>
          {card.statusLabel ?? card.value}
        </strong>
      </div>
    );
  }

  return (
    <div
      className={`trade-summary-card${card.valueOnly ? ' trade-summary-card--value-only' : ''}${onClick ? ' trade-summary-card--clickable' : ''}`}
      style={cardRootStyle}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
        : undefined
      }
    >
      {card.valueOnly ? null : (
        <span className="trade-summary-label" style={CENTERED_SUMMARY_VALUE_STYLE}>
          {card.label}
        </span>
      )}
      <div className="trade-summary-value-wrap" style={CENTERED_SUMMARY_VALUE_WRAP_STYLE}>
        {card.editable ? (
          <input
            className="trade-summary-quantity-input"
            type="text"
            inputMode="numeric"
            aria-label={card.label}
            value={quantity}
            onChange={(event) => onQuantityChange(event.target.value)}
            style={{
              textAlign: 'center',
            }}
          />
        ) : (
          <strong className="trade-summary-value" style={summaryValueStyle}>
            {card.value}
          </strong>
        )}
      </div>
    </div>
  );
}

type TradeEntryPageProps = {
  onClose?: () => void;
  onSaveAndExit?: () => void;
  saving?: boolean;
  embedded?: boolean;
  isEditingExistingTrade?: boolean;
  entryReasons: EntryReason[];
  exitReasons: ExitReason[];
  transitionRules: TradeTransitionRule[];
  tradeDates: TradeCalendarDateOption[];
  loadingCalendar: boolean;
  draft: TradeRecordDraft;
  onUpdateDraft: (updater: (current: TradeRecordDraft) => TradeRecordDraft) => void;
  onOpenSettings?: () => void;
};

function TradeEntryPage({
  onClose,
  onSaveAndExit,
  saving = false,
  embedded = false,
  isEditingExistingTrade = false,
  entryReasons,
  exitReasons,
  transitionRules,
  tradeDates,
  loadingCalendar,
  draft,
  onUpdateDraft,
  onOpenSettings,
}: TradeEntryPageProps) {
  const [quantity, setQuantity] = useState(() => draft.legs[0]?.trades[0]?.quantity ?? getRememberedTradeQuantity());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({});
  const optionSeriesStrikeCacheRef = useRef<Record<string, OptionSeriesStrikeOption[]>>({});
  const [optionSeriesStrikeRevision, setOptionSeriesStrikeRevision] = useState(0);
  const [cards, setCards] = useState<TradeCardState[]>(() => draftToTradeCards(draft));
  const totalQuantity = useMemo(() => parseNumberOrNull(quantity), [quantity]);

  const totalPnlAmount = useMemo(() => {
    const pnlValues = cards
      .flatMap((card) => card.rows)
      .map((row) => computePl(parseNumberOrNull(row.entryPrice), parseNumberOrNull(row.exitPrice), totalQuantity))
      .filter((value): value is number => value !== null);

    if (pnlValues.length === 0) return null;

    return pnlValues.reduce((sum, value) => sum + value, 0);
  }, [cards, totalQuantity]);

  function getCardTotalPnl(card: TradeCardState) {
    const values = card.rows
      .map((row) => computePl(parseNumberOrNull(row.entryPrice), parseNumberOrNull(row.exitPrice), totalQuantity))
      .filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0);
  }

  useEffect(() => {
    onUpdateDraft((current) => ({
      ...current,
      legs: tradeCardsToDraftLegs(cards, quantity),
    }));
  }, [cards, onUpdateDraft, quantity]);

  function updateTradeCard(cardId: string, updater: (current: TradeCardState) => TradeCardState) {
    setCards((currentCards) => currentCards.map((card) => (card.id === cardId ? updater(card) : card)));
  }

  function updateTradeRow(cardId: string, rowIndex: number, field: keyof TradeCellState, value: string) {
    updateTradeCard(cardId, (current) => ({
      ...current,
      rows: current.rows.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row)),
    }));
  }

  function getTimeDraftKey(cardId: string, rowIndex: number, field: 'entryTime' | 'exitTime') {
    return `${cardId}:${rowIndex}:${field}`;
  }

  function handleTimeDraftChange(cardId: string, rowIndex: number, field: 'entryTime' | 'exitTime', value: string) {
    const key = getTimeDraftKey(cardId, rowIndex, field);
    const normalized = normalizeCandleTimeInput(value);
    if (normalized !== null) {
      setTimeDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setCards((currentCards) =>
        currentCards.map((card) =>
          card.id === cardId
            ? field === 'entryTime'
              ? applyAutoEntryReasonToCard(
                  {
                    ...card,
                    rows: card.rows.map((row, index) => (index === rowIndex ? { ...row, [field]: normalized } : row)),
                  },
                  rowIndex,
                  normalized,
                )
              : {
                  ...card,
                  rows: card.rows.map((row, index) => (index === rowIndex ? { ...row, [field]: normalized } : row)),
                }
            : card,
        ),
      );
      return;
    }

    setTimeDrafts((current) => ({ ...current, [key]: value }));
  }

  function handleTimeDraftBlur(cardId: string, rowIndex: number, field: 'entryTime' | 'exitTime') {
    const key = getTimeDraftKey(cardId, rowIndex, field);
    const draftValue = timeDrafts[key];

    if (draftValue === undefined) return;

    const normalized = normalizeCandleTimeInput(draftValue);
    if (normalized !== null) {
      setCards((currentCards) =>
        currentCards.map((card) =>
          card.id === cardId
            ? field === 'entryTime'
              ? applyAutoEntryReasonToCard(
                  {
                    ...card,
                    rows: card.rows.map((row, index) => (index === rowIndex ? { ...row, [field]: normalized } : row)),
                  },
                  rowIndex,
                  normalized,
                )
              : {
                  ...card,
                  rows: card.rows.map((row, index) => (index === rowIndex ? { ...row, [field]: normalized } : row)),
                }
            : card,
        ),
      );
      setTimeDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
  }

  function getRowOptionSeriesEntryTime(row: TradeCellState) {
    return row.entryTime.trim();
  }

  function getRowOptionSeriesExitTime(row: TradeCellState) {
    const entryMinutes = parseTimeToMinutes(row.entryTime);
    const exitMinutes = parseTimeToMinutes(row.exitTime);
    if (entryMinutes === null || exitMinutes === null || exitMinutes <= entryMinutes) return '';
    return row.exitTime.trim();
  }

  function getRowOptionSeriesOptionsForTime(row: TradeCellState, time: string) {
    if (!draft.trade_date.trim() || !draft.expiry.trim() || !time) return [];
    const key = getOptionSeriesLookupKey(draft.trade_date, draft.expiry, row.option, time);
    const options = optionSeriesStrikeCacheRef.current[key] ?? [];
    const currentStrike = row.strike.trim();
    if (!currentStrike) return options;
    if (options.some((option) => option.strike === currentStrike)) return options;
    return [{ strike: currentStrike, close: null }, ...options];
  }

  function getRowEntryOptionSeriesOptions(row: TradeCellState) {
    const options = getRowOptionSeriesOptionsForTime(row, getRowOptionSeriesEntryTime(row));
    return row.strike.trim() ? getStrikeSuggestions(row.strike, options) : getStrikeSuggestions('', options);
  }

  function getRowExitOptionSeriesOptions(row: TradeCellState) {
    const options = getRowOptionSeriesOptionsForTime(row, getRowOptionSeriesExitTime(row));
    return row.strike.trim() ? getStrikeSuggestions(row.strike, options) : getStrikeSuggestions('', options);
  }

  function getSelectedOptionSeriesClose(row: TradeCellState) {
    const strikeOptions = getRowEntryOptionSeriesOptions(row);
    const selectedStrike = row.strike.trim();
    if (!selectedStrike) return null;
    return strikeOptions.find((option) => option.strike === selectedStrike)?.close ?? null;
  }

  function getExitOptionSeriesClose(row: TradeCellState) {
    const strikeOptions = getRowExitOptionSeriesOptions(row);
    const selectedStrike = row.strike.trim();
    if (!selectedStrike) return null;
    return strikeOptions.find((option) => option.strike === selectedStrike)?.close ?? null;
  }

  function handleStrikeSelect(cardId: string, rowIndex: number, strikeOption: OptionSeriesStrikeOption) {
    updateTradeRow(cardId, rowIndex, 'strike', strikeOption.strike);
    updateTradeRow(cardId, rowIndex, 'entryPrice', strikeOption.close === null ? '' : strikeOption.close.toFixed(2));
  }

  function updateExitReasonWithTransition(cardId: string, rowIndex: number, nextExitReason: string) {
    setCards((currentCards) => {
      const currentCardIndex = currentCards.findIndex((card) => card.id === cardId);
      if (currentCardIndex < 0) return currentCards;

      const currentDraft = {
        ...draft,
        legs: tradeCardsToDraftLegs(currentCards, quantity),
      };

      const updatedDraft = updateTradeInLeg(currentDraft, currentCardIndex, rowIndex, (trade) => ({
        ...trade,
        exit_reason: nextExitReason,
        exit_time: trade.exit_time,
      }));

      const matchingRule = findMatchingTransitionRule(updatedDraft.legs[currentCardIndex]?.trades[rowIndex] ?? emptyTradeEntryDraft('CE'), transitionRules);
      const nextDraft = matchingRule ? applyTransitionRuleToDraft(updatedDraft, currentCardIndex, rowIndex, matchingRule) : updatedDraft;

      return preserveCardExpansionState(draftToTradeCards(nextDraft), currentCards);
    });
  }

  function toggleTrade(cardId: string) {
    updateTradeCard(cardId, (current) => ({ ...current, expanded: !current.expanded }));
  }

  function collapseAllTrades() {
    setCards((currentCards) => currentCards.map((card) => ({ ...card, expanded: false })));
  }

  function removeTrade(cardId: string) {
    setCards((currentCards) => {
      if (currentCards.length <= 1) return currentCards;
      return currentCards.filter((card) => card.id !== cardId);
    });
  }

  function addTrade() {
    setCards((currentCards) => (currentCards.length === 0 ? [createTradeCard(1, true)] : currentCards));
  }

  useEffect(() => {
    console.log('ENTRY_DRAFT_UPDATED', draft.trade_date);
  }, [draft.trade_date]);

  useEffect(() => {
    if (isEditingExistingTrade) return;
    const tradeDate = draft.trade_date.trim();
    const expiry = draft.expiry.trim();
    if (!tradeDate || !expiry) return;

    const targets = Array.from(
      new Map(
        cards
          .flatMap((card) =>
            card.rows
              .flatMap((row) => {
                const times = [getRowOptionSeriesEntryTime(row), getRowOptionSeriesExitTime(row)].filter((time) => time);
                return times.map((time) => ({
                  key: getOptionSeriesLookupKey(tradeDate, expiry, row.option, time),
                  tradeDate,
                  expiry,
                  option: row.option,
                  time,
                }));
              }),
          )
          .map((target) => [target.key, target] as const),
      ).values(),
    );

    const pendingTargets = targets.filter((target) => optionSeriesStrikeCacheRef.current[target.key] === undefined);
    if (pendingTargets.length === 0) return;

    let active = true;

    void Promise.all(
      pendingTargets.map(async (target) => {
        const response = await readOptionSeriesStrikes(target.tradeDate, target.expiry, target.option, target.time);
        return {
          key: target.key,
          rows: response.status === 'success' ? response.rows ?? [] : [],
        };
      }),
    ).then((results) => {
      if (!active) return;

      results.forEach(({ key, rows }) => {
        optionSeriesStrikeCacheRef.current[key] = rows;
      });
      setOptionSeriesStrikeRevision((current) => current + 1);
    });

    return () => {
      active = false;
    };
  }, [cards, draft.expiry, draft.trade_date, isEditingExistingTrade, optionSeriesStrikeRevision]);

  useEffect(() => {
    const tradeDate = draft.trade_date.trim();
    const expiry = draft.expiry.trim();
    if (!tradeDate || !expiry) return;

    setCards((currentCards) => {
      let hasChanges = false;

      const nextCards = currentCards.map((card) => ({
        ...card,
        rows: card.rows.map((row) => {
          const entryTime = getRowOptionSeriesEntryTime(row);
          const entryKey = entryTime ? getOptionSeriesLookupKey(tradeDate, expiry, row.option, entryTime) : '';
          const entryOptions = entryKey ? optionSeriesStrikeCacheRef.current[entryKey] ?? [] : [];
          const selectedEntryOption =
            row.strike.trim() && entryOptions.length > 0
              ? entryOptions.find((option) => option.strike === row.strike.trim()) ?? getTopRankedStrikeOption(entryOptions)
              : getTopRankedStrikeOption(entryOptions);
          const autoFilledStrike = row.strike.trim() || selectedEntryOption?.strike || '';
          const entryClose = autoFilledStrike
            ? entryOptions.find((option) => option.strike === autoFilledStrike)?.close ?? selectedEntryOption?.close ?? null
            : null;
          const nextEntryPrice = entryClose === null ? '' : entryClose.toFixed(2);

          const exitTime = getRowOptionSeriesExitTime(row);
          const exitKey = exitTime ? getOptionSeriesLookupKey(tradeDate, expiry, row.option, exitTime) : '';
          const exitOptions = exitKey ? optionSeriesStrikeCacheRef.current[exitKey] ?? [] : [];
          const exitClose = autoFilledStrike
            ? exitOptions.find((option) => option.strike === autoFilledStrike)?.close ?? null
            : null;
          const nextExitPrice = exitClose === null ? '' : exitClose.toFixed(2);

          if (row.strike !== autoFilledStrike || row.entryPrice !== nextEntryPrice || row.exitPrice !== nextExitPrice) {
            hasChanges = true;
            return {
              ...row,
              strike: autoFilledStrike,
              entryPrice: nextEntryPrice,
              exitPrice: nextExitPrice,
            };
          }

          return row;
        }),
      }));

      return hasChanges ? nextCards : currentCards;
    });
  }, [cards, draft.expiry, draft.trade_date, optionSeriesStrikeRevision]);

  const selectedTradeDateOption = tradeDates.find((option) => option.date === draft.trade_date) ?? null;
  const headerCards = buildHeaderCards(draft, quantity, selectedTradeDateOption, totalPnlAmount);

  return (
    <main className={`trade-page-shell${embedded ? ' trade-page-shell--embedded' : ''}`}>
      <section className="trade-page">
        {embedded ? null : (
          <button className="trade-page-close" type="button" aria-label="Close page" onClick={onClose}>
            <CloseIcon />
          </button>
        )}

        <header className="trade-page-header">
          <div className="trade-summary-grid">
            {headerCards.map((card) => (
              <SummaryCardView
                key={card.label}
                card={card}
                quantity={quantity}
                onQuantityChange={setQuantity}
                onClick={card.label === 'Trade Day' ? () => setCalendarOpen(true) : undefined}
              />
            ))}
          </div>
        </header>

        <section className="trade-stack">
          {cards.map((card) => {
            const totalPnl = getCardTotalPnl(card);
            const totalPnlDisplay = totalPnl === null ? '--' : formatSignedCurrency(totalPnl);
            const legIndex = cards.findIndex((entry) => entry.id === card.id);
            const legEntryMinimumTime = getPreviousLegExitTime(cards, legIndex, (leg) => leg.rows.map((row) => row.exitTime));
            return (
              <article key={card.id} className={`trade-card${card.expanded ? ' trade-card--expanded' : ''}`}>
                <div className="trade-card-header">
                    <div className="trade-card-title-group">
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <h2 className="trade-card-title">{card.title}</h2>
                    </div>
                    <div className="trade-card-total">
                      <span>Leg P&amp;L:</span>
                      <strong style={getPnlTextStyle(totalPnl, true)}>{totalPnlDisplay}</strong>
                    </div>
                  </div>

                  <div className="trade-card-actions">
                    {card.legNo === 1 ? (
                      <button className="button secondary" type="button" onClick={collapseAllTrades}>
                        Collapse All
                      </button>
                    ) : null}
                    <button className="trade-card-toggle" type="button" onClick={() => toggleTrade(card.id)} aria-label={card.expanded ? 'Collapse leg' : 'Expand leg'}>
                      {card.expanded ? <TradeEntryMinusIcon /> : <TradeEntryPlusIcon />}
                    </button>
                    {cards.length > 1 ? (
                      <button className="trade-card-delete" type="button" onClick={() => removeTrade(card.id)} aria-label={`Delete ${card.title}`}>
                        <TradeEntryTrashIcon />
                      </button>
                    ) : null}
                  </div>
                </div>

                {card.expanded ? (
                  <div className="trade-card-body">
                    <div className="trade-table-shell">
                      <table className="trade-entry-table">
                        <colgroup>
                          <col className="option-col" />
                          <col className="entry-time-col" />
                          <col className="strike-col" />
                          <col className="entry-price-col" />
                          <col className="entry-reason-col" />
                          <col className="exit-time-col" />
                          <col className="exit-price-col" />
                          <col className="exit-reason-col" />
                          <col className="pnl-col" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th rowSpan={2} className="trade-entry-option-head">
                              Option
                            </th>
                            <th colSpan={4}>Entry</th>
                            <th colSpan={4}>Exit</th>
                          </tr>
                          <tr>
                            <th>Entry Time</th>
                            <th>Strike</th>
                            <th>Entry Price</th>
                            <th>Entry Reason</th>
                            <th>Exit Time</th>
                            <th>Exit Price</th>
                            <th>Exit Reason</th>
                            <th>P&amp;L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {card.rows.map((row, rowIndex) => {
                            const rowPnl = computeRowPnl(row.entryPrice, row.exitPrice, quantity);

                            return (
                              <tr key={row.id}>
                                <td className="trade-option-cell">
                                  <TradeOptionValue option={row.option} />
                                </td>
                                <td>
                                  <TimeInputField
                                    inputClassName="trade-input"
                                    value={timeDrafts[getTimeDraftKey(card.id, rowIndex, 'entryTime')] ?? row.entryTime}
                                    minimumValue={legEntryMinimumTime}
                                    minimumInclusive
                                    onChange={(nextValue) => handleTimeDraftChange(card.id, rowIndex, 'entryTime', nextValue)}
                                    onBlur={() => handleTimeDraftBlur(card.id, rowIndex, 'entryTime')}
                                  />
                                </td>
                                <td>
                                  {getRowEntryOptionSeriesOptions(row).length > 0 ? (
                                    <StrikeInputField
                                      inputClassName="trade-input"
                                      value={row.strike}
                                      options={getRowEntryOptionSeriesOptions(row)}
                                      ariaLabel={`${card.title} ${row.option} strike`}
                                      placeholder="Select strike"
                                      onChange={(nextValue) => updateTradeRow(card.id, rowIndex, 'strike', nextValue)}
                                      onSelectOption={(strikeOption) => handleStrikeSelect(card.id, rowIndex, strikeOption)}
                                      onBlur={() => {
                                        const selectedStrike = row.strike.trim();
                                        if (!selectedStrike) return;
                                        const strikeOption = getRowEntryOptionSeriesOptions(row).find((option) => option.strike === selectedStrike);
                                        if (strikeOption) {
                                          handleStrikeSelect(card.id, rowIndex, strikeOption);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <input
                                      className="trade-input"
                                      type="text"
                                      value={row.strike}
                                      onChange={(event) => updateTradeRow(card.id, rowIndex, 'strike', event.target.value)}
                                    />
                                  )}
                                </td>
                                <td>
                                  <input className="trade-input" type="text" value={row.entryPrice} onChange={(event) => updateTradeRow(card.id, rowIndex, 'entryPrice', event.target.value)} />
                                </td>
                                <td>
                                  <div className="trade-select-shell">
                                    <select className="trade-select" value={row.entryReason} onChange={(event) => updateTradeRow(card.id, rowIndex, 'entryReason', event.target.value)}>
                                      <option value="">Select entry reason</option>
                                      {getEntryReasonOptions(entryReasons, row.entryReason).map((reason) => (
                                        <option key={reason.id} value={reason.name}>
                                          {reason.name}
                                        </option>
                                      ))}
                                    </select>
                                    <TradeEntryChevronDownIcon />
                                  </div>
                                </td>
                                <td>
                                  <TimeInputField
                                    inputClassName="trade-input"
                                    value={timeDrafts[getTimeDraftKey(card.id, rowIndex, 'exitTime')] ?? row.exitTime}
                                    minimumValue={timeDrafts[getTimeDraftKey(card.id, rowIndex, 'entryTime')] ?? row.entryTime}
                                    onChange={(nextValue) => handleTimeDraftChange(card.id, rowIndex, 'exitTime', nextValue)}
                                    onBlur={() => handleTimeDraftBlur(card.id, rowIndex, 'exitTime')}
                                  />
                                </td>
                                <td>
                                  <input className="trade-input" type="text" value={row.exitPrice} onChange={(event) => updateTradeRow(card.id, rowIndex, 'exitPrice', event.target.value)} />
                                </td>
                                <td>
                                  <div className="trade-select-shell trade-select-shell--muted">
                                    <select
                                      className="trade-select"
                                      value={row.exitReason}
                                      onChange={(event) => updateExitReasonWithTransition(card.id, rowIndex, event.target.value)}
                                    >
                                      <option value="">Select exit reason</option>
                                      {getExitReasonOptions(exitReasons, row.exitReason).map((reason) => (
                                        <option key={reason.id} value={reason.name}>
                                          {reason.name}
                                        </option>
                                      ))}
                                    </select>
                                    <TradeEntryChevronDownIcon />
                                  </div>
                                </td>
                                <td>
                                  <input
                                  className="trade-input trade-input--pnl"
                                  type="text"
                                  readOnly
                                  value={rowPnl === null ? '' : formatSignedCurrency(rowPnl)}
                                  aria-label={`${card.title} ${row.option} P and L`}
                                  style={{
                                    paddingLeft: '14px',
                                    paddingRight: '14px',
                                    fontSize: '13.5px',
                                    fontWeight: getPnlTone(rowPnl) === 'neutral' ? 400 : 700,
                                    letterSpacing: '0.01em',
                                    color: getPnlColor(rowPnl),
                                  }}
                                />
                              </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <footer className="trade-page-footer">
          <div className="trade-page-footer-line" />
          <div className="trade-page-footer-actions">
            <button className="trade-button trade-button--ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="trade-button trade-button--primary" type="button" onClick={onSaveAndExit} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Exit'}
            </button>
          </div>
        </footer>
      </section>

      <TradeDateCalendar
        open={calendarOpen}
        mode="modal"
        selectionMode="deferred"
        loadingCalendar={loadingCalendar}
        tradeDates={tradeDates}
        draft={draft}
        onUpdateDraft={onUpdateDraft}
        onClose={() => setCalendarOpen(false)}
        onSaveDate={(nextDraft, selectedDateOption) => {
          onUpdateDraft((current) => ({
            ...current,
            trade_date: nextDraft.trade_date,
            expiry: nextDraft.expiry,
            track_strike: nextDraft.track_strike,
            gap_status: nextDraft.gap_status,
            ema_status: nextDraft.ema_status,
          }));
          setCalendarOpen(false);
        }}
        onOpenSettings={onOpenSettings}
      />
    </main>
  );
}
