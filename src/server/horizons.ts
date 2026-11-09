/**
 * Server-side NASA JPL Horizons client: timeouts, retries, validation and a small
 * in-memory cache. Kept free of framework imports so it is unit-testable with a fake fetch.
 */
import { z } from "zod";
import {
  HorizonsError,
  horizonsUrl,
  parseHorizonsObserver,
  type Body,
  type EphemerisRequest,
  type EphemerisResponse,
} from "@/lib/lunar/ephemeris";

export const ephemerisQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(-80),
  lon: z.coerce.number().min(-360).max(360),
  alt: z.coerce.number().min(-15).max(15).default(0),
  days: z.coerce.number().int().min(1).max(30).default(30),
  step: z.coerce.number().int().min(1).max(24).default(6),
  /** Optional ISO start; defaults to the current UTC hour. */
  start: z.string().datetime({ offset: true }).optional(),
});
export type EphemerisQuery = z.infer<typeof ephemerisQuerySchema>;

const horizonsEnvelope = z.object({
  signature: z.object({ source: z.string(), version: z.string() }).partial().optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; value: Promise<EphemerisResponse> }>();

export function clearEphemerisCache() {
  cache.clear();
}

/** Normalise a query to a cache-friendly request (≈100 m site rounding, hourly start). */
export function toRequest(q: EphemerisQuery, now = Date.now()): EphemerisRequest {
  const start = q.start ? new Date(q.start) : new Date(now);
  start.setUTCMinutes(0, 0, 0);
  return {
    latDeg: Math.round(q.lat * 1000) / 1000,
    lonDeg: Math.round(q.lon * 1000) / 1000,
    altKm: Math.round(q.alt * 100) / 100,
    start,
    days: q.days,
    stepHours: q.step,
  };
}

async function fetchBody(body: Body, req: EphemerisRequest, fetchImpl: FetchLike) {
  const url = horizonsUrl(body, req);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: { accept: "application/json", "user-agent": "SeleneCompass/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 503 || res.status >= 500) {
        lastErr = new UpstreamError(`Horizons is unavailable (HTTP ${res.status})`, 503);
        continue;
      }
      const json = horizonsEnvelope.safeParse(await res.json().catch(() => null));
      if (!json.success) throw new UpstreamError("Horizons returned an unexpected payload", 502);
      if (!res.ok || json.data.error || json.data.message) {
        throw new UpstreamError(
          `Horizons rejected the query: ${json.data.error ?? json.data.message ?? res.status}`,
          502,
        );
      }
      const rows = parseHorizonsObserver(json.data.result ?? "");
      return { rows, version: json.data.signature?.version ?? "unknown" };
    } catch (e) {
      if (e instanceof UpstreamError && e.status !== 503) throw e;
      if (e instanceof HorizonsError) throw new UpstreamError(e.message, 502);
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (lastErr instanceof UpstreamError) throw lastErr;
  // Keep runtime internals (DNS errors, workerd references) in the logs, not in the UI.
  console.error("Horizons network error:", lastErr);
  const timedOut =
    lastErr instanceof Error && /timeout|abort/i.test(`${lastErr.name} ${lastErr.message}`);
  throw new UpstreamError(
    timedOut ? "NASA JPL Horizons did not respond in time" : "Could not reach NASA JPL Horizons",
    504,
  );
}

export async function getEphemeris(
  q: EphemerisQuery,
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
): Promise<EphemerisResponse> {
  const req = toRequest(q, now);
  const key = `${req.latDeg},${req.lonDeg},${req.altKm},${req.start.toISOString()},${req.days},${req.stepHours}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const value = (async () => {
    // Sequential, not parallel, to keep the load on NASA's free public API low.
    const sun = await fetchBody("sun", req, fetchImpl);
    const earth = await fetchBody("earth", req, fetchImpl);
    return {
      site: { latDeg: req.latDeg, lonDeg: req.lonDeg, altKm: req.altKm },
      start: req.start.toISOString(),
      stepHours: req.stepHours,
      generatedAt: new Date(now).toISOString(),
      source: {
        name: "NASA/JPL Horizons",
        url: "https://ssd.jpl.nasa.gov/horizons/",
        version: sun.version,
      },
      sun: sun.rows,
      earth: earth.rows,
    } satisfies EphemerisResponse;
  })();

  cache.set(key, { at: now, value });
  value.catch(() => cache.delete(key)); // never cache failures
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return value;
}
