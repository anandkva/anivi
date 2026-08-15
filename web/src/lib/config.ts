/**
 * Endpoint configuration.
 *
 * VITE_WS_URL is the only variable that has to be set in production, e.g.
 * `wss://api.anivi.app/ws`. The REST base used for pairing and the widget
 * snapshot is derived from it unless VITE_API_URL overrides it. Nothing here
 * hardcodes a production host.
 */

const rawWs = (import.meta.env.VITE_WS_URL ?? '').trim();
const rawApi = (import.meta.env.VITE_API_URL ?? '').trim();

/** Falls back to the dev server on the machine serving the page. */
function defaultWsUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = location.hostname || 'localhost';
  return `${scheme}://${host}:8080/ws`;
}

export const WS_URL = rawWs || defaultWsUrl();

export const API_URL =
  rawApi ||
  WS_URL.replace(/^ws/, 'http').replace(/\/ws\/?$/, '') ||
  '';

export function apiUrl(path: string): string {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
