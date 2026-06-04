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
    dbPath?: string;
    records?: number;
    message?: string;
  };
  storage?: {
    databasePath?: string;
    metadataPath: string;
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
