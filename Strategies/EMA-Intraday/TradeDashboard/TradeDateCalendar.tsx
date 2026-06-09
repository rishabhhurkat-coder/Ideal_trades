import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { TradeCalendarDateOption, TradeRecordDraft } from './EMAIntradayTradePage';

type TradeDateCalendarProps = {
  open: boolean;
  loadingCalendar: boolean;
  tradeDates: TradeCalendarDateOption[];
  draft: TradeRecordDraft;
  onUpdateDraft: (updater: (current: TradeRecordDraft) => TradeRecordDraft) => void;
  onClose: () => void;
  onOpenSettings?: () => void;
  onSaveDate?: (nextDraft: TradeRecordDraft, selectedDateOption: TradeCalendarDateOption | null) => void;
  mode?: 'embedded' | 'modal';
  selectionMode?: 'instant' | 'deferred';
  disableDateSelection?: boolean;
};

function getTradePerfTimeline() {
  return window as Window & {
    __emaTradePerf?: {
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
      sourceTrace?: unknown;
      modalVisibleAt?: number;
    };
  };
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

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.89 1h-3.78a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L1.71 7.48a.5.5 0 0 0 .12.64L3.86 9.7c-.04.31-.06.63-.06.94s.02.63.06.94L1.83 13.16a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.51.4 1.06.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.78a.5.5 0 0 0 .49-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.25A3.25 3.25 0 1 1 12 8.75a3.25 3.25 0 0 1 0 6.5Z" />
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

const CALENDAR_WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CALENDAR_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatIndianNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '';
  const normalized = typeof value === 'number' ? String(value) : value.replace(/,/g, '').trim();
  if (!normalized) return '';
  const parts = normalized.split('.');
  const whole = parts[0] ?? '';
  const decimal = parts[1] ?? '';
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = whole.replace(/^-/, '').replace(/\D/g, '');
  if (!digits) return '';
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const formattedWhole = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  return `${sign}${formattedWhole}${decimal ? `.${decimal}` : ''}`;
}

function parseIndianNumberInput(value: string) {
  const cleaned = value.replace(/[,\s]/g, '').trim();
  if (!cleaned) return '';
  if (!/^-?\d*(?:\.\d*)?$/.test(cleaned)) return '';
  return cleaned;
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

function getTodayDateKey() {
  return toCalendarDateKey(new Date());
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
  return `${weekday}\n${formattedDate}`;
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

function buildTradeDateCalendar(tradeDates: TradeCalendarDateOption[]) {
  const monthsByKey = new Map<
    string,
    {
      monthKey: string;
      label: string;
      days: Array<{
        dateKey: string;
        dayLabel: string;
        inMonth: boolean;
        isEligible: boolean;
        option: TradeCalendarDateOption | null;
      }>;
    }
  >();

  const parsedDates = tradeDates
    .map((option) => {
      const parsed = parseCalendarDate(option.date);
      return parsed ? { option, parsed } : null;
    })
    .filter((value): value is { option: TradeCalendarDateOption; parsed: Date } => Boolean(value));

  const months = new Map<string, TradeCalendarDateOption[]>();
  for (const { option } of parsedDates) {
    const monthKey = option.date.slice(0, 7);
    const current = months.get(monthKey) ?? [];
    current.push(option);
    months.set(monthKey, current);
  }

  for (const [monthKey, options] of months) {
    const [yearText, monthText] = monthKey.split('-');
    const year = Number(yearText);
    const month = Number(monthText) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;

    const monthStart = new Date(year, month, 1);
    const monthEnd = getMonthEnd(monthStart);
    const startOffset = (monthStart.getDay() + 6) % 7;
    const endOffset = (7 - ((monthEnd.getDay() + 6) % 7) - 1) % 7;
    const calendarStart = addCalendarDays(monthStart, -startOffset);
    const calendarEnd = addCalendarDays(monthEnd, endOffset);
    const days: Array<{
      dateKey: string;
      dayLabel: string;
      inMonth: boolean;
      isEligible: boolean;
      option: TradeCalendarDateOption | null;
    }> = [];

    const totalDays = Math.floor((calendarEnd.getTime() - calendarStart.getTime()) / 86400000) + 1;
    for (let index = 0; index < totalDays; index += 1) {
      const current = addCalendarDays(calendarStart, index);
      const dateKey = toCalendarDateKey(current);
      const option = options.find((entry) => entry.date === dateKey) ?? null;
      days.push({
        dateKey,
        dayLabel: String(current.getDate()),
        inMonth: current.getMonth() === month,
        isEligible: Boolean(option),
        option,
      });
    }

    monthsByKey.set(monthKey, {
      monthKey,
      label: formatMonthLabel(monthStart),
      days,
    });
  }

  return Array.from(monthsByKey.values()).sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function CalendarBody({
  loadingCalendar,
  tradeDates,
  draft,
  onUpdateDraft,
  onOpenSettings,
  selectionMode = 'instant',
  disableDateSelection = false,
}: {
  loadingCalendar: boolean;
  tradeDates: TradeCalendarDateOption[];
  draft: TradeRecordDraft;
  onUpdateDraft: (updater: (current: TradeRecordDraft) => TradeRecordDraft) => void;
  onOpenSettings?: () => void;
  selectionMode?: 'instant' | 'deferred';
  disableDateSelection?: boolean;
}) {
  const tradeCalendarMonths = useMemo(() => buildTradeDateCalendar(tradeDates), [tradeDates]);
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
  const visibleTradeMonth = tradeCalendarMonths[visibleTradeMonthIndex] ?? tradeCalendarMonths[0] ?? null;
  const canGoToPreviousTradeMonth = visibleTradeMonthIndex > 0;
  const canGoToNextTradeMonth = visibleTradeMonthIndex < tradeCalendarMonths.length - 1;
  const visibleTradeYear = visibleTradeMonth ? Number(visibleTradeMonth.monthKey.slice(0, 4)) : new Date().getFullYear();
  const availableMonthKeys = new Set(tradeCalendarMonths.map((month) => month.monthKey));
  const availableTradeYears = Array.from(new Set(tradeCalendarMonths.map((month) => Number(month.monthKey.slice(0, 4))))).sort((left, right) => left - right);
  const todayDateKey = getTodayDateKey();
  const selectedTradeDateOption = tradeDates.find((option) => option.date === draft.trade_date) ?? null;

  useEffect(() => {
    if (tradeCalendarMonths.length === 0) {
      setVisibleTradeMonthIndex(0);
      return;
    }

    const selectedTradeDate = draft.trade_date ? parseCalendarDate(draft.trade_date) : null;
    const selectedMonthKey = selectedTradeDate ? toCalendarDateKey(getMonthStart(selectedTradeDate)).slice(0, 7) : tradeCalendarMonths[tradeCalendarMonths.length - 1]?.monthKey ?? '';
    const selectedMonthIndex = tradeCalendarMonths.findIndex((month) => month.monthKey === selectedMonthKey);

    setVisibleTradeMonthIndex(selectedMonthIndex >= 0 ? selectedMonthIndex : 0);
  }, [draft.trade_date, tradeCalendarMonths]);

  useEffect(() => {
    if (tradeDates.length === 0 || draft.trade_date || !latestTradeDateOption) return;

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
  }, [draft.trade_date, latestTradeDateOption, latestTradeMonthIndex, onUpdateDraft, tradeDates.length]);

  useEffect(() => {
    if (!selectedTradeDateOption || selectedTradeDateOption.strike === null || !draft.trade_date) return;
    if (draft.track_strike.trim()) return;

    onUpdateDraft((current) => {
      if (current.trade_date !== draft.trade_date || current.track_strike.trim()) return current;
      return {
        ...current,
        track_strike: String(selectedTradeDateOption.strike),
      };
    });
  }, [draft.trade_date, draft.track_strike, onUpdateDraft, selectedTradeDateOption]);

  useLayoutEffect(() => {
    if (loadingCalendar || tradeDates.length === 0) return;
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
  }, [loadingCalendar, tradeDates.length]);

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
    <section className="trade-form-section trade-setup-section">
      <div className="trade-setup-heading" style={{ justifyContent: 'space-between', gap: '16px' }}>
        <div className="trade-setup-brand">
          <div className="trade-setup-icon">
            <ExpiryHeaderIcon />
          </div>
          <h4>Trade Date Calendar</h4>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
          {onOpenSettings ? (
            <button className="button secondary trade-settings-button" type="button" onClick={onOpenSettings} aria-label="Open trade dashboard settings">
              <SettingsIcon />
            </button>
          ) : null}
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
                  <span>{visibleTradeMonth?.label ?? 'Trade Date Calendar'}</span>
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
                      const canSelect = day.inMonth && day.isEligible && !loadingCalendar && !disableDateSelection;
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
                            if (selectionMode === 'deferred') {
                              onUpdateDraft((current) => ({
                                ...current,
                                trade_date: option.date,
                                expiry: option.expiry,
                                track_strike: option.strike === null ? '' : String(option.strike),
                                gap_status: option.gapStatus ?? '',
                                ema_status: option.emaStatus ?? '',
                              }));
                              return;
                            }
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
                    <div className="trade-date-calendar-empty">{loadingCalendar ? 'Loading trade dates...' : 'No trade dates available'}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </section>
  );
}

function formatTradeCalendarOption(option: TradeCalendarDateOption) {
  const parts = [option.date, option.expiry, option.dte, option.strike, option.gapStatus, option.emaStatus]
    .map((value) => (value === null || value === undefined ? '-' : String(value)))
    .join(' | ');
  return parts;
}

export function TradeDateCalendar({
  open,
  loadingCalendar,
  tradeDates,
  draft,
  onUpdateDraft,
  onClose,
  onOpenSettings,
  onSaveDate,
  mode = 'embedded',
  selectionMode = 'instant',
  disableDateSelection = false,
}: TradeDateCalendarProps) {
  const [previewDraft, setPreviewDraft] = useState<TradeRecordDraft>(draft);

  useEffect(() => {
    if (open) {
      setPreviewDraft(draft);
    }
  }, [draft, open]);

  const selectedDateOption = tradeDates.find((option) => option.date === previewDraft.trade_date) ?? null;

  if (!open) return null;

  const inner = (
    <CalendarBody
      loadingCalendar={loadingCalendar}
      tradeDates={tradeDates}
      draft={selectionMode === 'deferred' ? previewDraft : draft}
      onUpdateDraft={selectionMode === 'deferred' ? setPreviewDraft : onUpdateDraft}
      onOpenSettings={onOpenSettings}
      selectionMode={selectionMode}
      disableDateSelection={disableDateSelection}
    />
  );

  if (mode === 'embedded') {
    return inner;
  }

  return (
    <div className="trade-modal-backdrop trade-modal-backdrop--expiry" role="presentation" onClick={onClose}>
      <div className="trade-modal trade-modal--expiry" role="dialog" aria-modal="true" aria-label="Add trade" onClick={(event) => event.stopPropagation()}>
        <div className="trade-modal-topbar">
          <button className="button secondary trade-modal-close" type="button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="trade-modal-body">{inner}</div>
        {selectionMode === 'deferred' ? (
          <div className="trade-page-footer">
            <div className="trade-page-footer-line" />
            <div className="trade-page-footer-actions">
              <button className="trade-button trade-button--ghost" type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                className="trade-button trade-button--primary"
                type="button"
                onClick={() => {
                  console.log('CALENDAR_SAVE', selectedDateOption);
                  onSaveDate?.(previewDraft, selectedDateOption);
                  onClose();
                }}
              >
                Save Date
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
