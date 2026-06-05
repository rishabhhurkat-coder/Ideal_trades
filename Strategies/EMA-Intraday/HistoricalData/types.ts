export type KiteConnectionStatus = 'not_connected' | 'request_token_received' | 'connected' | 'connecting' | 'error';

export type KiteAuthState = {
  requestToken: string | null;
  connected: boolean;
  authenticatedAt: string | null;
  status: KiteConnectionStatus;
  message: string | null;
  accessTokenStatus: string | null;
  userName: string | null;
  userId: string | null;
};

export type KiteTokenExchangeResponse = {
  connected: boolean;
  accessTokenStatus?: string;
  accessTokenAvailable?: boolean;
  apiKeyConfigured?: boolean;
  apiSecretConfigured?: boolean;
  loginUrl?: string | null;
  loginTime?: string | null;
  userName?: string | null;
  userId?: string | null;
  profileStatus?: string;
  profileMessage?: string;
  message?: string;
};

export type KiteSessionStatusResponse = {
  connected: boolean;
  accessTokenStatus?: string;
  accessTokenAvailable?: boolean;
  apiKeyConfigured?: boolean;
  apiSecretConfigured?: boolean;
  loginUrl?: string | null;
  loginTime?: string | null;
  userName?: string | null;
  userId?: string | null;
  profileStatus?: string;
  profileMessage?: string;
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

export type ManualHistoricalDownloadCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ManualHistoricalDownloadResponse = {
  status: 'success' | 'error';
  message?: string;
  symbol?: string;
  exchange?: string;
  timeframe?: string;
  interval?: string;
  instrumentToken?: number;
  from?: string;
  to?: string;
  recordsDownloaded?: number;
  firstCandle?: string;
  lastCandle?: string;
  downloadStatus?: string;
  candles?: ManualHistoricalDownloadCandle[];
  metadata?: {
    symbol?: string;
    first_candle: string;
    last_candle: string;
    total_records: number;
    last_update: string;
    instrument_token: number;
    timeframe?: string;
  };
  database?: {
    status: 'success' | 'error';
    records?: number;
    message?: string;
  };
  state?: NiftyMarketStateResponse;
  supabase?: {
    stateKey?: string;
    candleTable?: string;
    stateTable?: string;
    sessionTable?: string;
  };
  endpoint?: string;
  chunksDownloaded?: number;
  apiResponseStatus?: string;
  profileStatus?: string;
  errorType?: string | null;
  debug?: {
    requestTime: string;
    responseTime: string;
    candlesReturned: number;
    apiStatus: string;
  };
};
