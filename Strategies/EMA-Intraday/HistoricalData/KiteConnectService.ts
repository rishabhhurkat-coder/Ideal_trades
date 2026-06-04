import type { KiteAuthState, KiteSessionStatusResponse, KiteTokenExchangeResponse } from './types';

const KITE_AUTH_STORAGE_KEY = 'ideal-trades.ema-intraday.kite-auth';
const DEFAULT_TOKEN_ENDPOINT = '/api/kite/session';
export const DEFAULT_KITE_LOGIN_URL = 'https://kite.zerodha.com/connect/login?api_key=zz9755o0bpmqlz0u&v=3';

function getStoredAuthStateFromCookie(): KiteAuthState | null {
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${KITE_AUTH_STORAGE_KEY}=`));
  if (!cookie) return null;

  try {
    return JSON.parse(decodeURIComponent(cookie.split('=')[1])) as KiteAuthState;
  } catch {
    return null;
  }
}

function getStoredAuthState(): KiteAuthState | null {
  let stored: string | null = null;

  try {
    stored = window.localStorage.getItem(KITE_AUTH_STORAGE_KEY);
  } catch {
    return getStoredAuthStateFromCookie();
  }

  if (!stored) return getStoredAuthStateFromCookie();

  try {
    return JSON.parse(stored) as KiteAuthState;
  } catch {
    try {
      window.localStorage.removeItem(KITE_AUTH_STORAGE_KEY);
    } catch {
      // Ignore blocked localStorage cleanup.
    }
    return null;
  }
}

function storeAuthState(authState: KiteAuthState) {
  const serializedAuthState = JSON.stringify(authState);

  try {
    window.localStorage.setItem(KITE_AUTH_STORAGE_KEY, serializedAuthState);
  } catch {
    // Cookie fallback keeps the test token visible after refresh when localStorage is blocked.
  }

  document.cookie = `${KITE_AUTH_STORAGE_KEY}=${encodeURIComponent(serializedAuthState)}; path=/; SameSite=Lax`;
}

export class KiteConnectService {
  private authState: KiteAuthState = {
    requestToken: null,
    connected: false,
    authenticatedAt: null,
    status: 'not_connected',
    message: null,
    accessTokenStatus: null,
    userName: null,
    userId: null,
  };

  constructor() {
    const storedAuthState = getStoredAuthState();
    if (storedAuthState) this.authState = storedAuthState;
  }

  getAuthState(): KiteAuthState {
    return this.authState;
  }

  async startLogin(preopenedWindow: Window | null = null) {
    const sessionStatus = await this.getSessionStatus();
    const loginUrl = sessionStatus.loginUrl ?? DEFAULT_KITE_LOGIN_URL;

    if (!loginUrl) {
      preopenedWindow?.close();
      throw new Error(
        sessionStatus.apiKeyConfigured
          ? 'Kite login URL is not available.'
          : 'Kite API key is not configured on the backend.',
      );
    }

    if (preopenedWindow) {
      preopenedWindow.opener = null;
      preopenedWindow.location.href = loginUrl;
      return;
    }

    const loginWindow = window.open(loginUrl, '_blank', 'noopener,noreferrer');
    if (!loginWindow) {
      throw new Error('Kite login popup was blocked by the browser.');
    }
  }

  setRequestToken(requestToken: string, message: string | null = null): KiteAuthState {
    this.authState = {
      requestToken,
      connected: false,
      authenticatedAt: new Date().toISOString(),
      status: 'request_token_received',
      message: message ?? 'Request token received.',
      accessTokenStatus: 'Not Generated',
      userName: null,
      userId: null,
    };
    storeAuthState(this.authState);

    return this.authState;
  }

  async exchangeRequestToken(requestToken: string): Promise<KiteAuthState> {
    this.setRequestToken(requestToken, 'Generating Kite access token.');

    const tokenEndpoint =
      (import.meta.env.VITE_KITE_TOKEN_ENDPOINT as string | undefined) ?? DEFAULT_TOKEN_ENDPOINT;

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ request_token: requestToken }),
    });
    const result = (await response.json()) as KiteTokenExchangeResponse;

    if (!response.ok || !result.connected) {
      throw new Error(result.message ?? `Kite token exchange failed with HTTP ${response.status}.`);
    }

    this.authState = {
      requestToken,
      connected: true,
      authenticatedAt: result.loginTime ?? new Date().toISOString(),
      status: 'connected',
      message: result.message ?? 'Connected To Kite',
      accessTokenStatus: result.accessTokenStatus ?? 'Generated',
      userName: result.userName ?? null,
      userId: result.userId ?? null,
    };
    storeAuthState(this.authState);

    return this.authState;
  }

  async getSessionStatus(): Promise<KiteSessionStatusResponse> {
    const tokenEndpoint =
      (import.meta.env.VITE_KITE_TOKEN_ENDPOINT as string | undefined) ?? DEFAULT_TOKEN_ENDPOINT;

    const response = await fetch(tokenEndpoint, {
      method: 'GET',
      credentials: 'include',
    });
    const result = (await response.json()) as KiteSessionStatusResponse;

    if (!response.ok) {
      throw new Error(result.message ?? `Kite connection verification failed with HTTP ${response.status}.`);
    }

    return result;
  }

  async verifyConnection(): Promise<KiteAuthState> {
    const result = await this.getSessionStatus();

    this.authState = {
      ...this.authState,
      connected: result.connected,
      authenticatedAt: result.loginTime ?? this.authState.authenticatedAt,
      status: result.connected ? 'connected' : this.authState.requestToken ? 'request_token_received' : 'not_connected',
      message:
        result.message ??
        result.profileMessage ??
        (result.connected ? 'Connected To Kite' : this.authState.message),
      accessTokenStatus: result.accessTokenStatus ?? this.authState.accessTokenStatus,
      userName: result.userName ?? this.authState.userName,
      userId: result.userId ?? this.authState.userId,
    };
    storeAuthState(this.authState);

    return this.authState;
  }

  markError(message: string): KiteAuthState {
    this.authState = {
      ...this.authState,
      connected: false,
      status: 'error',
      message,
    };
    storeAuthState(this.authState);

    return this.authState;
  }
}
