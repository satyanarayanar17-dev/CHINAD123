import axios from 'axios';
import { shouldAttemptTokenRefresh, shouldRedirectToLoginPath } from '../auth/roleBoundary';
import { API_BASE_URL, buildApiUrl } from './config';

let accessToken: string | null = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

const SESSION_RESET_CODES = new Set([
  'ACCOUNT_TYPE_MISMATCH',
  'FORBIDDEN_ROLE',
  'INVALID_SESSION_SCOPE',
  'INVALID_TOKEN_SCOPE',
  'REFRESH_SCOPE_INVALID'
]);

function extractErrorCode(error: any): string | null {
  const payload = error?.response?.data?.error;
  if (typeof payload === 'string') {
    return payload;
  }

  if (payload && typeof payload.code === 'string') {
    return payload.code;
  }

  return null;
}

async function resetBrowserSession() {
  clearAccessToken();

  try {
    await axios.post(buildApiUrl('/auth/logout'), {}, { withCredentials: true });
  } catch {
    // Best-effort cleanup only.
  }

  if (shouldRedirectToLoginPath(window.location.pathname)) {
    window.location.href = '/login';
  }
}

/**
 * Base Axios instance with normalized configuration.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor: Securely attaches Bearer token if available.
 */
api.interceptors.request.use((config) => {
  if (config.headers) {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    // Safety: Ensure every single request acts as a traceable audit thread
    config.headers['X-Correlation-ID'] = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : `uuid-fallback-${Date.now()}`;
  }
  
  return config;
}, (error) => Promise.reject(error));

/**
 * Response Interceptor: Manages global error state, JSON validation, and Token Refresh.
 */
api.interceptors.response.use(
  (response) => {
    // SAFETY: Prevent SPAs/Vite from returning index.html for dead API routes.
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('text/html')) {
      return Promise.reject(new Error('API_MISHAP: Received HTML instead of JSON.'));
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // 1. LIKELY CAUSE: originalRequest protection.
    // If the error happens before the request or is a manual rejection, config can be undefined.
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // 2. RECURSION GUARD: Never try to refresh if the request was the refresh endpoint itself.
    if (originalRequest.url?.includes('/auth/refresh')) {
      // If refresh fails, we MUST logout and stop everything.
      clearAccessToken();
      if (shouldRedirectToLoginPath(window.location.pathname)) {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // 3. 403 FORBIDDEN: Role Violation Guard.
    if (error.response?.status === 403 && SESSION_RESET_CODES.has(extractErrorCode(error) || '')) {
      console.error(`[SECURITY] 403 Forbidden Role Violation. Correlation ID: ${error.response.headers?.['x-correlation-id'] || 'unknown'}`);
      await resetBrowserSession();
      return Promise.reject(new Error('Unauthorized role action detected.'));
    }

    // 4. 5xx SERVER ERROR: Observability catch
    if (error.response?.status >= 500) {
      console.error(`[CRITICAL] 5xx Server Node Failure. Correlation ID: ${error.response.headers?.['x-correlation-id'] || 'unknown'}`);
    }

    // 5. 401 RECOVERY: Only authenticated requests should attempt refresh.
    if (shouldAttemptTokenRefresh({
      status: error.response?.status,
      url: originalRequest.url,
      retried: Boolean(originalRequest._retry),
      hasAccessToken: Boolean(accessToken),
      hasAuthorizationHeader: Boolean(originalRequest.headers?.Authorization || originalRequest.headers?.authorization),
    })) {
      originalRequest._retry = true;

      try {
        /**
         * Use a clean axios instance to avoid internal interceptor conflicts.
         * withCredentials ensured for HttpOnly cookie refreshes if backend supports it.
         */
        const refreshResponse = await axios.post(
          buildApiUrl('/auth/refresh'),
          {},
          { withCredentials: true }
        );

        const newToken = refreshResponse.data?.access_token;

        if (newToken) {
          setAccessToken(newToken);

          if (!originalRequest.headers) {
            originalRequest.headers = {};
          }

          originalRequest.headers.Authorization = `Bearer ${newToken}`;

          // Re-issue the fixed request
          return api(originalRequest);
        }

        // No token returned? Treat as failure.
        throw new Error('NO_TOKEN_RETURNED');

      } catch (refreshError) {
        // Hard boot on refresh failure
        await resetBrowserSession();
        return Promise.reject(refreshError);
      }
    }

    // Standard fallthrough for non-401 or already-retried errors
    return Promise.reject(error);
  }
);
