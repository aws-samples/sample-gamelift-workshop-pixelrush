// Background region-latency probing for latency-aware match placement.
// Starts when the lobby loads (player is browsing, zero perceived cost),
// probes all fleet regions in parallel, caches results for 10 minutes.

// Default probe set; overridden at runtime by the regions the deployment's
// /api/info reports (setFleetRegions), so the client always probes exactly
// the fleet's regions — arena or a student's own single-region stack.
let fleetRegions = ['us-east-1', 'ap-southeast-1'];
export function setFleetRegions(regions: string[]): void {
  if (regions.length > 0) fleetRegions = regions;
}
const CACHE_MS = 10 * 60 * 1000;
const PROBE_TIMEOUT_MS = 2500;
const UNREACHABLE_MS = 999;

let cache: { at: number; latencies: Record<string, number> } | null = null;
let inflight: Promise<Record<string, number>> | null = null;

/**
 * One region probe: hit the region's EC2 endpoint twice — the first request
 * pays TCP+TLS setup, the second measures a clean HTTP round trip. We only
 * need relative ordering between regions, so the endpoint choice just has to
 * be region-pinned and reliable.
 */
async function probeRegion(region: string): Promise<number> {
  const url = `https://ec2.${region}.amazonaws.com/ping`;
  const once = async () => {
    const t0 = performance.now();
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return performance.now() - t0;
  };
  try {
    await once();               // warm-up: connection setup
    const a = await once();     // measured round trips
    const b = await once();
    return Math.round(Math.min(a, b));
  } catch {
    return UNREACHABLE_MS;
  }
}

/** Kick off (or reuse) a probe run; safe to call repeatedly. */
export function warmLatencyProbe(): void {
  void getLatencies();
}

export async function getLatencies(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.latencies;
  if (inflight) return inflight;
  inflight = (async () => {
    const entries = await Promise.all(
      fleetRegions.map(async (r) => [r, await probeRegion(r)] as const),
    );
    const latencies = Object.fromEntries(entries);
    cache = { at: Date.now(), latencies };
    inflight = null;
    console.info('[latency]', latencies);
    return latencies;
  })();
  return inflight;
}
