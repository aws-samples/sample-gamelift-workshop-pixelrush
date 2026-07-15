// Cookie-backed session: after a successful login the playerId/name persist
// for 30 days so returning players land straight in the Lobby. "switch racer"
// clears it.

const COOKIE = 'pixelrush_session';
const MAX_AGE = 30 * 24 * 3600;

export interface Session {
  playerId: string;
  name: string;
}

export function saveSession(s: Session): void {
  const value = encodeURIComponent(JSON.stringify(s));
  document.cookie = `${COOKIE}=${value}; max-age=${MAX_AGE}; path=/; SameSite=Lax`;
}

export function loadSession(): Session | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  if (!m) return null;
  try {
    const s = JSON.parse(decodeURIComponent(m[1]));
    if (typeof s.playerId === 'string' && s.playerId) return s as Session;
  } catch { /* corrupt cookie */ }
  return null;
}

export function clearSession(): void {
  document.cookie = `${COOKIE}=; max-age=0; path=/`;
}
