import { useEffect, useMemo, useState } from 'react';
import { readTradeCalendar, readUniverseLoadRows } from '../../../Helper/Supabase/emaIntradayHistorical';
import { supabase } from '../../../Helper/Supabase/supabaseClient';

type PendingDateItem = {
  date: string;
  expiry: string;
  dte: number | null;
  isLoaded: boolean;
  loadStatus: string | null;
};

type PendingCalendarDay = {
  dateKey: string;
  dayLabel: string;
  inMonth: boolean;
  option: PendingDateItem | null;
  isPending: boolean;
};

type PendingCalendarMonth = {
  monthKey: string;
  label: string;
  days: PendingCalendarDay[];
};

type PendingGcsDownloadPageProps = {
  onClose: () => void;
  onDownloadComplete: () => void;
};

type PendingDownloadLogEntry = {
  title: string;
  detail: string;
  value?: string;
};

function parseCalendarDate(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addCalendarDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toCalendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayLabel(date: Date) {
  return String(date.getDate()).padStart(2, '0');
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function CalendarChevronIcon({ direction }: { direction: 'left' | 'right' | 'down' }) {
  const rotation = direction === 'left' ? 180 : direction === 'down' ? 90 : 0;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

const CALENDAR_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildPendingCalendarMonths(dates: PendingDateItem[]) {
  const parsedDates = dates
    .map((option) => parseCalendarDate(option.date))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  if (parsedDates.length === 0) return [];

  const optionMap = new Map(dates.map((option) => [option.date, option]));
  const firstMonth = getMonthStart(parsedDates[0]);
  const lastMonth = getMonthStart(parsedDates[parsedDates.length - 1]);
  const months: PendingCalendarMonth[] = [];

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
      const option = optionMap.get(dateKey) ?? null;

      return {
        dateKey,
        dayLabel: formatDayLabel(current),
        inMonth: current.getMonth() === cursor.getMonth(),
        option,
        isPending: option !== null && !option.isLoaded,
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

function normalizeDates(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function formatDurationMs(durationMs?: number): string {
  if (durationMs === undefined || Number.isNaN(durationMs)) return '-';
  return `${Math.max(0, Math.round(durationMs))} ms`;
}

export function PendingGcsDownloadPage({ onClose, onDownloadComplete }: PendingGcsDownloadPageProps) {
  const [calendarDates, setCalendarDates] = useState<PendingDateItem[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [visibleMonthIndex, setVisibleMonthIndex] = useState(0);
  const [calendarView, setCalendarView] = useState<'dates' | 'months' | 'years'>('dates');
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Loading pending dates...');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const [downloadLog, setDownloadLog] = useState<PendingDownloadLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadCalendar() {
      setLoading(true);
      setStatusMessage('Loading pending dates...');

      try {
        const [tradeCalendarResult, loadRowsResult] = await Promise.all([
          readTradeCalendar(supabase),
          readUniverseLoadRows(supabase),
        ]);

        if (cancelled) return;

        if (tradeCalendarResult.status !== 'success') {
          throw new Error(tradeCalendarResult.message ?? 'Unable to load trade calendar.');
        }

        if (loadRowsResult.status !== 'success') {
          throw new Error(loadRowsResult.message ?? 'Unable to load loaded-date status.');
        }

        const loadMap = new Map(
          (loadRowsResult.rows ?? []).map((row) => [`${row.trade_date}|${row.expiry}`, row.load_status ?? ''] as const),
        );

        const items = (tradeCalendarResult.dates ?? []).map((option) => {
          const loadStatus = loadMap.get(`${option.date}|${option.expiry}`) ?? null;
          const isLoaded = loadStatus?.toUpperCase() === 'LOADED';
          return {
            date: option.date,
            expiry: option.expiry,
            dte: option.dte,
            isLoaded,
            loadStatus,
          };
        });

        setCalendarDates(items);
        const pendingDates = items.filter((item) => !item.isLoaded).map((item) => item.date);
        setSelectedDates(pendingDates);
        setDownloadLog([
          {
            title: 'Load pending dates',
            detail: 'Read the trade calendar and load-status rows from Supabase.',
            value: `${pendingDates.length} pending / ${items.length - pendingDates.length} completed`,
          },
        ]);
        setStatusMessage(
          pendingDates.length > 0
            ? `${pendingDates.length} pending date${pendingDates.length === 1 ? '' : 's'} ready to download.`
            : 'No pending dates found.',
        );
      } catch (error) {
        if (cancelled) return;
        setCalendarDates([]);
        setSelectedDates([]);
        setStatusMessage(error instanceof Error ? error.message : 'Unable to load pending dates.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCalendar();
    return () => {
      cancelled = true;
    };
  }, []);

  const months = useMemo(() => buildPendingCalendarMonths(calendarDates), [calendarDates]);
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const availableYears = useMemo(
    () => Array.from(new Set(months.map((month) => Number(month.monthKey.slice(0, 4))))).sort((left, right) => left - right),
    [months],
  );
  const visibleMonth = months[visibleMonthIndex] ?? months[0] ?? null;
  const visibleYear = visibleMonth ? Number(visibleMonth.monthKey.slice(0, 4)) : new Date().getFullYear();
  const availableMonthKeys = useMemo(() => new Set(months.map((month) => month.monthKey)), [months]);
  const pendingCount = calendarDates.filter((item) => !item.isLoaded).length;
  const completedCount = calendarDates.length - pendingCount;
  const selectedCount = selectedDates.length;
  const todayDateKey = toCalendarDateKey(new Date());

  useEffect(() => {
    if (months.length === 0) {
      setVisibleMonthIndex(0);
      return;
    }

    setVisibleMonthIndex(months.length - 1);
    setCalendarView('dates');
  }, [months]);

  useEffect(() => {
    if (months.length === 0) return;
    if (visibleMonthIndex >= months.length) {
      setVisibleMonthIndex(months.length - 1);
    }
  }, [months.length, visibleMonthIndex]);

  function toggleDate(dateKey: string) {
    const dateOption = calendarDates.find((item) => item.date === dateKey);
    if (!dateOption || dateOption.isLoaded) return;

    setSelectedDates((current) =>
      current.includes(dateKey)
        ? current.filter((value) => value !== dateKey)
        : [...current, dateKey].sort((left, right) => left.localeCompare(right)),
    );
  }

  function selectAllPending() {
    setSelectedDates(calendarDates.filter((item) => !item.isLoaded).map((item) => item.date));
  }

  function clearSelection() {
    setSelectedDates([]);
  }

  function moveCalendarYear(direction: -1 | 1) {
    const targetYear = visibleYear + direction;
    const targetMonth = visibleMonth ? Number(visibleMonth.monthKey.slice(5, 7)) - 1 : 0;
    const exactMonthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
    const exactIndex = months.findIndex((month) => month.monthKey === exactMonthKey);
    if (exactIndex >= 0) {
      setVisibleMonthIndex(exactIndex);
      return;
    }

    const fallbackIndex = months.findIndex((month) => month.monthKey.startsWith(`${targetYear}-`));
    if (fallbackIndex >= 0) {
      setVisibleMonthIndex(fallbackIndex);
    }
  }

  function selectCalendarMonth(monthIndex: number) {
    const monthKey = `${visibleYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    const nextIndex = months.findIndex((month) => month.monthKey === monthKey);
    if (nextIndex < 0) return;
    setVisibleMonthIndex(nextIndex);
    setCalendarView('dates');
  }

  function selectCalendarYear(year: number) {
    const nextIndex = months.findIndex((month) => month.monthKey.startsWith(`${year}-`));
    if (nextIndex < 0) return;
    setVisibleMonthIndex(nextIndex);
    setCalendarView('months');
  }

  function goToToday() {
    if (months.length === 0) return;

    const todayMonthIndex = months.findIndex((month) => month.monthKey === todayDateKey.slice(0, 7));
    setVisibleMonthIndex(todayMonthIndex >= 0 ? todayMonthIndex : months.length - 1);
    setCalendarView('dates');
  }

  function goToPreviousPeriod() {
    if (calendarView === 'months' || calendarView === 'years') {
      moveCalendarYear(-1);
      return;
    }

    setVisibleMonthIndex((current) => Math.max(current - 1, 0));
  }

  function goToNextPeriod() {
    if (calendarView === 'months' || calendarView === 'years') {
      moveCalendarYear(1);
      return;
    }

    setVisibleMonthIndex((current) => Math.min(current + 1, Math.max(months.length - 1, 0)));
  }

  function selectAllPendingInVisibleYear() {
    const visibleYearPrefix = `${visibleYear}-`;
    const yearDates = calendarDates.filter((item) => !item.isLoaded && item.date.startsWith(visibleYearPrefix)).map((item) => item.date);
    if (yearDates.length === 0) return;
    setSelectedDates(yearDates);
    setCalendarView('dates');
  }

  async function handleDownloadSelected() {
    const dates = normalizeDates(selectedDates);
    if (dates.length === 0 || downloadStatus === 'downloading') return;

    setDownloadStatus('downloading');
    setStatusMessage(`Downloading ${dates.length} pending date${dates.length === 1 ? '' : 's'} from Supabase...`);
    setDownloadLog([
      {
        title: 'Prepare download',
        detail: 'Use the selected pending dates from the calendar.',
        value: `${dates.length} date${dates.length === 1 ? '' : 's'} selected`,
      },
    ]);

    try {
      const requestStart = performance.now();
      const response = await fetch('/api/ema-intraday/pending-date-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dates }),
      });
      const requestDurationMs = performance.now() - requestStart;
      const result = (await response.json()) as {
        status?: string;
        message?: string;
        results?: Array<{ date?: string; status?: string; message?: string }>;
      };

      if (!response.ok || result.status !== 'success') {
        const failedDates = (result.results ?? [])
          .filter((item) => item.status !== 'success')
          .map((item) => item.date)
          .filter((value): value is string => Boolean(value));
        throw new Error(
          result.message ||
            (failedDates.length > 0 ? `Download failed for ${failedDates.join(', ')}.` : 'Pending download failed.'),
        );
      }

      setDownloadStatus('success');
      setStatusMessage(result.message ?? 'Pending dates downloaded successfully.');
      setDownloadLog((current) => [
        ...current,
        {
          title: 'Download pending dates',
          detail: 'POST /api/ema-intraday/pending-date-download',
          value: `Completed in ${formatDurationMs(requestDurationMs)}.`,
        },
        ...(result.results ?? []).map((item) => ({
          title: item.date ?? 'Unknown date',
          detail: item.message ?? (item.status === 'success' ? 'Downloaded successfully.' : 'Download failed.'),
          value: item.status ?? '-',
        })),
      ]);
      onDownloadComplete();
    } catch (error) {
      setDownloadStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Pending download failed.');
      setDownloadLog((current) => [
        ...current,
        {
          title: 'Download failed',
          detail: error instanceof Error ? error.message : 'Pending download failed.',
          value: 'The option download stopped before completion.',
        },
      ]);
    }
  }

  return (
    <section className="historical-data-shell pending-download-shell">
      <div className="trade-date-layout pending-download-layout">
        <section className="trade-date-left-panel">
          <div className="trade-date-toolbar">
            <div className="trade-date-toolbar-actions">
              <button type="button" className="button secondary trade-date-nav-button" onClick={goToToday}>
                Today
              </button>
              <button
                type="button"
                className="button secondary trade-date-icon-button"
                onClick={goToPreviousPeriod}
                disabled={calendarView === 'dates' && visibleMonthIndex <= 0}
                aria-label={calendarView === 'months' ? 'Previous year' : 'Previous month'}
              >
                ◀
              </button>
              <button
                type="button"
                className="button secondary trade-date-icon-button"
                onClick={goToNextPeriod}
                disabled={calendarView === 'dates' && visibleMonthIndex >= Math.max(months.length - 1, 0)}
                aria-label={calendarView === 'months' ? 'Next year' : 'Next month'}
              >
                ▶
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
                    ◀
                  </button>
                  <strong>{visibleYear}</strong>
                  <button type="button" className="button secondary trade-date-icon-button" onClick={() => moveCalendarYear(1)} aria-label="Next year">
                    ▶
                  </button>
                </div>
                <div className="trade-date-year-grid">
                  {availableYears.map((year) => (
                    <button
                      key={year}
                      type="button"
                      className={`trade-date-year-tile${visibleYear === year ? ' active' : ''}`}
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
                    ◀
                  </button>
                  <strong>{visibleYear}</strong>
                  <button type="button" className="button secondary trade-date-icon-button" onClick={() => moveCalendarYear(1)} aria-label="Next year">
                    ▶
                  </button>
                </div>
                <div className="trade-date-month-grid">
                  {Array.from({ length: 12 }, (_, monthIndex) => {
                    const monthKey = `${visibleYear}-${String(monthIndex + 1).padStart(2, '0')}`;
                    const isActive = visibleMonth?.monthKey === monthKey;
                    const hasDates = availableMonthKeys.has(monthKey);
                    return (
                      <button
                        key={monthKey}
                        type="button"
                        className={`trade-date-month-tile${isActive ? ' active' : ''}`}
                        disabled={!hasDates}
                        onClick={() => selectCalendarMonth(monthIndex)}
                      >
                        {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(visibleYear, monthIndex, 1))}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="trade-date-calendar-view">
                <button type="button" className="trade-date-month-heading" onClick={() => setCalendarView('months')}>
                  <span>{visibleMonth?.label ?? 'Pending Dates'}</span>
                  <span aria-hidden="true">⌄</span>
                </button>
                <div className="trade-date-weekdays">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
                <div className="trade-date-days">
                  {visibleMonth ? (
                    visibleMonth.days.map((day) => {
                      const isSelected = selectedDateSet.has(day.dateKey);
                      const isPending = day.isPending;
                      const isToday = day.dateKey === todayDateKey;
                      const option = day.option;

                      return (
                        <button
                          key={day.dateKey}
                          type="button"
                          className={`trade-date-day${isPending ? ' available' : ' unavailable'}${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                          disabled={!isPending}
                          title={option ? `${option.date} - ${option.expiry}${option.loadStatus ? ` - ${option.loadStatus}` : ''}` : day.dateKey}
                          aria-label={
                            option
                              ? `${option.date} ${isPending ? 'pending' : 'loaded'}${option.loadStatus ? ` ${option.loadStatus}` : ''}`
                              : day.dateKey
                          }
                          aria-pressed={isSelected}
                          onClick={() => toggleDate(day.dateKey)}
                        >
                          {day.dayLabel}
                        </button>
                      );
                    })
                  ) : (
                    <div className="trade-date-calendar-empty">{loading ? 'Loading pending dates...' : 'No pending dates available'}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="pending-download-side-panel">
          <div className="historical-data-chip">
            <span className="historical-data-chip-label">Pending</span>
            <span className="historical-data-chip-value">{pendingCount}</span>
          </div>
          <div className="historical-data-chip">
            <span className="historical-data-chip-label">Completed</span>
            <span className="historical-data-chip-value">{completedCount}</span>
          </div>
          <div className="historical-data-chip">
            <span className="historical-data-chip-label">Selected</span>
            <span className="historical-data-chip-value">{selectedCount}</span>
          </div>

          <div className="pending-download-side-note">
            <strong>{selectedCount}</strong>
            <span>dates selected for pending-date processing.</span>
          </div>

          <div className="pending-download-selected-list">
            {selectedDates.slice(0, 12).map((date) => (
              <span key={date} className="pending-download-selected-pill">
                {date}
              </span>
            ))}
            {selectedDates.length > 12 ? <span className="pending-download-selected-pill">+{selectedDates.length - 12} more</span> : null}
          </div>

          {downloadLog.length > 0 ? (
            <div className="pending-download-log" aria-label="Pending download run log">
              <div className="historical-data-refresh-log-header">
                <strong>Run log</strong>
                <span>Line by line summary of the option download.</span>
              </div>
              <div className="historical-data-refresh-log-list">
                {downloadLog.map((entry, index) => (
                  <div key={`${entry.title}-${index}`} className="historical-data-refresh-log-item">
                    <div className="historical-data-refresh-log-item-title">
                      <strong>{`${index + 1}. ${entry.title}`}</strong>
                    </div>
                    <div className="historical-data-refresh-log-item-detail">{entry.detail}</div>
                    {entry.value ? <div className="historical-data-refresh-log-item-value">{entry.value}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pending-download-actions">
            <button className="button secondary" type="button" onClick={onClose}>
              Close
            </button>
            <button className="button secondary" type="button" onClick={selectAllPending} disabled={loading || pendingCount === 0}>
              Select All Pending
            </button>
            <button className="button secondary" type="button" onClick={selectAllPendingInVisibleYear} disabled={loading || pendingCount === 0}>
              Select Visible Year
            </button>
            <button className="button secondary" type="button" onClick={clearSelection} disabled={loading || selectedCount === 0}>
              Clear Selection
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => void handleDownloadSelected()}
              disabled={loading || downloadStatus === 'downloading' || selectedCount === 0}
            >
              {downloadStatus === 'downloading' ? 'Downloading...' : 'Download Selected Pending Dates'}
            </button>
          </div>
        </aside>
      </div>

      <div className={`alert${downloadStatus === 'error' ? ' alert--error' : ''}`}>{loading ? 'Loading pending dates...' : statusMessage}</div>
    </section>
  );
}
