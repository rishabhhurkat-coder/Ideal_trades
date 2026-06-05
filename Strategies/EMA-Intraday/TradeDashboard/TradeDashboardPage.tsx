import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchEntryReasons, fetchExitReasons, fetchTradeTransitionRules } from '../Masters/mastersService';
import type { EntryReason, ExitReason, TradeTransitionRule } from '../Masters/masters';
import {
  deleteTradeEntry,
  emptyTradeDraft,
  emptyTradeEntry,
  emptyTradeLeg,
  fetchTradeCalendar,
  loadTradeRecords,
  rememberTradeQuantity,
  saveTradeRecord,
  type TradeCalendarDateOption,
  type TradeEntryDraft,
  type TradeEntryRecord,
  type TradeLegDraft,
  type TradeOption,
  type TradeRecord,
  type TradeRecordDraft,
} from './tradeDashboard';

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
  | 'expiry'
  | 'trackStrike'
  | 'legNo'
  | 'option'
  | 'tradeStrike'
  | 'entryReason'
  | 'entryTime'
  | 'entryPrice'
  | 'exitReason'
  | 'exitTime'
  | 'exitPrice'
  | 'qty'
  | 'pl'
  | 'ddPl'
  | 'plAmt'
  | 'ddAmt';

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
  'expiry',
  'trackStrike',
  'legNo',
  'option',
  'tradeStrike',
  'entryReason',
  'entryTime',
  'entryPrice',
  'exitReason',
  'exitTime',
  'exitPrice',
  'qty',
  'pl',
  'ddPl',
  'plAmt',
  'ddAmt',
];

const DASHBOARD_TILE_KEYS: DashboardPreset[] = ['all', 'today', 'week', 'month', 'profitable', 'losing', 'maxDd', 'custom'];
const TRADE_DTE_OPTIONS = [0, 1, 2, 3, 4, 5];
const TRADE_EMA_PROXIMITY_OPTIONS = [50, 100, 150, 200, 250, 300, 400, 500];
const TRADE_GAP_OPTIONS = [0, 25, 50, 75, 100, 125, 150, 175, 200];
const DEFAULT_TRADE_DASHBOARD_SETTINGS: TradeDashboardSettings = {
  allowedDte: [0, 1],
  emaProximity: [100],
  gapValues: [],
};

function createEmptyColumnFilters(): ColumnFilterMap {
  return DASHBOARD_COLUMN_KEYS.reduce((accumulator, key) => {
    accumulator[key] = [];
    return accumulator;
  }, {} as ColumnFilterMap);
}

function formatCurrency(value: number) {
  return `₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedCurrency(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}${formatCurrency(value)}`;
}

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
            <h2 id="trade-dashboard-settings-title">Trade Dashboard Settings</h2>
          </div>
          <button className="button secondary trade-settings-close" type="button" onClick={onClose} aria-label="Close settings">
            ✕
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

const TIME_DATALIST_ID = 'trade-time-options';
const EOD_EXIT_TIME = '15:30';
const TIME_OPTIONS = Array.from({ length: ((15 * 60 + 30) - (9 * 60 + 18)) / 3 + 1 }, (_, index) => {
  const totalMinutes = 9 * 60 + 18 + index * 3;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const label = `${hour}.${String(minute).padStart(2, '0')}`;
  return { value, label };
});

function oppositeOption(option: TradeOption): TradeOption {
  return option === 'CE' ? 'PE' : 'CE';
}

function formatPrice(value: number | null) {
  return value === null ? '-' : value.toFixed(2);
}

function formatTimeDisplay(value: string) {
  if (!value) return '-' ;
  const [hour, minute] = value.split(':');
  if (!hour || !minute) return value;
  return `${String(Number(hour))}.${minute}`;
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
  if (!dateKey) return 'Select a trade date';
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
  return `${weekday}, ${formattedDate}`;
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
const GAP_STATUS_OPTIONS = ['Gap Up', 'Gap Down', 'No Gap'];
const EMA_STATUS_OPTIONS = ['Far EMA', 'Near EMA'];

function toStatusClass(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
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

function createTransitionTrade(option: TradeOption, entryReason: string | null) {
  return {
    ...emptyTradeEntry(option),
    entry_reason: entryReason ?? '',
  };
}

function applyTransitionRuleToDraft(
  draft: TradeRecordDraft,
  legIndex: number,
  rule: TradeTransitionRule,
) {
  const currentLeg = draft.legs[legIndex];
  if (!currentLeg) return draft;

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

        const nextExitReason = exitReasonFor(trade.option);
        const nextExitTime = isEodExitReason(nextExitReason) ? EOD_EXIT_TIME : trade.exit_time;

        return {
          ...trade,
          exit_reason: nextExitReason,
          exit_time: nextExitTime,
        };
      }),
    };
  });

  const updatedCurrentLeg = updatedLegs[legIndex];
  const nextLegNo = currentLeg.leg_no + 1;
  const existingNextLegIndex = updatedLegs.findIndex((leg) => leg.leg_no === nextLegNo);

  if (!rule.create_new_leg || !rule.new_leg_option) {
    return {
      ...draft,
      legs: updatedLegs,
    };
  }

  if (!updatedCurrentLeg || !isLegComplete(updatedCurrentLeg)) {
    return {
      ...draft,
      legs: updatedLegs,
    };
  }

  if (existingNextLegIndex >= 0) {
    return {
      ...draft,
      legs: updatedLegs,
    };
  }

  const nextLegs = updatedLegs.map((leg) =>
    leg.leg_no >= nextLegNo
      ? {
          ...leg,
          leg_no: leg.leg_no + 1,
        }
      : leg,
  );

  const nextLeg: TradeLegDraft = {
    leg_no: nextLegNo,
    trades: [createTransitionTrade(rule.new_leg_option, rule.entry_reason)],
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
            trades: leg.trades.map((trade) => ({
              id: trade.id,
              option: trade.option,
              trade_strike: trade.trade_strike?.toString() ?? '',
              quantity: trade.quantity?.toString() ?? '75',
              entry_reason: trade.entry_reason,
              exit_reason: trade.exit_reason,
              entry_time: trade.entry_time,
              entry_price: trade.entry_price?.toString() ?? '',
              exit_time: isEodExitReason(trade.exit_reason) && !trade.exit_time ? EOD_EXIT_TIME : trade.exit_time,
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
  const sortedForMetrics = [...rows].sort((left, right) => {
    const leftDate = new Date(`${left.tradeDate}T00:00:00`).getTime();
    const rightDate = new Date(`${right.tradeDate}T00:00:00`).getTime();
    if (leftDate !== rightDate) return leftDate - rightDate;

    const leftCreatedAt = new Date(left.record.created_at).getTime();
    const rightCreatedAt = new Date(right.record.created_at).getTime();
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;

    if (left.legNo !== right.legNo) return left.legNo - right.legNo;

    if (left.tradeIndex !== right.tradeIndex) return left.tradeIndex - right.tradeIndex;

    return left.tradeId.localeCompare(right.tradeId);
  });

  let cumulativePl = 0;
  let cumulativeLossPoints = 0;
  let cumulativeLossAmount = 0;
  const metricsById = new Map<
    string,
    {
      qtyDisplay: number;
      plPoints: number;
      ddPoints: number;
      plAmount: number;
      ddAmount: number;
    }
  >();

  sortedForMetrics.forEach((row) => {
    const plPoints = row.pl ?? 0;
    const qtyDisplay = Math.max(1, row.trade.quantity ?? 1);
    const plAmount = Number((plPoints * qtyDisplay).toFixed(2));

    cumulativePl += plPoints;
    if (plPoints < 0) {
      cumulativeLossPoints += plPoints;
      cumulativeLossAmount += plAmount;
    }
    const ddPoints = Number(cumulativeLossPoints.toFixed(2));
    const ddAmount = Number(cumulativeLossAmount.toFixed(2));

    metricsById.set(row.tradeId, {
      qtyDisplay,
      plPoints,
      ddPoints,
      plAmount,
      ddAmount,
    });
  });

  return sortTradeRowsForDashboard(rows).map((row) => {
    const metrics = metricsById.get(row.tradeId) ?? {
      qtyDisplay: Math.max(1, row.trade.quantity ?? 1),
      plPoints: row.pl ?? 0,
      ddPoints: 0,
      plAmount: Number(((row.pl ?? 0) * Math.max(1, row.trade.quantity ?? 1)).toFixed(2)),
      ddAmount: 0,
    };

    return {
      ...row,
      ...metrics,
    };
  });
}

function getDashboardValue(row: DashboardRow, key: DashboardColumnKey) {
  switch (key) {
    case 'expiry':
      return row.expiry || '-';
    case 'trackStrike':
      return row.trackStrike === null ? '-' : String(row.trackStrike);
    case 'legNo':
      return String(row.legNo);
    case 'option':
      return row.option;
    case 'tradeStrike':
      return row.tradeStrike === null ? '-' : String(row.tradeStrike);
    case 'entryReason':
      return row.entryReason || '-';
    case 'entryTime':
      return row.entryTime || '-';
    case 'entryPrice':
      return formatPrice(row.entryPrice);
    case 'exitReason':
      return row.exitReason || '-';
    case 'exitTime':
      return row.exitTime || '-';
    case 'exitPrice':
      return formatPrice(row.exitPrice);
    case 'qty':
      return String(row.qtyDisplay);
    case 'pl':
      return formatDashboardNumber(row.plPoints);
    case 'ddPl':
      return formatDashboardNumber(row.ddPoints);
    case 'plAmt':
      return formatDashboardNumber(row.plAmount);
    case 'ddAmt':
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
        ? nextLegs.map((leg, index) => ({
            ...leg,
            leg_no: index + 1,
          }))
        : [createLegDraft(1)],
  };
}

function TradeModal({
  draft,
  editingId,
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
  onBackToEntry,
  onOpenSettings,
}: {
  draft: TradeRecordDraft;
  editingId: string | null;
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
  onBackToEntry: () => void;
  onOpenSettings: () => void;
}) {
  const [activeLegIndex, setActiveLegIndex] = useState(0);
  const tradeCalendarMonths = useMemo(() => buildTradeDateCalendar(tradeDates), [tradeDates]);
  const [visibleTradeMonthIndex, setVisibleTradeMonthIndex] = useState(0);
  const [calendarView, setCalendarView] = useState<'dates' | 'months' | 'years'>('dates');

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
    const selectedMonthKey = selectedTradeDate ? toCalendarDateKey(getMonthStart(selectedTradeDate)).slice(0, 7) : tradeCalendarMonths[0]?.monthKey ?? '';
    const selectedMonthIndex = tradeCalendarMonths.findIndex((month) => month.monthKey === selectedMonthKey);

    setVisibleTradeMonthIndex(selectedMonthIndex >= 0 ? selectedMonthIndex : 0);
  }, [draft.trade_date, open, tradeCalendarMonths]);

  if (!open) return null;

  const activeLeg = draft.legs[activeLegIndex] ?? draft.legs[0];
  const activeTradeCount = activeLeg?.trades.length ?? 0;
  const isExpiryStage = flowStage === 'expiry';
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

  function updateTradeWithOptionalRule(
    legIndex: number,
    tradeIndex: number,
    updater: (currentTrade: TradeEntryDraft) => TradeEntryDraft,
  ) {
    onUpdateDraft((current) => updateTradeInLeg(current, legIndex, tradeIndex, updater));
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

  return (
    <div className={`trade-modal-backdrop${isExpiryStage ? ' trade-modal-backdrop--expiry' : ''}`} role="presentation" onClick={onClose}>
      <div
        className={`trade-modal${isExpiryStage ? ' trade-modal--expiry' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Add trade"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="trade-modal-topbar">
          <button className="button secondary trade-modal-close" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="trade-modal-body">
          {isExpiryStage ? (
            <section className="trade-form-section trade-setup-section">
              <div className="trade-setup-heading" style={{ justifyContent: 'space-between', gap: '16px' }}>
                <div className="trade-setup-brand">
                  <div className="trade-setup-icon">
                    <ExpiryHeaderIcon />
                  </div>
                  <h4>Trade Date Calendar</h4>
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
                        ‹
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
                        ›
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
                            â€¹
                          </button>
                          <strong>{visibleTradeYear}</strong>
                          <button type="button" className="button secondary trade-date-icon-button" onClick={() => moveCalendarYear(1)} aria-label="Next year">
                            â€º
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
                            ‹
                          </button>
                          <strong>{visibleTradeYear}</strong>
                          <button type="button" className="button secondary trade-date-icon-button" onClick={() => moveCalendarYear(1)} aria-label="Next year">
                            ›
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
                          <span>{visibleTradeMonth?.label ?? 'Trade Date Calendar'}</span>
                          <span aria-hidden="true">▼</span>
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
                                    }));
                                  }}
                                >
                                  {day.dayLabel}
                                </button>
                              );
                            })
                          ) : (
                            <div className="trade-date-calendar-empty">{loadingCalendar ? 'Loading trade dates...' : 'No trade dates available'}</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="trade-date-legend">
                      <span><i className="trade-date-swatch available" /> Applicable (Eligible to Select)</span>
                      <span><i className="trade-date-swatch unavailable" /> Not Applicable</span>
                      <span><i className="trade-date-swatch today" /> Today</span>
                    </div>
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
                    <span>Strike</span>
                    <input
                      className="trade-theme-control"
                      type="number"
                      step="0.05"
                      placeholder="Enter strike"
                      value={draft.track_strike}
                      disabled={isExitStage || !draft.trade_date}
                      onChange={(event) => onUpdateDraft((current) => ({ ...current, track_strike: event.target.value }))}
                    />
                  </label>
                  <label className="trade-setup-field">
                    <span>GAP Status</span>
                    <select
                      className={`trade-theme-control trade-status-control${draft.gap_status ? ` status-${toStatusClass(draft.gap_status)}` : ''}`}
                      value={draft.gap_status}
                      onChange={(event) => onUpdateDraft((current) => ({ ...current, gap_status: event.target.value }))}
                    >
                      <option value="">Select gap status</option>
                      {GAP_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="trade-setup-field">
                    <span>EMA Status</span>
                    <select
                      className={`trade-theme-control trade-status-control${draft.ema_status ? ` status-${toStatusClass(draft.ema_status)}` : ''}`}
                      value={draft.ema_status}
                      onChange={(event) => onUpdateDraft((current) => ({ ...current, ema_status: event.target.value }))}
                    >
                      <option value="">Select EMA status</option>
                      {EMA_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </section>
          ) : null}

          {!isExpiryStage ? (
            <section className="trade-workspace">
              <div className="trade-leg-toolbar">
                <div className="trade-leg-toolbar-heading">
                  <strong>Legs</strong>
                  <span>{draft.legs.length}</span>
                </div>
                <div className="trade-leg-toolbar-actions">
                  {!isExpiryStage && activeLegIndex === 0 && activeLeg?.trades.length < 2 ? (
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
                                <span>Trade Strike</span>
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
                                  {entryReasons.map((reason) => (
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
                                <input
                                  type="text"
                                  list={TIME_DATALIST_ID}
                                  inputMode="numeric"
                                  placeholder="09:18"
                                  value={trade.entry_time}
                                  onChange={(event) =>
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      entry_time: event.target.value,
                                    }))
                                  }
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
                                  onChange={(event) =>
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      exit_reason: event.target.value,
                                      exit_time: isEodExitReason(event.target.value)
                                        ? EOD_EXIT_TIME
                                        : currentTrade.exit_time === EOD_EXIT_TIME
                                          ? ''
                                          : currentTrade.exit_time,
                                    }))
                                  }
                                >
                                  <option value="">Select exit reason</option>
                                  {exitReasons.map((reason) => (
                                    <option key={reason.id} value={reason.name}>
                                      {reason.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Exit Time</span>
                                <input
                                  type="text"
                                  list={TIME_DATALIST_ID}
                                  inputMode="numeric"
                                  placeholder="09:18"
                                  value={trade.exit_time}
                                  disabled={!hasCompleteEntryDraft(trade) && !isExitStage}
                                  readOnly={isEodExitReason(trade.exit_reason)}
                                  onChange={(event) =>
                                    updateTradeWithOptionalRule(activeLegIndex, tradeIndex, (currentTrade) => ({
                                      ...currentTrade,
                                      exit_time: event.target.value,
                                    }))
                                  }
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
                                <span>
                                  {matchingRule.trigger_option} / {matchingRule.exit_reason}
                                  {matchingRule.create_new_leg && matchingRule.new_leg_option
                                    ? ` opens ${matchingRule.new_leg_option} with ${matchingRule.entry_reason ?? 'no entry reason'}`
                                    : ' closes the current leg without opening a new one'}
                                </span>
                              </div>
                              <button
                                className="button secondary"
                                type="button"
                                onClick={() => {
                                  onUpdateDraft((current) => applyTransitionRuleToDraft(current, activeLegIndex, matchingRule));
                                }}
                              >
                                Check Rule
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

        <div className="trade-modal-footer">
          <button className="button secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {isExpiryStage ? (
            <button
              className="button primary"
              type="button"
              onClick={onSave}
              disabled={saving || !isSetupReady}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          ) : isEntryStage ? (
            <>
              <button className="button secondary" type="button" onClick={onBackToEntry} disabled={saving}>
                Back to Expiry
              </button>
              <button
                className="button primary"
                type="button"
                onClick={onSaveAndExit}
                disabled={saving || !draft.trade_date || !draft.legs.some((leg) => leg.trades.some(hasCompleteEntryDraft))}
              >
                {saving ? 'Saving...' : 'Save & Exit'}
              </button>
            </>
          ) : (
            <>
              <button className="button secondary" type="button" onClick={onBackToEntry} disabled={saving}>
                Back to Entry
              </button>
              <button
                className="button primary"
                type="button"
                onClick={onSave}
                disabled={saving || !draft.trade_date || !draft.legs.some((leg) => leg.trades.some(hasCompleteExitDraft))}
              >
                {saving ? 'Saving...' : 'Save Exit'}
              </button>
            </>
          )}
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
        aria-label="Trade summary"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="trade-modal-topbar trade-detail-topbar">
          <div className="trade-detail-title">
            <span>Trade Summary</span>
            <strong>
              {row.tradeDate} · Leg {row.legNo} · {row.option}
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
                <span>Trade Date</span>
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
                <span>Leg / Trade Count</span>
                <strong>
                  {tradeDayCount} legs · {tradeCount} trades
                </strong>
              </article>
            </div>

            <div className="trade-detail-grid">
              <div className="trade-detail-field">
                <span>Option</span>
                <strong>{row.option}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Trade Strike</span>
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
                <strong className={row.pl !== null && row.pl >= 0 ? 'trade-positive' : 'trade-negative'}>{formatDashboardNumber(row.pl)}</strong>
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
      <div className="trade-detail-modal trade-modal" role="dialog" aria-modal="true" aria-label="Trade summary" onClick={(event) => event.stopPropagation()}>
        <div className="trade-modal-topbar trade-detail-topbar">
          <div className="trade-detail-title">
            <span>Trade Summary</span>
            <strong>
              {row.tradeDate} · Leg {row.legNo} · {row.option}
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
              <span>Read-only summary of the selected trade</span>
            </div>

            <div className="trade-detail-summary-grid">
              <article className="trade-detail-summary-card">
                <span>Trade Date</span>
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
                <span>Leg / Trade Count</span>
                <strong>
                  {tradeDayCount} legs · {tradeCount} trades
                </strong>
              </article>
            </div>

            <div className="trade-detail-grid">
              <div className="trade-detail-field">
                <span>Option</span>
                <strong>{row.option}</strong>
              </div>
              <div className="trade-detail-field">
                <span>Trade Strike</span>
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

export function TradeDashboardPage() {
  const [records, setRecords] = useState<TradeRecord[]>([]);
  const [entryReasons, setEntryReasons] = useState<EntryReason[]>([]);
  const [exitReasons, setExitReasons] = useState<ExitReason[]>([]);  const [tradeDates, setTradeDates] = useState<TradeCalendarDateOption[]>([]);
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

  useEffect(() => {    void Promise.all([fetchEntryReasons(), fetchExitReasons(), fetchTradeTransitionRules()])
      .then(([entryRows, exitRows, transitionRows]) => {
        setEntryReasons(entryRows.filter((reason) => reason.is_active));
        setExitReasons(exitRows.filter((reason) => reason.is_active));
        setTransitionRules(transitionRows.filter((rule) => rule.is_active));
      })
      .catch(() => {
        setEntryReasons([]);
        setExitReasons([]);
        setTransitionRules([]);
      });
  }, []);

  useEffect(() => {    if (!open) {
      setTradeDates([]);
      setLoadingCalendar(false);
      return;
    }

    let active = true;
    setLoadingCalendar(true);

    const timer = window.setTimeout(() => {      void fetchTradeCalendar()
        .then((calendar) => {
          if (!active) return;
          setTradeDates(calendar.dates ?? []);
        })
        .catch(() => {
          if (!active) return;
          setTradeDates([]);
        })
        .finally(() => {
          if (active) setLoadingCalendar(false);
        });
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open]);
  const tradeRows = useMemo(() => flattenTradeRows(records), [records]);
  const dashboardRows = useMemo(() => buildDashboardRows(tradeRows), [tradeRows]);
  const [activePreset, setActivePreset] = useState<DashboardPreset>('all');
  const [openFilterColumn, setOpenFilterColumn] = useState<DashboardColumnKey | null>(null);
  const [appliedColumnFilters, setAppliedColumnFilters] = useState<ColumnFilterMap>(() => createEmptyColumnFilters());
  const [draftColumnFilters, setDraftColumnFilters] = useState<ColumnFilterMap>(() => createEmptyColumnFilters());
  const [filterSearch, setFilterSearch] = useState('');
  const expiryFilterAutoOpenedRef = useRef(false);

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
    if (expiryFilterAutoOpenedRef.current || dashboardRows.length === 0) return;
    setOpenFilterColumn('expiry');
    setDraftColumnFilters((current) => ({
      ...current,
      expiry: allColumnValues.expiry,
    }));
    expiryFilterAutoOpenedRef.current = true;
  }, [allColumnValues.expiry, dashboardRows.length]);

  useEffect(() => {
    if (!openFilterColumn) {
      setFilterSearch('');
      return;
    }

    setFilterSearch('');
    setDraftColumnFilters((current) => ({
      ...current,
      [openFilterColumn]: appliedColumnFilters[openFilterColumn].length > 0 ? [...appliedColumnFilters[openFilterColumn]] : allColumnValues[openFilterColumn],
    }));
  }, [allColumnValues, appliedColumnFilters, openFilterColumn]);

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

  function getActiveColumnSelection(column: DashboardColumnKey) {
    return appliedColumnFilters[column].length > 0 ? appliedColumnFilters[column] : allColumnValues[column];
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
    setFlowStage('exit');
    setDraft(toDraftFromRecord(record));
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setSelectedTradeId(null);
    setFlowStage('expiry');
    setDraft(emptyTradeDraft());
  }

  function openTradeDetail(row: DashboardRow) {
    setDetailRow(row);
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
      if (nextStage === 'entry') {
        setFlowStage('entry');
        setSelectedTradeId(savedRecord.legs[0]?.trades[0]?.id ?? null);
      } else if (nextStage === 'exit') {
        const nextLeg = savedRecord.legs[savedRecord.legs.length - 1] ?? savedRecord.legs[0] ?? null;
        const nextLegTradeId = nextLeg?.trades[0]?.id ?? null;
        if (savedRecord.legs.length > 1 && nextLegTradeId) {
          setFlowStage('entry');
          setSelectedTradeId(nextLegTradeId);
        } else {
          setFlowStage('exit');
          setSelectedTradeId(savedRecord.legs[0]?.trades[0]?.id ?? null);
        }
      } else {
        closeModal();
      }
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Unable to save trade day.');
    } finally {
      setSaving(false);
    }
  }

  function backToEntry() {
    setFlowStage('entry');
  }

  function backToExpiry() {
    setFlowStage('expiry');
  }

  function renderFilterHeader(column: DashboardColumnKey, label: string) {
    const isOpen = openFilterColumn === column;
    const values = allColumnValues[column];
    const search = filterSearch.trim().toLowerCase();
    const selectedValues = draftColumnFilters[column] ?? [];
    const visibleValues = values.filter((value) => value.toLowerCase().includes(search));
    const allVisibleSelected = visibleValues.length > 0 && visibleValues.every((value) => selectedValues.includes(value));
    const someVisibleSelected = visibleValues.some((value) => selectedValues.includes(value));

    return (
      <th key={column} className={`trade-table-header trade-table-header--${column}`}>
        <div className="trade-table-header-copy">
          <span>{label}</span>
          <button
            className={`trade-table-filter-button${appliedColumnFilters[column].length > 0 ? ' active' : ''}`}
            type="button"
            aria-label={`Filter ${label}`}
            onClick={() => {
              setOpenFilterColumn((current) => (current === column ? null : column));
              setFilterSearch('');
            }}
          >
            <FilterIcon />
          </button>
        </div>

        {isOpen ? (
          <div className="trade-column-filter-popover">
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
          </div>
        ) : null}
      </th>
    );
  }

  return (
    <section className="trade-dashboard">
      <section className="trade-log-card">
        <div className="trade-log-card-heading">
          <h3>Trade Log</h3>
          <button className="button primary trade-add-day-button" type="button" onClick={beginAddTradeDay}>
            <span>+Trade</span>
          </button>
        </div>

        {error ? <div className="alert trade-alert">{error}</div> : null}

        <div className="trade-table-shell">
          <table className="trade-data-table">
            <thead>
              <tr>
                {renderFilterHeader('expiry', 'Expiry')}
                {renderFilterHeader('trackStrike', 'Track Strike')}
                {renderFilterHeader('legNo', 'Leg No')}
                {renderFilterHeader('option', 'Option')}
                {renderFilterHeader('tradeStrike', 'Trade Strike')}
                {renderFilterHeader('entryReason', 'Entry Reason')}
                {renderFilterHeader('entryTime', 'Entry Time')}
                {renderFilterHeader('entryPrice', 'Entry Price')}
                {renderFilterHeader('exitReason', 'Exit Reason')}
                {renderFilterHeader('exitTime', 'Exit Time')}
                {renderFilterHeader('exitPrice', 'Exit Price')}
                {renderFilterHeader('qty', 'Qty')}
                {renderFilterHeader('pl', 'PL')}
                {renderFilterHeader('ddPl', 'DD PL')}
                {renderFilterHeader('plAmt', 'PL Amt')}
                {renderFilterHeader('ddAmt', 'DD Amt')}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={16}>
                    No trades match the current filters.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr
                    key={row.tradeId}
                    className="trade-log-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => openTradeDetail(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openTradeDetail(row);
                      }
                    }}
                    title="Open trade summary"
                  >
                    <td>{row.expiry}</td>
                    <td className="trade-table-emphasis">{row.trackStrike ?? '-'}</td>
                    <td>{row.legNo}</td>
                    <td>{row.option}</td>
                    <td className="trade-table-emphasis">{row.tradeStrike ?? '-'}</td>
                    <td>{row.entryReason || '-'}</td>
                    <td>{row.entryTime || '-'}</td>
                    <td>{formatPrice(row.entryPrice)}</td>
                    <td>{row.exitReason || '-'}</td>
                    <td>{row.exitTime || '-'}</td>
                    <td>{formatPrice(row.exitPrice)}</td>
                    <td>{row.qtyDisplay}</td>
                    <td className={row.plPoints >= 0 ? 'trade-positive' : 'trade-negative'}>{formatDashboardNumber(row.plPoints)}</td>
                    <td className={row.ddPoints < 0 ? 'trade-dd' : ''}>{formatDashboardNumber(row.ddPoints)}</td>
                    <td className={row.plAmount >= 0 ? 'trade-positive' : 'trade-negative'}>{formatSignedCurrency(row.plAmount)}</td>
                    <td className="trade-negative">{formatSignedCurrency(row.ddAmount)}</td>
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
        onSaveAndExit={() => void handleSave('exit')}
        onBackToEntry={flowStage === 'exit' ? backToEntry : backToExpiry}
      />
      <TradeDashboardSettingsModal open={settingsOpen} settings={tradeDashboardSettings} onClose={closeSettings} onSave={saveSettings} />
      <datalist id={TIME_DATALIST_ID}>
        {TIME_OPTIONS.map((timeOption) => (
          <option key={timeOption.value} value={timeOption.value}>
            {timeOption.label}
          </option>
        ))}
      </datalist>
    </section>
  );
}

