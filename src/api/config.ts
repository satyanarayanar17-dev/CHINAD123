const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (rawApiBaseUrl && rawApiBaseUrl.length > 0 ? rawApiBaseUrl : '/api/v1')
  .replace(/\/+$/, '');

export function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildSseUrl(token: string) {
  const url = new URL(buildApiUrl('/sse'), window.location.origin);
  url.searchParams.set('token', token);
  return url.toString();
}
