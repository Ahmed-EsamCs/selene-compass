/**
 * Real Sun / Earth positions in the lunar south-pole sky from NASA JPL Horizons.
 *
 * Pure helpers only: building the Horizons query, parsing its output and combining the
 * ephemeris with a terrain horizon. The network call lives in `src/routes/api/ephemeris.ts`
 * (server side) so the browser never talks to Horizons directly.
 */
import { z } from "zod";
import {
  EARTH_RADIUS_DEG,
  SUN_RADIUS_DEG,
  diskVisible,
  horizonAngle,
  type TerrainData,
} from "./analysis";
import { kmToLatLon } from "./terrain";

export const HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api";
export const MOON_ID = 301;
export const BODIES = { sun: "10", earth: "399" } as const;
export type Body = keyof typeof BODIES;

export interface SkySample {
  /** Epoch, ms since 1970 UTC. */
  t: number;
  /** Apparent azimuth, degrees clockwise from local north (Horizons convention). */
  az: number;
  /** Apparent elevation above the local horizontal plane, degrees. */
  el: number;
}

export interface EphemerisRequest {
  latDeg: number;
  /** East longitude, degrees. */
  lonDeg: number;
  /** Height above the reference sphere, km. */
  altKm: number;
  start: Date;
  days: number;
  stepHours: number;
}

export const ephemerisResponseSchema = z.object({
  site: z.object({ latDeg: z.number(), lonDeg: z.number(), altKm: z.number() }),
  start: z.string(),
  stepHours: z.number(),
  generatedAt: z.string(),
  source: z.object({ name: z.string(), url: z.string(), version: z.string() }),
  sun: z.array(z.object({ t: z.number(), az: z.number(), el: z.number() })),
  earth: z.array(z.object({ t: z.number(), az: z.number(), el: z.number() })),
});
export type EphemerisResponse = z.infer<typeof ephemerisResponseSchema>;

const pad = (n: number) => String(n).padStart(2, "0");
/** Horizons calendar format: `2026-11-09 21:00`. */
export function horizonsTime(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** GET URL for an OBSERVER table of apparent az/el seen from a site on the Moon. */
export function horizonsUrl(body: Body, req: EphemerisRequest): string {
  const stop = new Date(req.start.getTime() + req.days * 86_400_000);
  const lon = ((req.lonDeg % 360) + 360) % 360; // Horizons wants east longitude 0..360 for the Moon
  const q = (v: string) => `'${v}'`;
  const params: Record<string, string> = {
    format: "json",
    COMMAND: q(BODIES[body]),
    OBJ_DATA: q("NO"),
    MAKE_EPHEM: q("YES"),
    EPHEM_TYPE: q("OBSERVER"),
    CENTER: q(`coord@${MOON_ID}`),
    COORD_TYPE: q("GEODETIC"),
    SITE_COORD: q(`${lon.toFixed(4)},${req.latDeg.toFixed(4)},${req.altKm.toFixed(3)}`),
    START_TIME: q(horizonsTime(req.start)),
    STOP_TIME: q(horizonsTime(stop)),
    STEP_SIZE: q(`${req.stepHours} h`),
    QUANTITIES: q("4"),
    ANG_FORMAT: q("DEG"),
    CSV_FORMAT: q("YES"),
    APPARENT: q("AIRLESS"),
  };
  return `${HORIZONS_API}?${Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/'/g, "%27")}`)
    .join("&")}`;
}

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Parse `2026-Nov-09 21:00`, `2026-Nov-09 21:00:00.000` or `2026-11-09 21:00` as UTC. */
export function parseHorizonsDate(s: string): number {
  const m = /(\d{4})-([A-Za-z]{3}|\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?/.exec(
    s.trim(),
  );
  if (!m) return NaN;
  const month = /^\d+$/.test(m[2]!) ? Number(m[2]) - 1 : MONTHS[m[2]!];
  if (month === undefined) return NaN;
  return Date.UTC(
    Number(m[1]),
    month,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
    Math.round(Number(m[7] ?? 0) * 1000),
  );
}

export class HorizonsError extends Error {}

/**
 * Extract az/el rows from a Horizons `result` text block (CSV_FORMAT=YES, QUANTITIES=4).
 * Columns are located by header name so extra flag columns don't break parsing.
 */
export function parseHorizonsObserver(result: string): SkySample[] {
  const soe = result.indexOf("$$SOE");
  const eoe = result.indexOf("$$EOE");
  if (soe < 0 || eoe < soe) {
    const hint = result.split("\n").find((l) => /error|cannot|no ephemeris|not found/i.test(l));
    throw new HorizonsError(`Horizons returned no ephemeris${hint ? `: ${hint.trim()}` : ""}`);
  }
  const before = result.slice(0, soe).split("\n");
  const header = [...before]
    .reverse()
    .find((l) => /Date/.test(l) && /Azi/i.test(l) && /Elev/i.test(l));
  const cols = header?.split(",").map((c) => c.trim()) ?? [];
  let azCol = cols.findIndex((c) => /^Azi/i.test(c));
  let elCol = cols.findIndex((c) => /^Elev/i.test(c));

  const rows: SkySample[] = [];
  for (const line of result.slice(soe + 5, eoe).split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(",").map((p) => p.trim());
    const t = parseHorizonsDate(parts[0] ?? "");
    if (azCol < 0 || elCol < 0) {
      // No header found: azimuth and elevation are the last two numeric columns.
      const nums = parts
        .map((p, i) => (p !== "" && Number.isFinite(Number(p)) ? i : -1))
        .filter((i) => i > 0);
      azCol = nums.at(-2) ?? -1;
      elCol = nums.at(-1) ?? -1;
    }
    const az = Number(parts[azCol]);
    const el = Number(parts[elCol]);
    if (Number.isFinite(t) && Number.isFinite(az) && Number.isFinite(el)) rows.push({ t, az, el });
  }
  if (!rows.length) throw new HorizonsError("Horizons ephemeris block had no parsable rows");
  return rows;
}

/* ---------------- combining with terrain ---------------- */

const DEG = Math.PI / 180;

/**
 * Convert a Horizons azimuth (clockwise from local north) at east longitude `lonDeg` into
 * the map frame's azimuth (radians, 0 = +y toward 0°E, clockwise toward +x).
 * Near the south pole local north points away from the pole, i.e. along (sin λ, cos λ).
 */
export function toMapAzimuth(azDeg: number, lonDeg: number): number {
  const a = (((azDeg + lonDeg) % 360) + 360) % 360;
  return a * DEG;
}

export interface LiveSample extends SkySample {
  /** Terrain horizon elevation in that direction, degrees. */
  horizonDeg: number;
  /** Fraction of the disk above the terrain horizon (0..1). */
  visible: number;
}

export interface LiveSky {
  sunNow: LiveSample;
  earthNow: LiveSample;
  sun: LiveSample[];
  earth: LiveSample[];
  /** Share of forecast samples with the Sun ≥ half above the horizon. */
  sunlitShare: number;
  /** Share of forecast samples with the Earth's centre above the horizon. */
  earthShare: number;
  nextSunChange: { t: number; to: "sunrise" | "sunset" } | null;
  nextEarthChange: { t: number; to: "rise" | "set" } | null;
}

function interpolate(samples: SkySample[], t: number): SkySample {
  if (t <= samples[0]!.t) return samples[0]!;
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i]!;
    if (t <= b.t) {
      const a = samples[i - 1]!;
      const f = (t - a.t) / (b.t - a.t);
      let daz = b.az - a.az;
      if (daz > 180) daz -= 360;
      if (daz < -180) daz += 360;
      return { t, az: (((a.az + daz * f) % 360) + 360) % 360, el: a.el + (b.el - a.el) * f };
    }
  }
  return samples.at(-1)!;
}

/** Evaluate real ephemeris against the (LOLA or simulated) terrain horizon at map point (x, y). */
export function liveSky(
  t: TerrainData,
  x: number,
  y: number,
  eph: Pick<EphemerisResponse, "sun" | "earth">,
  now = Date.now(),
): LiveSky | null {
  if (!eph.sun.length || !eph.earth.length) return null;
  const { lon } = kmToLatLon(x, y);
  const judge = (s: SkySample, radius: number): LiveSample => {
    const hz = horizonAngle(t, x, y, toMapAzimuth(s.az, lon));
    return { ...s, horizonDeg: hz / DEG, visible: diskVisible(s.el, hz, radius) };
  };
  const sun = eph.sun.map((s) => judge(s, SUN_RADIUS_DEG));
  const earth = eph.earth.map((s) => judge(s, EARTH_RADIUS_DEG));
  const future = <T extends { t: number }>(a: T[]) => a.filter((s) => s.t >= now);
  const share = (a: LiveSample[]) => {
    const f = future(a);
    const pool = f.length ? f : a;
    return pool.filter((s) => s.visible >= 0.5).length / pool.length;
  };
  const change = (a: LiveSample[], current: boolean) => {
    const hit = future(a).find((s) => s.visible >= 0.5 !== current);
    return hit ? hit.t : null;
  };
  const sunNow = judge(interpolate(eph.sun, now), SUN_RADIUS_DEG);
  const earthNow = judge(interpolate(eph.earth, now), EARTH_RADIUS_DEG);
  const sunLit = sunNow.visible >= 0.5;
  const earthUp = earthNow.visible >= 0.5;
  const sc = change(sun, sunLit);
  const ec = change(earth, earthUp);
  return {
    sunNow,
    earthNow,
    sun,
    earth,
    sunlitShare: share(sun),
    earthShare: share(earth),
    nextSunChange: sc === null ? null : { t: sc, to: sunLit ? "sunset" : "sunrise" },
    nextEarthChange: ec === null ? null : { t: ec, to: earthUp ? "set" : "rise" },
  };
}

/** The app's sun slider is a map azimuth in turns (0..1); map a real azimuth onto it. */
export function sunPhaseFromSample(s: SkySample, lonDeg: number): number {
  return toMapAzimuth(s.az, lonDeg) / (2 * Math.PI);
}
