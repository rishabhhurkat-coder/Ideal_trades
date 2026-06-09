import { useEffect, useState } from 'react';
import { readNiftyMarketState } from '../../../Helper/Supabase/emaIntradayHistorical';
import { supabase } from '../../../Helper/Supabase/supabaseClient';
import type { NiftyMarketStateResponse } from './types';

type HistoricalDataPageProps = {
  onOpenPendingDates?: () => void;
  refreshToken?: number;
};

type RefreshStage = 'idle' | 'starting' | 'running' | 'success' | 'error';

type LatestRefreshSummary = {
  referenceDate?: string;
  expiry?: string;
  rawCandles?: number;
  rowsUpserted?: number;
  tempFile?: string;
};

type LatestRefreshLogEntry = {
  title: string;
  detail: string;
  durationMs?: number;
  value?: string;
};

const REFRESH_STEPS = [
  {
    key: 'request',
    label: 'Request refresh',
    detail: 'The page calls the local refresh endpoint.',
  },
  {
    key: 'kite',
    label: 'Download candles',
    detail: 'Python reads the Kite session, fetches the latest candles, and writes the temp file.',
  },
  {
    key: 'write',
    label: 'Write Supabase rows',
    detail: 'The refreshed `date_selection` rows are saved back to Supabase and pending dates are checked.',
  },
] as const;

function formatAvailableUpTo(dateTime: string | null | undefined): string {
  if (!dateTime) return '-';

  const parsedDate = new Date(dateTime);
  if (Number.isNaN(parsedDate.getTime())) return dateTime;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(parsedDate)
    .reduce<Record<string, string>>((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return `${parts.day}-${parts.month}-${parts.year.slice(-2)} ${parts.hour}.${parts.minute}`;
}

function CashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2C7 2 3 3.34 3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5c0-1.66-4-3-9-3Zm0 2c4.42 0 7 .95 7 1s-2.58 1-7 1-7-.95-7-1 2.58-1 7-1Zm0 14c-4.42 0-7-.95-7-1v-2.1c1.63.83 4.26 1.1 7 1.1s5.37-.27 7-1.1V17c0 .05-2.58 1-7 1Zm0-4c-4.42 0-7-.95-7-1v-2.1c1.63.83 4.26 1.1 7 1.1s5.37-.27 7-1.1V13c0 .05-2.58 1-7 1Zm0-4c-4.42 0-7-.95-7-1V7.9c1.63.83 4.26 1.1 7 1.1s5.37-.27 7-1.1V9c0 .05-2.58 1-7 1Z" />
    </svg>
  );
}

function OptionsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19h14v2H5v-2Zm0-14h2v11H5V5Zm4 5h2v6H9v-6Zm4-3h2v9h-2V7Zm4 4h2v5h-2v-5ZM7.5 17.5 13 12l2.25 2.25L19 10.5V13h-1.5l-2.25 2.25L13 13l-4.5 4.5-1-1Z" />
    </svg>
  );
}

function formatDurationMs(durationMs?: number): string {
  if (durationMs === undefined || Number.isNaN(durationMs)) return '-';
  return `${Math.max(0, Math.round(durationMs))} ms`;
}

export function HistoricalDataPage({ onOpenPendingDates, refreshToken = 0 }: HistoricalDataPageProps) {
  const [marketState, setMarketState] = useState<NiftyMarketStateResponse | null>(null);
  const [latestDownloadStatus, setLatestDownloadStatus] = useState<RefreshStage>('idle');
  const [latestDownloadMessage, setLatestDownloadMessage] = useState<string | null>(null);
  const [latestDownloadSummary, setLatestDownloadSummary] = useState<LatestRefreshSummary | null>(null);
  const [latestDownloadLog, setLatestDownloadLog] = useState<LatestRefreshLogEntry[]>([]);

  useEffect(() => {
    void readNiftyMarketState(supabase)
      .then((result) => {
        if (result.status === 'success') setMarketState(result);
      })
      .catch(() => {
        // Supabase state is optional before the first download.
      });
  }, [refreshToken]);

  const cashDataSynced = formatAvailableUpTo(marketState?.lastCandle);
  const latestDownloadProgress =
    latestDownloadStatus === 'idle' ? 0 : latestDownloadStatus === 'starting' ? 22 : latestDownloadStatus === 'running' ? 66 : 100;
  const latestDownloadHeadline =
    latestDownloadStatus === 'idle'
      ? 'Ready to refresh the latest date selection rows.'
      : latestDownloadMessage ?? 'Refreshing latest data...';

  function getStepState(stepIndex: number): 'complete' | 'active' | 'idle' {
    if (latestDownloadStatus === 'idle' || latestDownloadStatus === 'error') return 'idle';
    if (latestDownloadStatus === 'success') return 'complete';
    if (stepIndex === 0) return 'complete';
    if (stepIndex === 1 && latestDownloadStatus === 'running') return 'active';
    if (stepIndex === 2 && latestDownloadStatus === 'running') return 'idle';
    return stepIndex <= 0 ? 'complete' : 'idle';
  }

  async function handleLatestDownload() {
    if (latestDownloadStatus === 'running' || latestDownloadStatus === 'starting') return;

    setLatestDownloadStatus('starting');
    setLatestDownloadMessage('Preparing the refresh request...');
    setLatestDownloadSummary(null);
    setLatestDownloadLog([
      {
        title: 'Prepare request',
        detail: 'Reset the previous run state and get the refresh flow ready.',
      },
    ]);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    try {
      const refreshStart = performance.now();
      setLatestDownloadStatus('running');
      setLatestDownloadMessage('Refreshing latest data on the server...');
      const response = await fetch('/api/ema-intraday/latest-date-refresh', {
        method: 'POST',
      });
      const refreshDurationMs = performance.now() - refreshStart;
      const result = (await response.json()) as {
        status?: string;
        message?: string;
        summary?: LatestRefreshSummary;
      };

      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message ?? `Latest data refresh failed with HTTP ${response.status}.`);
      }

      setLatestDownloadStatus('success');
      setLatestDownloadMessage(result.message ?? 'Latest data refreshed successfully.');
      setLatestDownloadSummary(result.summary ?? null);
      setLatestDownloadLog([
        {
          title: 'Request latest refresh',
          detail: 'POST /api/ema-intraday/latest-date-refresh',
          durationMs: refreshDurationMs,
          value: result.message ?? 'Latest data refreshed successfully.',
        },
        {
          title: 'Refresh summary',
          detail: 'Server returned the refreshed data summary.',
          value: [
            `Reference: ${result.summary?.referenceDate ?? '-'}`,
            `Expiry: ${result.summary?.expiry ?? '-'}`,
            `Candles: ${result.summary?.rawCandles ?? '-'}`,
            `Rows: ${result.summary?.rowsUpserted ?? '-'}`,
          ].join(' | '),
        },
        ...(result.summary?.tempFile
          ? [
              {
                title: 'Temp file',
                detail: 'Raw candles were written to a temp JSON file.',
                value: result.summary.tempFile,
              },
            ]
          : []),
      ]);

      const pendingStart = performance.now();
      setLatestDownloadStatus('running');
      setLatestDownloadMessage('Latest data refreshed. Processing pending dates from Supabase...');
      const pendingResponse = await fetch('/api/ema-intraday/pending-date-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const pendingDurationMs = performance.now() - pendingStart;
      const pendingResult = (await pendingResponse.json()) as {
        status?: string;
        message?: string;
        results?: Array<{ date?: string; status?: string; message?: string }>;
      };

      if (!pendingResponse.ok || pendingResult.status !== 'success') {
        if (pendingResponse.status === 400 && /no pending dates/i.test(pendingResult.message ?? '')) {
          setLatestDownloadStatus('success');
          setLatestDownloadMessage(
            `${result.message ?? 'Latest data refreshed successfully.'} ${pendingResult.message ?? 'No pending dates found.'}`,
          );
          setLatestDownloadLog((current) => [
            ...current,
            {
              title: 'Process pending dates',
              detail: 'POST /api/ema-intraday/pending-date-download',
              durationMs: pendingDurationMs,
              value: pendingResult.message ?? 'No pending dates found.',
            },
          ]);
          return;
        }

        const failedDates = (pendingResult.results ?? [])
          .filter((item) => item.status !== 'success')
          .map((item) => item.date)
          .filter((value): value is string => Boolean(value));
        throw new Error(
          pendingResult.message ||
            (failedDates.length > 0
              ? `Pending date processing failed for ${failedDates.join(', ')}.`
              : 'Pending date processing failed.'),
        );
      }

      setLatestDownloadStatus('success');
      setLatestDownloadMessage(
        `${result.message ?? 'Latest data refreshed successfully.'} ${pendingResult.message ?? 'Pending dates processed successfully.'}`,
      );
      setLatestDownloadLog((current) => [
        ...current,
        {
          title: 'Process pending dates',
          detail: 'POST /api/ema-intraday/pending-date-download',
          durationMs: pendingDurationMs,
          value: pendingResult.message ?? 'Pending dates processed successfully.',
        },
      ]);
    } catch (error) {
      setLatestDownloadStatus('error');
      setLatestDownloadMessage(error instanceof Error ? error.message : 'Latest data refresh failed.');
      setLatestDownloadLog((current) => [
        ...current,
        {
          title: 'Failed step',
          detail: error instanceof Error ? error.message : 'Latest data refresh failed.',
          value: 'The refresh stopped before completion.',
        },
      ]);
    }
  }

  return (
    <section className="historical-data-shell">
      <div className="historical-cards-grid">
        <section className="historical-data-card">
          <div className="historical-data-card-header">
            <div className="historical-data-card-icon">
              <CashIcon />
            </div>
            <div className="historical-data-card-title">
              <h3>Latest Data</h3>
            </div>
          </div>

          <div className="historical-data-card-divider" />

          <button
            className="historical-data-card-button"
            type="button"
            onClick={() => void handleLatestDownload()}
            disabled={latestDownloadStatus === 'running' || latestDownloadStatus === 'starting'}
          >
            <span>{latestDownloadStatus === 'running' || latestDownloadStatus === 'starting' ? 'Refreshing...' : 'Download Latest Data'}</span>
          </button>

          <div className={`historical-data-refresh-panel historical-data-refresh-panel--${latestDownloadStatus}`}>
            <div className="historical-data-refresh-panel-header">
              <span className="historical-data-refresh-panel-label">Refresh status</span>
              <strong>{latestDownloadHeadline}</strong>
            </div>

            <div className="historical-data-refresh-progress" aria-hidden="true">
              <div style={{ width: `${latestDownloadProgress}%` }} />
            </div>

            <div className="historical-data-refresh-steps" aria-label="Refresh stages">
              {REFRESH_STEPS.map((step, index) => {
                const stepState = getStepState(index);
                return (
                  <div key={step.key} className={`historical-data-refresh-step historical-data-refresh-step--${stepState}`}>
                    <span className="historical-data-refresh-step-dot" />
                    <div className="historical-data-refresh-step-copy">
                      <strong>{step.label}</strong>
                      <span>{step.detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {latestDownloadSummary ? (
              <div className="historical-data-refresh-summary">
                <div className="historical-data-chip">
                  <span className="historical-data-chip-label">Reference</span>
                  <span className="historical-data-chip-value">{latestDownloadSummary.referenceDate ?? '-'}</span>
                </div>
                <div className="historical-data-chip">
                  <span className="historical-data-chip-label">Expiry</span>
                  <span className="historical-data-chip-value">{latestDownloadSummary.expiry ?? '-'}</span>
                </div>
                <div className="historical-data-chip">
                  <span className="historical-data-chip-label">Candles</span>
                  <span className="historical-data-chip-value">{latestDownloadSummary.rawCandles ?? '-'}</span>
                </div>
                <div className="historical-data-chip">
                  <span className="historical-data-chip-label">Rows</span>
                  <span className="historical-data-chip-value">{latestDownloadSummary.rowsUpserted ?? '-'}</span>
                </div>
              </div>
            ) : null}

            {latestDownloadLog.length > 0 ? (
              <div className="historical-data-refresh-log" aria-label="Latest refresh run log">
                <div className="historical-data-refresh-log-header">
                  <strong>Run log</strong>
                  <span>Line by line summary of the last refresh.</span>
                </div>

                <div className="historical-data-refresh-log-list">
                  {latestDownloadLog.map((entry, index) => (
                    <div key={`${entry.title}-${index}`} className="historical-data-refresh-log-item">
                      <div className="historical-data-refresh-log-item-title">
                        <strong>{`${index + 1}. ${entry.title}`}</strong>
                        <span>{formatDurationMs(entry.durationMs)}</span>
                      </div>
                      <div className="historical-data-refresh-log-item-detail">{entry.detail}</div>
                      {entry.value ? <div className="historical-data-refresh-log-item-value">{entry.value}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="historical-data-card historical-data-card--options">
          <div className="historical-data-card-header">
            <div className="historical-data-card-icon">
              <OptionsIcon />
            </div>
            <div className="historical-data-card-title">
              <h3>Historical Data</h3>
              <div className="historical-data-card-header-meta">
                <span>Download Data</span>
                <strong>{cashDataSynced}</strong>
              </div>
            </div>
          </div>

          <div className="historical-data-card-divider" />

          <button
            className="historical-data-card-button"
            type="button"
            onClick={onOpenPendingDates}
          >
            <span>Download Historical Data</span>
          </button>
        </section>
      </div>
    </section>
  );
}
