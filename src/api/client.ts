import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { shouldAttemptTokenRefresh, shouldRedirectToLoginPath } from '../auth/roleBoundary';
import { API_BASE_URL, buildApiUrl } from './config';

const LOGOUT_KEY = 'cc-session-signed-out';
export const SESSION_ENDED_EVENT = 'cc-session-ended';
let accessToken: string | null = null;
let sessionGeneration = 0;
let refreshPromise: Promise<string> | null = null;
let logoutPromise: Promise<void> | null = null;
let signedOut = false;

export function isSessionRestoreBlocked() {
  try {
    return signedOut || localStorage.getItem(LOGOUT_KEY) !== null;
  } catch {
    // An explicit sign-in may use memory while storage is unavailable, but a
    // reload starts without an access token and must never restore implicitly.
    return signedOut || accessToken === null;
  }
}
export function getAccessToken() { return accessToken; }
export function getSessionGeneration() { return sessionGeneration; }
export function setAccessToken(token: string | null) { accessToken = token; }
export function clearAccessToken() {
  accessToken = null;
  sessionGeneration++;
}
export function acceptBrowserSession(token: string) {
  sessionGeneration++;
  signedOut = false;
  try { localStorage.removeItem(LOGOUT_KEY); } catch { /* Memory-only explicit login. */ }
  accessToken = token;
}
export function beginBrowserLogout() {
  signedOut = true;
  clearAccessToken();
  // Non-secret marker only: never persist a token or patient information.
  try { localStorage.setItem(LOGOUT_KEY, String(Date.now())); } catch { /* Fail closed on next restore. */ }
  window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
}
export class LogoutPendingError extends Error {
  readonly code = 'LOGOUT_PENDING';
  constructor() { super('Server sign-out could not be confirmed.'); }
}
export function finishBrowserLogout(): Promise<void> {
  if (!logoutPromise) {
    // A rotating refresh may still set a cookie. Revoke after that request finishes,
    // and do not allow a new sign-in to race with this cleanup.
    const inFlightRefresh = refreshPromise;
    logoutPromise = (async () => {
      await inFlightRefresh?.catch(() => {});
      try {
        await axios.post(buildApiUrl('/auth/logout'), {}, { withCredentials: true, timeout: 10000 });
      } catch {
        throw new LogoutPendingError();
      }
    })().finally(() => { logoutPromise = null; });
  }
  return logoutPromise;
}
export async function prepareBrowserSignIn() {
  if (isSessionRestoreBlocked()) await finishBrowserLogout();
}

const SESSION_RESET_CODES = new Set([
  'ACCOUNT_TYPE_MISMATCH', 'INVALID_SESSION_SCOPE', 'INVALID_TOKEN_SCOPE', 'REFRESH_SCOPE_INVALID',
]);
function extractErrorCode(error: unknown): string | null {
  const payload = (error as { response?: { data?: { error?: string | { code?: string } } } }).response?.data?.error;
  return typeof payload === 'string' ? payload : payload?.code || null;
}
async function resetBrowserSession() {
  beginBrowserLogout();
  try { await finishBrowserLogout(); } catch { /* Persistent marker keeps the browser signed out. */ }
  if (shouldRedirectToLoginPath(window.location.pathname)) window.location.href = '/login';
}

export const api = axios.create({
  baseURL: API_BASE_URL, timeout: 30000, withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});
type SessionRequest = InternalAxiosRequestConfig & { _retry?: boolean; _sessionGeneration?: number };
api.interceptors.request.use((config: SessionRequest) => {
  config._sessionGeneration = sessionGeneration;
  if (accessToken) config.headers.Authorization = 'Bearer ' + accessToken;
  else delete config.headers.Authorization;
  config.headers['X-Correlation-ID'] = crypto.randomUUID();
  return config;
});
api.interceptors.response.use(
  response => {
    const contentType = response.headers['content-type'];
    if (typeof contentType === 'string' && contentType.includes('text/html'))
      return Promise.reject(new Error('API_MISHAP: Received HTML instead of JSON.'));
    return response;
  },
  async error => {
    const originalRequest = error.config as SessionRequest | undefined;
    if (!originalRequest) return Promise.reject(error);
    const generation = originalRequest._sessionGeneration ?? sessionGeneration;
    if (generation !== sessionGeneration) return Promise.reject(error);

    if (originalRequest.url?.includes('/auth/refresh')) {
      // Bootstrap renders connection failures itself; do not reload into a loop.
      if (error.response?.status === 401) clearAccessToken();
      return Promise.reject(error);
    }
    if (error.response?.status === 403 && SESSION_RESET_CODES.has(extractErrorCode(error) || '')) {
      await resetBrowserSession();
      return Promise.reject(error);
    }
    if (shouldAttemptTokenRefresh({
      status: error.response?.status, url: originalRequest.url,
      retried: Boolean(originalRequest._retry), hasAccessToken: Boolean(accessToken),
      hasAuthorizationHeader: Boolean(originalRequest.headers.Authorization),
    }) && !isSessionRestoreBlocked()) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios.post(buildApiUrl('/auth/refresh'), {}, {
            withCredentials: true, timeout: 10000,
          }).then(res => {
            const token = res.data?.access_token;
            if (!token) throw new Error('NO_TOKEN_RETURNED');
            return token as string;
          }).finally(() => { refreshPromise = null; });
        }
        const newToken = await refreshPromise;
        if (generation !== sessionGeneration || isSessionRestoreBlocked())
          throw new axios.CanceledError('Session ended while refreshing.');
        setAccessToken(newToken);
        originalRequest.headers.Authorization = 'Bearer ' + newToken;
        return api(originalRequest);
      } catch (refreshError) {
        if (generation === sessionGeneration && !isSessionRestoreBlocked())
          await resetBrowserSession();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);
