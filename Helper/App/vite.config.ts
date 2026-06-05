import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createClient } from '@supabase/supabase-js';
import { dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import ws from 'file:///C:/Users/Dell/Matalia_Accounting_Engine/RRH_Project_Files/Application/node_modules/ws/wrapper.mjs';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const kiteSessionPath = fileURLToPath(new URL('./.kite-session.json', import.meta.url));
const externalKiteTokenPath = 'G:\\My Drive\\H&L\\Individual Trades Codes - Copy\\Data Files\\token.json';
const historicalSyncScriptPath = fileURLToPath(new URL('../../Strategies/EMA-Intraday/HistoricalData/sync_kite_candles_to_supabase.py', import.meta.url));
const tradeLogPath = fileURLToPath(new URL('../../Strategies/EMA-Intraday/TradeDashboard/trade-log.md', import.meta.url));
const historicalStartDate = '2021-01-01';
const niftyInstrumentToken = 256265;
const historicalInterval = '3minute';
const historicalSymbol = 'NIFTY 50';
const historicalTimeframeLabel = '3 Minute';
const historicalChunkDays = 60;
const defaultKiteApiKey = 'zz9755o0bpmqlz0u';
const defaultRuntimeUserEmail = 'ideal-trades@local.dev';
const defaultRuntimeUserId = '5f2e4d5f-0f72-4bbd-99bb-49d1c4d2d3a1';
const defaultRuntimeUserName = 'Ideal Trades';
const emaIntradayStrategyName = 'EMA Intraday';
const historicalStateKey = 'NIFTY_50_3MIN';
const tradeDashboardEndpoint = '/api/ema-intraday/trade-dashboard';
const pythonCommand = process.env.IDEAL_TRADES_PYTHON || 'python';

type KiteSession = {
  access_token: string;
  public_token: string | null;
  user_name: string | null;
  user_id: string | null;
  login_time: string | null;
};

type KiteTokenFile = {
  access_token?: string;
  accessToken?: string;
  login_date?: string | null;
  loginDate?: string | null;
  login_time?: string | null;
  user_name?: string | null;
  user_id?: string | null;
};

type KiteSessionResponse = {
  status: 'success' | 'error';
  data?: {
    access_token?: string;
    public_token?: string;
    login_time?: string;
    user_name?: string;
    user_id?: string;
  };
  message?: string;
  error_type?: string;
};

type KiteProfileResponse = {
  status: 'success' | 'error';
  data?: {
    user_name?: string;
    user_id?: string;
    email?: string;
  };
  message?: string;
  error_type?: string;
};

type KiteQuoteLtpResponse = {
  status: 'success' | 'error';
  data?: Record<string, { instrument_token?: number; last_price?: number }>;
  message?: string;
  error_type?: string;
};

type KiteHistoricalResponse = {
  status: 'success' | 'error';
  data?: {
    candles?: unknown[];
  };
  message?: string;
  error_type?: string;
};

type ValidatedCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type HistoricalMetadata = {
  symbol: string;
  instrument_token: number;
  timeframe: string;
  first_candle: string;
  last_candle: string;
  total_records: number;
  last_update: string;
};

type HistoricalDbBuildResult = {
  status: 'success' | 'error';
  dbPath?: string;
  records?: number;
  message?: string;
  metadata?: HistoricalMetadata;
  state?: NiftyMarketStateRow;
  supabase?: {
    stateKey?: string;
    candleTable?: string;
    stateTable?: string;
  };
  recordsUpserted?: number;
  database?: {
    status: 'success' | 'error';
    records?: number;
    message?: string;
  };
};

type HistoricalDbSnapshot = {
  status: 'success' | 'error';
  dbPath?: string;
  records?: number;
  firstCandle?: string;
  lastCandle?: string;
  message?: string;
};

type TradeLogRequest = {
  record?: {
    id?: string;
    trade_date?: string;
    track_strike?: number | null;
    expiry?: string | null;
    gap_status?: string;
    ema_status?: string;
    created_at?: string;
    updated_at?: string;
    legs?: Array<{
      leg_no?: number;
      trades?: Array<{
        id?: string;
        option?: string;
        trade_strike?: number | null;
        quantity?: number | null;
        entry_reason?: string;
        exit_reason?: string;
        entry_time?: string;
        entry_price?: number | null;
        exit_time?: string;
        exit_price?: number | null;
        pl?: number | null;
      }>;
    }>;
  };
  action?: 'create' | 'update';
};

type TradeDashboardRecordRow = {
  id: string;
  user_id: string;
  strategy_id: string;
  trade_date: string;
  track_strike: number | null;
  expiry: string | null;
  status: string;
  gap_status: string;
  ema_status: string;
  created_at: string;
  updated_at: string;
};

type TradeDashboardLegRow = {
  id: string;
  trade_id: string;
  user_id: string;
  leg_no: number;
  option_side: 'CE' | 'PE';
  trade_strike: number | null;
  quantity: number | null;
  entry_reason_id: string | null;
  exit_reason_id: string | null;
  entry_time: string | null;
  exit_time: string | null;
  entry_price: number | null;
  exit_price: number | null;
  pl: number | null;
  created_at: string;
  updated_at: string;
};

type NiftyMarketCandleRow = {
  symbol: string;
  instrument_token: number;
  timeframe: string;
  interval: string;
  trade_date: string;
  trade_time: string;
  candle_timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  atm: number | null;
  ema_1000: number;
  ema_interaction: string;
  source: string;
};

type NiftyMarketStateRow = {
  state_key: string;
  symbol: string;
  instrument_token: number;
  timeframe: string;
  interval: string;
  first_candle: string | null;
  last_candle: string | null;
  latest_candle_timestamp: string | null;
  latest_open: number | null;
  latest_high: number | null;
  latest_low: number | null;
  latest_close: number | null;
  latest_volume: number | null;
  latest_atm: number | null;
  latest_ema_1000: number | null;
  latest_ema_interaction: string | null;
  total_records: number;
  last_update: string | null;
  source: string;
};

type KiteSessionRow = {
  session_key: string;
  access_token: string;
  public_token: string | null;
  user_name: string | null;
  user_id: string | null;
  login_time: string | null;
  profile_status: string | null;
  profile_message: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

function getKiteLoginUrl(apiKey: string) {
  return `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}`;
}

function sendJson(response: import('node:http').ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}

function formatTradeLogValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function formatTradeLogAmount(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toFixed(2);
}

function formatTradeLogRecord(record: NonNullable<TradeLogRequest['record']>, action: 'create' | 'update') {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`### ${timestamp} - ${action === 'create' ? 'Saved Trade' : 'Updated Trade'}`);
  lines.push(`- Record ID: ${formatTradeLogValue(record.id)}`);
  lines.push(`- Trade Date: ${formatTradeLogValue(record.trade_date)}`);
  lines.push(`- Expiry: ${formatTradeLogValue(record.expiry)}`);
  lines.push(`- Track Strike: ${formatTradeLogValue(record.track_strike)}`);
  lines.push(`- Created At: ${formatTradeLogValue(record.created_at)}`);
  lines.push(`- Updated At: ${formatTradeLogValue(record.updated_at)}`);

  (record.legs ?? []).forEach((leg, legIndex) => {
    lines.push(`- Leg ${leg.leg_no ?? legIndex + 1}`);
    (leg.trades ?? []).forEach((trade, tradeIndex) => {
      lines.push(`  - Trade ${tradeIndex + 1}`);
      lines.push(`    - Trade ID: ${formatTradeLogValue(trade.id)}`);
      lines.push(`    - Option: ${formatTradeLogValue(trade.option)}`);
      lines.push(`    - Trade Strike: ${formatTradeLogValue(trade.trade_strike)}`);
      lines.push(`    - Quantity: ${formatTradeLogValue(trade.quantity)}`);
      lines.push(`    - Entry Reason: ${formatTradeLogValue(trade.entry_reason)}`);
      lines.push(`    - Exit Reason: ${formatTradeLogValue(trade.exit_reason)}`);
      lines.push(`    - Entry Time: ${formatTradeLogValue(trade.entry_time)}`);
      lines.push(`    - Entry Price: ${formatTradeLogAmount(trade.entry_price)}`);
      lines.push(`    - Exit Time: ${formatTradeLogValue(trade.exit_time)}`);
      lines.push(`    - Exit Price: ${formatTradeLogAmount(trade.exit_price)}`);
      lines.push(`    - PL: ${formatTradeLogAmount(trade.pl)}`);
    });
  });

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function appendTradeLogEntry(record: NonNullable<TradeLogRequest['record']>, action: 'create' | 'update') {
  await mkdir(dirname(tradeLogPath), { recursive: true });
  await appendFile(tradeLogPath, formatTradeLogRecord(record, action), { encoding: 'utf-8' });
}

function readRequestBody(request: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function readStoredKiteSession(): Promise<KiteSession | null> {
  try {
    const tokenFile = JSON.parse(await readFile(externalKiteTokenPath, 'utf-8')) as KiteTokenFile;
    const accessToken = tokenFile.access_token ?? tokenFile.accessToken ?? null;

    if (accessToken) {
      return {
        access_token: accessToken,
        public_token: null,
        user_name: tokenFile.user_name ?? null,
        user_id: tokenFile.user_id ?? null,
        login_time: tokenFile.login_time ?? tokenFile.login_date ?? null,
      };
    }
  } catch {
    // Fall back to the local session file below.
  }

  try {
    const session = JSON.parse(await readFile(kiteSessionPath, 'utf-8')) as KiteSession & {
      accessToken?: string;
      loginTime?: string | null;
      userName?: string | null;
      userId?: string | null;
    };

    if (session.access_token) return session;
    if (!session.accessToken) return null;

    return {
      access_token: session.accessToken,
      public_token: null,
      user_name: session.userName ?? null,
      user_id: session.userId ?? null,
      login_time: session.loginTime ?? null,
    };
  } catch {
    return null;
  }
}

async function writeKiteSession(session: KiteSession) {
  const loginTime = session.login_time ?? new Date().toISOString();
  const tokenFile: KiteTokenFile = {
    access_token: session.access_token,
    login_date: loginTime,
    login_time: loginTime,
    user_name: session.user_name,
    user_id: session.user_id,
  };

  await mkdir(dirname(externalKiteTokenPath), { recursive: true });
  await writeFile(externalKiteTokenPath, JSON.stringify(tokenFile, null, 2), { encoding: 'utf-8' });
  await writeFile(kiteSessionPath, JSON.stringify(session, null, 2), { encoding: 'utf-8' });
}

async function fetchKiteProfile(apiKey: string, session: KiteSession | null) {
  if (!session?.access_token) {
    return {
      profileStatus: 'not_available',
      userName: session?.user_name ?? null,
      userId: session?.user_id ?? null,
      message: 'Access token is not available.',
    };
  }

  const profileResponse = await fetch('https://api.kite.trade/user/profile', {
    method: 'GET',
    headers: {
      Authorization: `token ${apiKey}:${session.access_token}`,
      'X-Kite-Version': '3',
    },
  });
  const profile = (await profileResponse.json()) as KiteProfileResponse;

  if (!profileResponse.ok || profile.status !== 'success') {
    return {
      profileStatus: 'error',
      userName: session.user_name,
      userId: session.user_id,
      message: profile.message || `Kite profile failed with HTTP ${profileResponse.status}.`,
      errorType: profile.error_type ?? null,
    };
  }

  return {
    profileStatus: 'success',
    userName: profile.data?.user_name ?? session.user_name,
    userId: profile.data?.user_id ?? session.user_id,
    message: 'Kite profile retrieved.',
  };
}

function getKiteAuthHeaders(apiKey: string, session: KiteSession) {
  return {
    Authorization: `token ${apiKey}:${session.access_token}`,
    'X-Kite-Version': '3',
  };
}

function toKolkataDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
  };
}

function getLastCompletedWeekday() {
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() - 1);

  for (let offset = 0; offset < 7; offset += 1) {
    const parts = toKolkataDateParts(cursor);
    if (parts.weekday !== 'Sat' && parts.weekday !== 'Sun') return parts.date;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return toKolkataDateParts(cursor).date;
}

function validateCandle(candle: unknown): ValidatedCandle | null {
  if (!Array.isArray(candle) || candle.length < 6) return null;

  const [timestamp, open, high, low, close, volume] = candle;
  if (
    typeof timestamp !== 'string' ||
    typeof open !== 'number' ||
    typeof high !== 'number' ||
    typeof low !== 'number' ||
    typeof close !== 'number' ||
    typeof volume !== 'number'
  ) {
    return null;
  }

  return { timestamp, open, high, low, close, volume };
}

function validateStoredCandle(candle: unknown): ValidatedCandle | null {
  if (!candle || typeof candle !== 'object') return null;

  const candidate = candle as Record<string, unknown>;
  if (
    typeof candidate.timestamp !== 'string' ||
    typeof candidate.open !== 'number' ||
    typeof candidate.high !== 'number' ||
    typeof candidate.low !== 'number' ||
    typeof candidate.close !== 'number' ||
    typeof candidate.volume !== 'number'
  ) {
    return null;
  }

  return {
    timestamp: candidate.timestamp,
    open: candidate.open,
    high: candidate.high,
    low: candidate.low,
    close: candidate.close,
    volume: candidate.volume,
  };
}

function createHistoricalMetadata(candles: ValidatedCandle[], lastUpdate = ''): HistoricalMetadata {
  const sortedCandles = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    symbol: historicalSymbol,
    instrument_token: niftyInstrumentToken,
    timeframe: historicalInterval,
    first_candle: sortedCandles[0]?.timestamp ?? '',
    last_candle: sortedCandles.at(-1)?.timestamp ?? '',
    total_records: sortedCandles.length,
    last_update: lastUpdate,
  };
}

function updateHistoricalMetadata(
  existingMetadata: HistoricalMetadata | null,
  newCandles: ValidatedCandle[],
  recordsAdded: number,
): HistoricalMetadata {
  const sortedCandles = [...newCandles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    symbol: historicalSymbol,
    instrument_token: niftyInstrumentToken,
    timeframe: historicalInterval,
    first_candle: existingMetadata?.first_candle || sortedCandles[0]?.timestamp || '',
    last_candle: sortedCandles.at(-1)?.timestamp || existingMetadata?.last_candle || '',
    total_records: (existingMetadata?.total_records ?? 0) + recordsAdded,
    last_update: new Date().toISOString(),
  };
}

function addMinutesToKiteTimestamp(timestamp: string, minutes: number) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  parsed.setMinutes(parsed.getMinutes() + minutes);
  return toKolkataDateTime(parsed);
}

function toKolkataDateTime(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function getCurrentKolkataDate() {
  return toKolkataDateParts(new Date()).date;
}

function getDownloadWindow(metadata: HistoricalMetadata | null) {
  const lastCandle = metadata?.last_candle || null;
  const from = lastCandle ? addMinutesToKiteTimestamp(lastCandle, 3) : `${historicalStartDate} 09:15:00`;
  const to = `${getCurrentKolkataDate()} 15:30:00`;

  return {
    from,
    to,
    lastCandle,
    shouldDownload: Boolean(from && from <= to),
  };
}

function snapshotToHistoricalMetadata(snapshot: HistoricalDbSnapshot): HistoricalMetadata {
  return {
    symbol: historicalSymbol,
    instrument_token: niftyInstrumentToken,
    timeframe: historicalInterval,
    first_candle: snapshot.firstCandle || '',
    last_candle: snapshot.lastCandle || '',
    total_records: snapshot.records ?? 0,
    last_update: '',
  };
}

function runPythonJsonCommand(
  args: string[],
  input = '',
  extraEnv: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const normalizedArgs = args[0]?.startsWith('-') ? args.slice(1) : args;
    const child = spawn(pythonCommand, normalizedArgs, {
      windowsHide: true,
      env: {
        ...process.env,
        ...extraEnv,
      },
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(stderr.trim() || `Python command failed with exit code ${code}.`);
      (error as Error & { stdout?: string; stderr?: string; code?: number }).stdout = stdout;
      (error as Error & { stdout?: string; stderr?: string; code?: number }).stderr = stderr;
      (error as Error & { stdout?: string; stderr?: string; code?: number }).code = code ?? undefined;
      reject(error);
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function readHistoricalDatabaseSnapshot(supabaseClient: ReturnType<typeof createClient> | null): Promise<HistoricalDbSnapshot> {
  if (!supabaseClient) {
    return {
      status: 'error',
      message: 'Supabase is not configured.',
    };
  }

  try {
    const { data, error } = await supabaseClient
      .schema('ideal_trades')
      .from('nifty_market_state')
      .select('first_candle,last_candle,total_records,last_update')
      .eq('state_key', historicalStateKey)
      .limit(1);

    if (error) {
      return {
        status: 'error',
        message: error.message ?? 'Failed to read the historical snapshot from Supabase.',
      };
    }

    const row = Array.isArray(data) ? (data[0] as Partial<NiftyMarketStateRow> | undefined) : undefined;
    return {
      status: 'success',
      dbPath: 'ideal_trades.nifty_market_state',
      records: row?.total_records ?? 0,
      firstCandle: row?.first_candle ?? '',
      lastCandle: row?.last_candle ?? '',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to read the historical snapshot from Supabase.',
    };
  }
}

async function updateHistoricalDatabase(candles: ValidatedCandle[]): Promise<HistoricalDbBuildResult> {
  if (candles.length === 0) {
    return {
      status: 'success',
      dbPath: 'ideal_trades.ema_intraday_candles',
      records: 0,
    };
  }

  try {
    const { stdout } = await runPythonJsonCommand(
      ['-3', historicalSyncScriptPath],
      JSON.stringify(candles),
    );
    const parsed = JSON.parse(stdout.trim()) as HistoricalDbBuildResult;
    return {
      ...parsed,
      dbPath: parsed.dbPath ?? 'ideal_trades.ema_intraday_candles',
      records: parsed.records ?? parsed.recordsUpserted ?? parsed.database?.records ?? candles.length,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'stdout' in error && typeof error.stdout === 'string' && error.stdout.trim()) {
      try {
        const parsed = JSON.parse(error.stdout.trim()) as HistoricalDbBuildResult;
        return {
          ...parsed,
          dbPath: parsed.dbPath ?? 'ideal_trades.ema_intraday_candles',
          records: parsed.records ?? parsed.recordsUpserted ?? parsed.database?.records ?? candles.length,
        };
      } catch {
        // Fall through to a normal error response.
      }
    }

    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to update historical database.',
    };
  }
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function parseKolkataDateTime(timestamp: string) {
  const isoLike = timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}+05:30`;
  const parsed = new Date(isoLike);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toKiteDateTimeParam(date: Date) {
  return toKolkataDateTime(date);
}

function buildDownloadChunks(from: string, to: string) {
  const fromDate = parseKolkataDateTime(from);
  const toDate = parseKolkataDateTime(to);
  if (!fromDate || !toDate || fromDate > toDate) return [];

  const chunks: { from: string; to: string }[] = [];
  let cursor = fromDate;

  while (cursor <= toDate) {
    const chunkEnd = addDays(cursor, historicalChunkDays);
    const boundedEnd = chunkEnd < toDate ? chunkEnd : toDate;
    chunks.push({
      from: toKiteDateTimeParam(cursor),
      to: toKiteDateTimeParam(boundedEnd),
    });
    cursor = addMinutesToDate(boundedEnd, 3);
  }

  return chunks;
}

function addMinutesToDate(date: Date, minutes: number) {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
}

function mergeCandles(existingCandles: ValidatedCandle[], downloadedCandles: ValidatedCandle[]) {
  const byTimestamp = new Map<string, ValidatedCandle>();
  existingCandles.forEach((candle) => byTimestamp.set(candle.timestamp, candle));
  downloadedCandles.forEach((candle) => {
    if (!byTimestamp.has(candle.timestamp)) byTimestamp.set(candle.timestamp, candle);
  });

  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function kiteSessionPlugin(env: Record<string, string>): Plugin {
  const apiKey = env.KITE_API_KEY || env.VITE_KITE_API_KEY || defaultKiteApiKey;
  const apiSecret = env.KITE_API_SECRET || env.VITE_KITE_API_SECRET;
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  const supabaseClient =
    supabaseUrl && supabaseAnonKey
      ? createClient(supabaseUrl, supabaseAnonKey, { realtime: { transport: ws } })
      : null;

  return {
    name: 'kite-session-api',
    configureServer(server) {
      server.middlewares.use('/api/ema-intraday/trade-log', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { status: 'error', message: 'Method not allowed.' });
          return;
        }

        try {
          const rawBody = await readRequestBody(request);
          const parsed = rawBody ? (JSON.parse(rawBody) as TradeLogRequest) : {};
          if (!parsed.record) {
            sendJson(response, 400, { status: 'error', message: 'Missing trade record.' });
            return;
          }

          const action = parsed.action === 'update' ? 'update' : 'create';
          await appendTradeLogEntry(parsed.record, action);

          sendJson(response, 200, {
            status: 'success',
            message: 'Trade log updated.',
            storage: {
              logPath: tradeLogPath,
            },
          });
        } catch (error) {
          sendJson(response, 500, {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to write trade log.',
            storage: {
              logPath: tradeLogPath,
            },
          });
        }
      });

      server.middlewares.use('/api/kite/historical-candles', async (request, response) => {
        if (request.method === 'GET') {
          const storedSnapshot = await readHistoricalDatabaseSnapshot(supabaseClient);
          const metadata =
            storedSnapshot.status === 'success' && (storedSnapshot.records ?? 0) > 0
              ? snapshotToHistoricalMetadata(storedSnapshot)
              : createHistoricalMetadata([]);

          sendJson(response, 200, {
            status: 'success',
            symbol: historicalSymbol,
            exchange: 'NSE',
            timeframe: historicalTimeframeLabel,
            interval: historicalInterval,
            instrumentToken: niftyInstrumentToken,
            firstCandle: metadata.first_candle,
            lastCandle: metadata.last_candle,
            downloadStatus: 'Ready',
            metadata,
            storage: {
              stateTable: 'ideal_trades.nifty_market_state',
              candleTable: 'ideal_trades.ema_intraday_candles',
            },
          });
          return;
        }

        if (request.method !== 'POST') {
          sendJson(response, 405, { status: 'error', message: 'Method not allowed.' });
          return;
        }

        const requestTime = new Date().toISOString();

        try {
          if (!apiKey) {
            sendJson(response, 500, {
              status: 'error',
              message: 'Kite API key is not configured on the backend.',
              debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
            });
            return;
          }

          const session = await readStoredKiteSession();
          if (!session?.access_token) {
            sendJson(response, 401, {
              status: 'error',
              message: 'No active Kite session found. Generate a Kite session before fetching historical data.',
              debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
            });
            return;
          }

          const profile = await fetchKiteProfile(apiKey, session);
          if (profile.profileStatus !== 'success') {
            sendJson(response, 401, {
              status: 'error',
              message: profile.message || 'Session expired or access token is invalid.',
              profileStatus: profile.profileStatus,
              debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
            });
            return;
          }

          const databaseSnapshot = await readHistoricalDatabaseSnapshot(supabaseClient);
          const effectiveMetadata =
            databaseSnapshot.status === 'success' && (databaseSnapshot.records ?? 0) > 0
              ? snapshotToHistoricalMetadata(databaseSnapshot)
              : null;
          const downloadWindow = getDownloadWindow(effectiveMetadata);

          if (!downloadWindow.from) {
            sendJson(response, 422, {
              status: 'error',
              message: 'Unable to parse latest stored candle timestamp.',
              debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
            });
            return;
          }

          if (!downloadWindow.shouldDownload) {
            const currentMetadata = effectiveMetadata ?? createHistoricalMetadata([]);

            sendJson(response, 200, {
              status: 'success',
              symbol: historicalSymbol,
              exchange: 'NSE',
              timeframe: historicalTimeframeLabel,
              interval: historicalInterval,
              instrumentToken: niftyInstrumentToken,
              from: downloadWindow.from,
              to: downloadWindow.to,
              recordsDownloaded: 0,
              firstCandle: currentMetadata.first_candle,
              lastCandle: currentMetadata.last_candle,
              downloadStatus: 'Completed',
              metadata: currentMetadata,
              database: {
                status: 'success',
                dbPath: 'ideal_trades.ema_intraday_candles',
                records: currentMetadata.total_records,
              },
              storage: {
                stateTable: 'ideal_trades.nifty_market_state',
                candleTable: 'ideal_trades.ema_intraday_candles',
              },
              apiResponseStatus: 'not_required',
              debug: {
                requestTime,
                responseTime: new Date().toISOString(),
                candlesReturned: 0,
                apiStatus: 'not_required',
              },
            });
            return;
          }

          const downloadChunks = buildDownloadChunks(downloadWindow.from, downloadWindow.to);
          const validCandles: ValidatedCandle[] = [];
          let lastEndpoint = '';

          for (const chunk of downloadChunks) {
            const historicalUrl = new URL(`https://api.kite.trade/instruments/historical/${niftyInstrumentToken}/${historicalInterval}`);
            historicalUrl.searchParams.set('from', chunk.from);
            historicalUrl.searchParams.set('to', chunk.to);
            lastEndpoint = historicalUrl.toString();

            const historicalResponse = await fetch(historicalUrl, {
              method: 'GET',
              headers: getKiteAuthHeaders(apiKey, session),
            });
            const historical = (await historicalResponse.json()) as KiteHistoricalResponse;
            const rawCandles = historical.data?.candles ?? [];

            if (!historicalResponse.ok || historical.status !== 'success') {
              sendJson(response, historicalResponse.status || 502, {
                status: 'error',
                message: historical.message || `Historical API request failed with HTTP ${historicalResponse.status}.`,
                errorType: historical.error_type ?? null,
                instrumentToken: niftyInstrumentToken,
                endpoint: historicalUrl.toString(),
                debug: {
                  requestTime,
                  responseTime: new Date().toISOString(),
                  candlesReturned: Array.isArray(rawCandles) ? rawCandles.length : 0,
                  apiStatus: historical.status,
                },
              });
              return;
            }

            const candles = rawCandles.map(validateCandle);
            if (candles.some((candle) => candle === null)) {
              sendJson(response, 422, {
                status: 'error',
                message: 'Invalid candle structure returned by Kite.',
                instrumentToken: niftyInstrumentToken,
                endpoint: historicalUrl.toString(),
                debug: {
                  requestTime,
                  responseTime: new Date().toISOString(),
                  candlesReturned: rawCandles.length,
                  apiStatus: historical.status,
                },
              });
              return;
            }

            validCandles.push(...(candles as ValidatedCandle[]));
          }

          const missingCandles = validCandles.filter((candle) => !downloadWindow.lastCandle || candle.timestamp > downloadWindow.lastCandle);
          if (missingCandles.length === 0) {
            const currentMetadata = effectiveMetadata ?? createHistoricalMetadata([]);

            sendJson(response, 200, {
              status: 'success',
              symbol: historicalSymbol,
              exchange: 'NSE',
              timeframe: historicalTimeframeLabel,
              interval: historicalInterval,
              instrumentToken: niftyInstrumentToken,
              from: downloadWindow.from,
              to: downloadWindow.to,
              recordsDownloaded: 0,
              firstCandle: currentMetadata.first_candle,
              lastCandle: currentMetadata.last_candle,
              downloadStatus: 'Completed',
              metadata: currentMetadata,
              database: {
                status: 'success',
                dbPath: 'ideal_trades.ema_intraday_candles',
                records: currentMetadata.total_records,
              },
              storage: {
                stateTable: 'ideal_trades.nifty_market_state',
                candleTable: 'ideal_trades.ema_intraday_candles',
              },
              apiResponseStatus: 'not_required',
              debug: {
                requestTime,
                responseTime: new Date().toISOString(),
                candlesReturned: 0,
                apiStatus: 'not_required',
              },
            });
            return;
          }

          const database = await updateHistoricalDatabase(missingCandles);
          if (database.status !== 'success') {
            sendJson(response, 500, {
              status: 'error',
              message: database.message || 'Historical candles were downloaded, but database update failed.',
              metadata: effectiveMetadata ?? createHistoricalMetadata([]),
              storage: {
                stateTable: 'ideal_trades.nifty_market_state',
                candleTable: 'ideal_trades.ema_intraday_candles',
              },
              debug: {
                requestTime,
                responseTime: new Date().toISOString(),
                candlesReturned: missingCandles.length,
                apiStatus: 'error',
              },
            });
            return;
          }

          const nextMetadata =
            database.metadata ??
            updateHistoricalMetadata(effectiveMetadata, missingCandles, database.records ?? missingCandles.length);

          sendJson(response, 200, {
            status: 'success',
            symbol: historicalSymbol,
            exchange: 'NSE',
            timeframe: historicalTimeframeLabel,
            interval: historicalInterval,
            instrumentToken: niftyInstrumentToken,
            from: downloadWindow.from,
            to: downloadWindow.to,
            recordsDownloaded: database.records ?? missingCandles.length,
            firstCandle: nextMetadata.first_candle,
            lastCandle: nextMetadata.last_candle,
            downloadStatus: 'Completed',
            metadata: nextMetadata,
            database,
            storage: {
              stateTable: 'ideal_trades.nifty_market_state',
              candleTable: 'ideal_trades.ema_intraday_candles',
            },
            apiResponseStatus: 'success',
            endpoint: lastEndpoint,
            chunksDownloaded: downloadChunks.length,
            debug: {
              requestTime,
              responseTime: new Date().toISOString(),
              candlesReturned: missingCandles.length,
              apiStatus: 'success',
            },
          });
        } catch (error) {
          sendJson(response, 502, {
            status: 'error',
            message: error instanceof Error ? error.message : 'Network failure while fetching historical data.',
            debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
          });
        }
      });

      server.middlewares.use('/api/kite/historical-test', async (request, response) => {
        if (request.method !== 'GET') {
          sendJson(response, 405, { status: 'error', message: 'Method not allowed.' });
          return;
        }

        const requestTime = new Date().toISOString();

        try {
          if (!apiKey) {
            sendJson(response, 500, {
              status: 'error',
              message: 'Kite API key is not configured on the backend.',
              debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
            });
            return;
          }

          const session = await readStoredKiteSession();
          if (!session?.access_token) {
            sendJson(response, 401, {
              status: 'error',
              message: 'No active Kite session found. Generate a Kite session before testing historical data.',
              debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
            });
            return;
          }

          const profile = await fetchKiteProfile(apiKey, session);
          if (profile.profileStatus !== 'success') {
            sendJson(response, 401, {
              status: 'error',
              message: profile.message || 'Session expired or access token is invalid.',
              profileStatus: profile.profileStatus,
              debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
            });
            return;
          }

          const instrumentKey = 'NSE:NIFTY 50';
          const quoteUrl = `https://api.kite.trade/quote/ltp?i=${encodeURIComponent(instrumentKey)}`;
          const quoteResponse = await fetch(quoteUrl, {
            method: 'GET',
            headers: getKiteAuthHeaders(apiKey, session),
          });
          const quote = (await quoteResponse.json()) as KiteQuoteLtpResponse;
          const instrumentToken = quote.data?.[instrumentKey]?.instrument_token;

          if (!quoteResponse.ok || quote.status !== 'success' || !instrumentToken) {
            sendJson(response, quoteResponse.status || 502, {
              status: 'error',
              message: quote.message || 'Instrument token lookup failed for NSE:NIFTY 50.',
              errorType: quote.error_type ?? null,
              debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: quote.status },
            });
            return;
          }

          const tradingDate = getLastCompletedWeekday();
          const from = `${tradingDate} 09:15:00`;
          const to = `${tradingDate} 15:30:00`;
          const historicalUrl = new URL(`https://api.kite.trade/instruments/historical/${instrumentToken}/3minute`);
          historicalUrl.searchParams.set('from', from);
          historicalUrl.searchParams.set('to', to);

          const historicalResponse = await fetch(historicalUrl, {
            method: 'GET',
            headers: getKiteAuthHeaders(apiKey, session),
          });
          const historical = (await historicalResponse.json()) as KiteHistoricalResponse;
          const rawCandles = historical.data?.candles ?? [];

          if (!historicalResponse.ok || historical.status !== 'success') {
            sendJson(response, historicalResponse.status || 502, {
              status: 'error',
              message: historical.message || `Historical API request failed with HTTP ${historicalResponse.status}.`,
              errorType: historical.error_type ?? null,
              instrumentToken,
              endpoint: historicalUrl.toString(),
              debug: {
                requestTime,
                responseTime: new Date().toISOString(),
                candlesReturned: Array.isArray(rawCandles) ? rawCandles.length : 0,
                apiStatus: historical.status,
              },
            });
            return;
          }

          const candles = rawCandles.map(validateCandle);
          if (!rawCandles.length || candles.some((candle) => candle === null)) {
            sendJson(response, 422, {
              status: 'error',
              message: rawCandles.length ? 'Invalid candle structure returned by Kite.' : 'Historical API returned no candles.',
              instrumentToken,
              endpoint: historicalUrl.toString(),
              debug: {
                requestTime,
                responseTime: new Date().toISOString(),
                candlesReturned: rawCandles.length,
                apiStatus: historical.status,
              },
            });
            return;
          }

          const validCandles = candles as ValidatedCandle[];
          const firstCandle = validCandles[0];
          const lastCandle = validCandles[validCandles.length - 1];

          sendJson(response, 200, {
            status: 'success',
            symbol: 'NIFTY 50',
            exchange: 'NSE',
            timeframe: '3 Minute',
            interval: '3minute',
            tradingDate,
            instrumentToken,
            endpoint: historicalUrl.toString(),
            totalCandlesReturned: validCandles.length,
            firstCandleTimestamp: firstCandle.timestamp,
            lastCandleTimestamp: lastCandle.timestamp,
            sampleCandle: firstCandle,
            apiResponseStatus: historical.status,
            debug: {
              requestTime,
              responseTime: new Date().toISOString(),
              candlesReturned: validCandles.length,
              apiStatus: historical.status,
            },
          });
        } catch (error) {
          sendJson(response, 502, {
            status: 'error',
            message: error instanceof Error ? error.message : 'Network failure while testing historical data.',
            debug: { requestTime, responseTime: new Date().toISOString(), candlesReturned: 0, apiStatus: 'error' },
          });
        }
      });

      server.middlewares.use('/api/kite/session', async (request, response) => {
        try {
          if (request.method === 'GET') {
            const session = await readStoredKiteSession();
            let profileStatus = 'not_available';
            let profileMessage = session?.access_token ? 'API key is not configured.' : 'Access token is not available.';
            let userName = session?.user_name ?? null;
            let userId = session?.user_id ?? null;

            if (apiKey && session?.access_token) {
              const profile = await fetchKiteProfile(apiKey, session);
              profileStatus = profile.profileStatus;
              profileMessage = profile.message;
              userName = profile.userName;
              userId = profile.userId;
            }

            sendJson(response, 200, {
              connected: Boolean(session?.access_token && profileStatus !== 'error'),
              accessTokenStatus: session?.access_token ? 'Stored' : 'Not Generated',
              accessTokenAvailable: Boolean(session?.access_token),
              apiKeyConfigured: Boolean(apiKey),
              apiSecretConfigured: Boolean(apiSecret),
              loginUrl: apiKey ? getKiteLoginUrl(apiKey) : null,
              loginTime: session?.login_time ?? null,
              userName,
              userId,
              profileStatus,
              profileMessage,
            });
            return;
          }

          if (request.method !== 'POST') {
            sendJson(response, 405, { connected: false, message: 'Method not allowed.' });
            return;
          }

          if (!apiKey || !apiSecret) {
            sendJson(response, 500, {
              connected: false,
              message: 'Kite API secret is not configured on the backend. Set KITE_API_SECRET in Helper/App/.env or .env.local.',
            });
            return;
          }

          const body = await readRequestBody(request);
          const parsedBody = JSON.parse(body || '{}') as { requestToken?: string; request_token?: string };
          const requestToken = (parsedBody.requestToken ?? parsedBody.request_token)?.trim();

          if (!requestToken) {
            sendJson(response, 400, { connected: false, message: 'Missing request_token.' });
            return;
          }

          const checksum = createHash('sha256').update(`${apiKey}${requestToken}${apiSecret}`).digest('hex');
          const kiteResponse = await fetch('https://api.kite.trade/session/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Kite-Version': '3',
            },
            body: new URLSearchParams({
              api_key: apiKey,
              request_token: requestToken,
              checksum,
            }),
          });
          const kiteSessionText = await kiteResponse.text();
          let kiteSession: KiteSessionResponse;

          try {
            kiteSession = JSON.parse(kiteSessionText) as KiteSessionResponse;
          } catch {
            sendJson(response, 502, {
              connected: false,
              message: `Kite session token endpoint returned non-JSON response with HTTP ${kiteResponse.status}.`,
              rawResponse: kiteSessionText.slice(0, 500),
            });
            return;
          }

          if (!kiteResponse.ok || kiteSession.status !== 'success' || !kiteSession.data?.access_token) {
            const message =
              kiteSession.message ||
              (kiteResponse.status === 403
                ? 'Invalid or expired request_token.'
                : `Kite session generation failed with HTTP ${kiteResponse.status}.`);

            sendJson(response, kiteResponse.status || 502, {
              connected: false,
              message,
              errorType: kiteSession.error_type ?? null,
            });
            return;
          }

          const session: KiteSession = {
            access_token: kiteSession.data.access_token,
            public_token: kiteSession.data.public_token ?? null,
            login_time: kiteSession.data.login_time ?? new Date().toISOString(),
            user_name: kiteSession.data.user_name ?? null,
            user_id: kiteSession.data.user_id ?? null,
          };

          const profile = await fetchKiteProfile(apiKey, session);
          if (profile.profileStatus !== 'success') {
            sendJson(response, 502, {
              connected: false,
              message: profile.message || 'Kite profile validation failed after token generation.',
              profileStatus: profile.profileStatus,
              errorType: 'errorType' in profile ? profile.errorType : null,
            });
            return;
          }

          session.user_name = profile.userName;
          session.user_id = profile.userId;
          await writeKiteSession(session);

          sendJson(response, 200, {
            connected: true,
            accessTokenStatus: 'Generated',
            accessTokenAvailable: true,
            apiKeyConfigured: true,
            apiSecretConfigured: true,
            loginUrl: getKiteLoginUrl(apiKey),
            loginTime: session.login_time,
            userName: session.user_name,
            userId: session.user_id,
            profileStatus: profile.profileStatus,
            profileMessage: profile.message,
            message: 'Connected To Kite',
          });
        } catch (error) {
          sendJson(response, 502, {
            connected: false,
            message: error instanceof Error ? error.message : 'Network error while connecting to Kite.',
          });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  envDir: appRoot,
  server: {
    host: '0.0.0.0',
    port: 6776,
    strictPort: true,
    open: 'http://localhost:6776',
  },
  resolve: {
    alias: {
      '@supabase/supabase-js': fileURLToPath(new URL('./node_modules/@supabase/supabase-js/dist/index.mjs', import.meta.url)),
    },
  },
  plugins: [react(), kiteSessionPlugin(loadEnv(mode, appRoot, ''))],
}));
