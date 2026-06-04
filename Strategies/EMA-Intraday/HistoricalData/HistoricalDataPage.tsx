import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DEFAULT_KITE_LOGIN_URL, KiteConnectService } from './KiteConnectService';
import type { KiteAuthState, ManualHistoricalDownloadResponse } from './types';

type DownloadStatus =
  | 'idle'
  | 'checking'
  | 'login_required'
  | 'generating_session'
  | 'downloading'
  | 'saving'
  | 'completed'
  | 'error';

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

  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}.${parts.minute}`;
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

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 5v5.17l3.41 2.41-1.16 1.64L11 13V7h2Z" />
    </svg>
  );
}

function ConstructionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 2 6 9.5v5l-2 2V21h4.5l2-2h5L21 11.5V6l-7.5-4ZM8 19.17 4.83 16H7l1 1v2.17ZM18 10l-7 7h-2l-2-2v-2l7-7 4 4Z" />
    </svg>
  );
}

export function HistoricalDataPage() {
  const kiteConnectService = useMemo(() => new KiteConnectService(), []);
  const [authState, setAuthState] = useState<KiteAuthState>(() => kiteConnectService.getAuthState());
  const [requestTokenInput, setRequestTokenInput] = useState(() => kiteConnectService.getAuthState().requestToken ?? '');
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [downloadMessage, setDownloadMessage] = useState('Ready to update local NIFTY 50 3 Minute history.');
  const [downloadResult, setDownloadResult] = useState<ManualHistoricalDownloadResponse | null>(null);
  const [pendingDownloadAfterAuth, setPendingDownloadAfterAuth] = useState(false);
  const [updateOptionsMessage, setUpdateOptionsMessage] = useState('');
  const loginWindowRef = useRef<Window | null>(null);

  const isBusy =
    downloadStatus === 'checking' ||
    downloadStatus === 'generating_session' ||
    downloadStatus === 'downloading' ||
    downloadStatus === 'saving';
  const needsRequestToken = downloadStatus === 'login_required' || pendingDownloadAfterAuth;
  const metadata = downloadResult?.metadata;
  const dataAvailableUpTo = formatAvailableUpTo(metadata?.last_candle);
  const cashDataSynced = dataAvailableUpTo;
  const authStatusLabel = authState.connected ? 'Connected' : authState.requestToken ? 'Token Ready' : 'Not Connected';

  useEffect(() => {
    void fetch('/api/kite/historical-candles', {
      method: 'GET',
      credentials: 'include',
    })
      .then(async (response) => {
        const result = (await response.json()) as ManualHistoricalDownloadResponse;
        if (response.ok && result.status === 'success') setDownloadResult(result);
      })
      .catch(() => {
        // Local metadata is optional before the first download.
      });

    void kiteConnectService
      .verifyConnection()
      .then(setAuthState)
      .catch(() => {
        // The one-button flow performs a fresh session check before downloading.
      });
  }, [kiteConnectService]);

  async function openKiteLoginForToken(message: string, preopenedWindow: Window | null = null) {
    setPendingDownloadAfterAuth(true);
    setDownloadStatus('login_required');
    setDownloadMessage(message);

    try {
      await kiteConnectService.startLogin(preopenedWindow);
    } catch (error) {
      setDownloadStatus('error');
      setDownloadMessage(error instanceof Error ? error.message : 'Unable to open Kite login.');
    }
  }

  async function downloadMissingHistoricalData() {
    setDownloadStatus('downloading');
    setDownloadMessage('Downloading missing NIFTY 50 3 Minute candles...');

    const response = await fetch('/api/kite/historical-candles', {
      method: 'POST',
      credentials: 'include',
    });
    const result = (await response.json()) as ManualHistoricalDownloadResponse;

    if (response.status === 401 || response.status === 403) {
      await openKiteLoginForToken(
        result.message ?? 'Session expired. Kite login opened in a new tab; paste request_token to continue.',
        loginWindowRef.current,
      );
      return false;
    }

    if (!response.ok || result.status !== 'success') {
      throw new Error(result.message ?? `Historical API failure with HTTP ${response.status}.`);
    }

    setDownloadStatus('saving');
    setDownloadMessage('Writing historical candles directly to SQLite...');
    setDownloadResult(result);
    setDownloadStatus('completed');
    setDownloadMessage('Completed.');
    return true;
  }

  async function handleDownloadData() {
    setPendingDownloadAfterAuth(false);
    setDownloadStatus('checking');
    setDownloadMessage('Checking Session...');

    try {
      loginWindowRef.current?.close();
      loginWindowRef.current = null;

      const currentAuthState = await kiteConnectService.verifyConnection();
      setAuthState(currentAuthState);

      if (currentAuthState.connected) {
        await downloadMissingHistoricalData();
        return;
      }

      await openKiteLoginForToken('No active Kite session found. Kite login opened in a new tab; paste request_token to continue.');
    } catch (error) {
      loginWindowRef.current?.close();
      loginWindowRef.current = null;
      setDownloadStatus('error');
      setDownloadMessage(error instanceof Error ? error.message : 'Historical download failed.');
    }
  }

  async function handleRequestTokenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const requestToken = requestTokenInput.trim();
    if (!requestToken || downloadStatus === 'generating_session') return;

    await generateSessionAndDownload(requestToken);
  }

  async function generateSessionAndDownload(requestToken: string) {
    setDownloadStatus('generating_session');
    setDownloadMessage('Generating Kite session...');
    setAuthState({
      ...kiteConnectService.setRequestToken(requestToken, 'Generating Kite access token.'),
      status: 'connecting',
    });

    try {
      const nextAuthState = await kiteConnectService.exchangeRequestToken(requestToken);
      setRequestTokenInput('');
      setAuthState(nextAuthState);
      setPendingDownloadAfterAuth(false);
      await downloadMissingHistoricalData();
    } catch (error) {
      setDownloadStatus('error');
      setDownloadMessage(error instanceof Error ? error.message : 'Network error while connecting to Kite.');
      setAuthState(
        kiteConnectService.markError(
          error instanceof Error ? error.message : 'Network error while connecting to Kite.',
        ),
      );
    }
  }

  function handleUpdateOptionsData() {
    setUpdateOptionsMessage('Feature Incoming Soon!!');
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
              <h3>Cash Data</h3>
            </div>
          </div>

          <div className="historical-data-card-divider" />

          <button
            className="historical-data-card-button"
            type="button"
            onClick={() => void handleDownloadData()}
            disabled={isBusy}
          >
            <span aria-hidden="true">â†“</span>
            <span>Download Cash Data</span>
          </button>

          <div className="historical-data-card-divider muted" />

          <div className="historical-data-card-footer">
            <div className="historical-data-card-footer-icon">
              <ClockIcon />
            </div>
            <div className="historical-data-card-footer-copy">
              <span>Last Synced</span>
              <strong>{cashDataSynced}</strong>
            </div>
          </div>
        </section>

        <section className="historical-data-card historical-data-card--options">
          <div className="historical-data-card-header">
            <div className="historical-data-card-icon">
              <OptionsIcon />
            </div>
            <div className="historical-data-card-title">
              <h3>Options Data</h3>
            </div>
          </div>

          <div className="historical-data-card-divider" />

          <button
            className="historical-data-card-button"
            type="button"
            onClick={handleUpdateOptionsData}
            disabled={isBusy}
          >
            <span aria-hidden="true">â†“</span>
            <span>Download Options Data</span>
          </button>

          <div className="historical-data-card-divider muted" />

          <div className="historical-data-card-footer">
            <div className="historical-data-card-footer-icon historical-data-card-footer-icon--soon">
              <ConstructionIcon />
            </div>
            <div className="historical-data-card-footer-copy">
              <span>Last Synced</span>
              <strong>Coming Soon</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="historical-action-row">
        <div className="historical-data-chip">
          <span className="historical-data-chip-label">Kite Session</span>
          <span className="historical-data-chip-value">{authStatusLabel}</span>
        </div>
        <div className="historical-data-chip">
          <span className="historical-data-chip-label">Available Up To</span>
          <span className="historical-data-chip-value">{dataAvailableUpTo}</span>
        </div>
      </div>

      {downloadStatus !== 'idle' || downloadMessage !== 'Ready to update local NIFTY 50 3 Minute history.' ? (
        <div className="alert">{downloadMessage}</div>
      ) : null}
      {updateOptionsMessage ? <div className="alert">{updateOptionsMessage}</div> : null}
      {needsRequestToken ? (
        <section className="historical-token-panel">
          <h2>Paste Request Token</h2>
          <form onSubmit={handleRequestTokenSubmit}>
            <label htmlFor="kite-request-token">Request Token</label>
            <input
              id="kite-request-token"
              type="text"
              value={requestTokenInput}
              onChange={(event) => setRequestTokenInput(event.target.value)}
              placeholder="Paste request_token"
              disabled={downloadStatus === 'generating_session'}
              autoComplete="off"
              autoFocus
            />
          </form>
        </section>
      ) : null}

    </section>
  );
}

