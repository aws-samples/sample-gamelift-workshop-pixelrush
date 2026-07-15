// REST client for the backend. Same-origin via CloudFront (/api/*) in the
// deployed setup; override with ?api= or config.json apiUrl for local dev
// against a raw execute-api endpoint.
import { setFleetRegions } from './latency';

export interface Player {
  playerId: string; name: string; level: number; coins: number;
  titles: string[]; ownedCars: string[]; selectedCar: string; completedTracks: string[];
}
export interface ShopCar {
  carId: string; name: string; price: number; speedBonus: number;
  handling: number; description: string; owned: boolean; affordable: boolean; selected?: boolean;
}
export interface TrackInfo {
  trackId: string; name: string; difficulty: number; order: number; laps: number;
  requiresTrackId: string | null; description: string; unlocked: boolean; completed: boolean;
}
export interface LeaderboardEntry { rank: number; playerId: string; playerName: string; bestTimeMs: number }

let apiBase = '/api';
let wsNotifyUrl = '';
let customHeaders: Record<string, string> = {};

// ---- Arena selection: the unified frontend can point at any deployment ----
// AWS Arena  = same-origin CloudFront (/api proxy injects x-origin-verify).
// Custom     = a student's own BackendStack execute-api URL; the browser
//              calls it directly and sends x-origin-verify itself (all
//              workshop stacks deploy with the same default secret).
const ARENA_KEY = 'pixelrush_arena';
const WORKSHOP_ORIGIN_SECRET = 'pixelrush-origin-verify';

export interface ArenaChoice {
  kind: 'aws' | 'custom';
  apiUrl?: string;   // custom only: https://xxxx.execute-api.<region>.amazonaws.com
  name?: string;     // discovered arena name
}

export function loadArena(): ArenaChoice {
  try {
    const raw = localStorage.getItem(ARENA_KEY);
    if (raw) return JSON.parse(raw) as ArenaChoice;
  } catch { /* corrupt */ }
  return { kind: 'aws' };
}

export function saveArena(a: ArenaChoice): void {
  localStorage.setItem(ARENA_KEY, JSON.stringify(a));
}

/**
 * Validates a custom arena URL by fetching its /api/info. Returns the arena
 * descriptor on success; throws with a friendly message otherwise.
 */
export async function probeArena(apiUrl: string): Promise<{ arena: string; wsNotifyUrl: string; fleetRegions: string[] }> {
  const base = apiUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/api/info`, {
    headers: { 'x-origin-verify': WORKSHOP_ORIGIN_SECRET },
  });
  if (!res.ok) throw new Error(`arena responded HTTP ${res.status}`);
  const info = await res.json();
  if (info.game !== 'pixelrush') throw new Error('not a PixelRush arena');
  return {
    arena: info.arena ?? 'custom-arena',
    wsNotifyUrl: info.wsNotifyUrl ?? '',
    fleetRegions: Array.isArray(info.fleetRegions) ? info.fleetRegions : [],
  };
}

export async function initConfig(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const override = params.get('api');
  if (override) apiBase = override.replace(/\/$/, '');
  const wsOverride = params.get('notify');
  if (wsOverride) wsNotifyUrl = wsOverride;
  if (override && wsOverride) return;

  const arena = loadArena();
  if (arena.kind === 'custom' && arena.apiUrl) {
    apiBase = `${arena.apiUrl.replace(/\/+$/, '')}/api`;
    customHeaders = { 'x-origin-verify': WORKSHOP_ORIGIN_SECRET };
    try {
      const info = await probeArena(arena.apiUrl);
      wsNotifyUrl = info.wsNotifyUrl;
      setFleetRegions(info.fleetRegions);
      return;
    } catch {
      // unreachable custom arena: fall back to the official one
      apiBase = '/api';
      customHeaders = {};
      saveArena({ kind: 'aws' });
    }
  }
  try {
    const cfg = await (await fetch('/config.json')).json();
    if (!override && cfg.apiUrl) apiBase = (cfg.apiUrl as string).replace(/\/$/, '');
    if (!wsOverride && cfg.wsNotifyUrl) wsNotifyUrl = cfg.wsNotifyUrl;
  } catch { /* no config.json: same-origin /api (CloudFront) */ }
  // Discover this deployment's WS notify URL + fleet regions. The official
  // (AWS) arena has no config.json, so /api/info is the ONLY source of
  // wsNotifyUrl here — without it the world-chat/matchmaking socket never
  // connects (no join announcements, matchmaking pushes never arrive).
  try {
    const info = await (await fetch(`${apiBase}/info`, { headers: customHeaders })).json();
    if (!wsOverride && info.wsNotifyUrl) wsNotifyUrl = info.wsNotifyUrl;
    if (Array.isArray(info.fleetRegions)) setFleetRegions(info.fleetRegions);
  } catch { /* /api/info unavailable: keep default probe set */ }
}

export function getNotifyUrl(): string { return wsNotifyUrl; }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...customHeaders, ...init?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  login: (name: string, password: string) =>
    call<{ player: Player; isNew: boolean }>('/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
  profile: (playerId: string) =>
    call<{ player: Player }>(`/profile?playerId=${playerId}`),
  garage: (playerId: string) =>
    call<{ cars: ShopCar[] }>(`/garage?playerId=${playerId}`),
  selectCar: (playerId: string, carId: string) =>
    call<{ selectedCar: string }>('/garage/select', { method: 'POST', body: JSON.stringify({ playerId, carId }) }),
  shop: (playerId: string) =>
    call<{ cars: ShopCar[]; coins: number }>(`/shop?playerId=${playerId}`),
  buy: (playerId: string, carId: string) =>
    call<{ player: Player; bought: string }>('/shop/buy', { method: 'POST', body: JSON.stringify({ playerId, carId }) }),
  tracks: (playerId: string) =>
    call<{ tracks: TrackInfo[] }>(`/tracks?playerId=${playerId}`),
  leaderboard: (trackId: string) =>
    call<{ entries: LeaderboardEntry[] }>(`/leaderboard?trackId=${trackId}`),
  // connection is present only in Module 4 "open placement" mode, where the
  // backend seats the player synchronously; FlexMatch modes return just a
  // ticketId and push the connection later over the notify WebSocket.
  requestMatchmaking: (playerId: string, trackId: string, matchSize: number, latencies?: Record<string, number>) =>
    call<{ ticketId: string; connection?: { ipAddress: string; dnsName: string; port: number; playerSessionId: string } }>(
      '/matchmaking/request', { method: 'POST', body: JSON.stringify({ playerId, trackId, matchSize, latencies }) }),
  raceReward: (playerId: string, position: number) =>
    call<{ coinsAwarded: number; coins?: number }>('/race-reward', { method: 'POST', body: JSON.stringify({ playerId, position }) }),
  matchStatus: (ticketId: string) =>
    call<{ status: string; connection: { ipAddress: string; dnsName: string; port: number; playerSessionId: string } | null }>(
      `/matchmaking/status?ticketId=${encodeURIComponent(ticketId)}`),
};
