import { DEFAULT_KITE_LOGIN_URL, KiteConnectService } from '../KiteConnectService';
import type { KiteAuthState, ManualHistoricalDownloadResponse, NiftyMarketStateResponse } from '../types';
import { readEmaIntradayTimeTable, readNiftyMarketState } from '../../../../Helper/Supabase/emaIntradayHistorical';
import { supabase } from '../../../../Helper/Supabase/supabaseClient';

// Legacy only: kept for future reuse of the old "Download Latest Data" flow.
// This file is intentionally not imported by the live HistoricalData page.

export type DownloadStatus =
  | 'idle'
  | 'checking'
  | 'login_required'
  | 'generating_session'
  | 'downloading'
  | 'saving'
  | 'completed'
  | 'error';

export type LegacyLatestDataDeps = {
  kiteConnectService: KiteConnectService;
  loginWindowRef: { current: Window | null };
  setPendingDownloadAfterAuth: (value: boolean) => void;
  setDownloadStatus: (value: DownloadStatus) => void;
  setDownloadMessage: (value: string) => void;
  setDownloadResult: (value: ManualHistoricalDownloadResponse | null) => void;
  setMarketState: (value: NiftyMarketStateResponse | null) => void;
  setRequestTokenInput: (value: string) => void;
  setAuthState: (value: KiteAuthState) => void;
  markError: (message: string) => KiteAuthState;
  openPendingDates?: () => void;
};

export async function readLegacyHistoricalState() {
  const marketState = await readNiftyMarketState(supabase);
  const timeTable = await readEmaIntradayTimeTable(supabase);
  return { marketState, timeTable };
}

export async function openLegacyKiteLoginForToken(
  deps: Pick<LegacyLatestDataDeps, 'kiteConnectService' | 'setPendingDownloadAfterAuth' | 'setDownloadStatus' | 'setDownloadMessage'>,
  message: string,
  preopenedWindow: Window | null = null,
) {
  deps.setPendingDownloadAfterAuth(true);
  deps.setDownloadStatus('login_required');
  deps.setDownloadMessage(message);
  await deps.kiteConnectService.startLogin(preopenedWindow);
}

export async function downloadLegacyHistoricalData(
  deps: Pick<
    LegacyLatestDataDeps,
    | 'kiteConnectService'
    | 'loginWindowRef'
    | 'setDownloadStatus'
    | 'setDownloadMessage'
    | 'setDownloadResult'
    | 'setMarketState'
    | 'setPendingDownloadAfterAuth'
    | 'setAuthState'
    | 'setRequestTokenInput'
    | 'markError'
  >,
) {
  deps.setDownloadStatus('downloading');
  deps.setDownloadMessage('Downloading missing NIFTY 50 3 Minute candles...');

  const response = await fetch('/api/kite/historical-candles', {
    method: 'POST',
    credentials: 'include',
  });
  const result = (await response.json()) as ManualHistoricalDownloadResponse;

  if (response.status === 401 || response.status === 403) {
    await openLegacyKiteLoginForToken(
      {
        kiteConnectService: deps.kiteConnectService,
        setPendingDownloadAfterAuth: deps.setPendingDownloadAfterAuth,
        setDownloadStatus: deps.setDownloadStatus,
        setDownloadMessage: deps.setDownloadMessage,
      },
      result.message ?? 'Session expired. Kite login opened in a new tab; paste request_token to continue.',
      deps.loginWindowRef.current,
    );
    return false;
  }

  if (!response.ok || result.status !== 'success') {
    throw new Error(result.message ?? `Historical API failure with HTTP ${response.status}.`);
  }

  deps.setDownloadStatus('saving');
  deps.setDownloadMessage('Writing historical candles directly to Supabase...');
  deps.setDownloadResult(result);
  if (result.state) deps.setMarketState(result.state);
  deps.setDownloadStatus('completed');
  deps.setDownloadMessage('Completed.');
  return true;
}

export function legacyKiteLoginUrl() {
  return DEFAULT_KITE_LOGIN_URL;
}
