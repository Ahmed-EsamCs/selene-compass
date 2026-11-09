/**
 * Landing-safety analysis over a height grid — either real NASA LRO LOLA elevations
 * (see `scripts/fetch-lola-dem.ts`) or the procedural demonstration terrain fallback.
 * Illumination and Earth-visibility come from a simplified horizon model run on those
 * heights: they are modelled estimates, not NASA illumination products.
 */
import { CELL_KM, GRID, MAP_HALF_KM, MOON_RADIUS_KM, gridToKm, makeHeightFn } from "./terrain";

export const SUN_RADIUS_DEG = 0.2665;
export const EARTH_RADIUS_DEG = 0.95;
/** Sub-solar latitude swings about ±1.54° over a year at the lunar poles. */
export const SUN_MAX_ELEV_DEG = 1.54;
/** Optical libration swings the Earth roughly ±6.7° in elevation and ±7.9° in azimuth. */
export const EARTH_LIB_ELEV_DEG = 6.7;
export const EARTH_LIB_AZ_DEG = 7.9;

/** Lander-safety rules (demonstration thresholds). */
export const HARD_SLOPE_LIMIT_DEG = 15;
export const HAZARD_SCORE_BELOW = 40;
export const PSR_ILLUMINATION = 0.05;

export type SafetyClass = "safe" | "caution" | "hazard";

export interface Filters {
  maxSlope: number; // degrees
  minIllumination: number; // 0..1
  minComm: number; // 0..1
  minScore: number; // 0..100
}

export interface Weights {
  slope: number;
  illumination: number;
  comm: number;
}

export const DEFAULT_FILTERS: Filters = {
  maxSlope: 10,
  minIllumination: 0.3,
  minComm: 0.35,
  minScore: 60,
};

export const DEFAULT_WEIGHTS: Weights = { slope: 0.4, illumination: 0.3, comm: 0.3 };

/** Where the height grid came from — drives the provenance labels in the UI. */
export type TerrainSource =
  | {
      kind: "lola";
      product: string;
      resolutionM: number;
      url: string;
      generatedAt: string;
    }
  | { kind: "simulated"; reason?: string };

export interface TerrainData {
  source: TerrainSource;
  size: number;
  cellKm: number;
  halfKm: number;
  height: Float32Array;
  slope: Float32Array;
  illumination: Float32Array;
  comm: Float32Array;
  minH: number;
  maxH: number;
  heightAt: (x: number, y: number) => number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const DEG = Math.PI / 180;

/* ---------------- scoring ---------------- */

export function factorScores(slopeDeg: number, illumination: number, comm: number) {
  return {
    slope: clamp01((20 - slopeDeg) / 18), // ≤2° → 1, ≥20° → 0
    illumination: clamp01(illumination / 0.7), // ≥70% sunlit → 1
    comm: clamp01(comm / 0.6), // ≥60% Earth-visible → 1
  };
}

export function safetyScore(
  slopeDeg: number,
  illumination: number,
  comm: number,
  w: Weights = DEFAULT_WEIGHTS,
): number {
  const f = factorScores(slopeDeg, illumination, comm);
  const total = w.slope + w.illumination + w.comm;
  if (total <= 0) return 0;
  return (100 * (w.slope * f.slope + w.illumination * f.illumination + w.comm * f.comm)) / total;
}

export function classify(
  slopeDeg: number,
  illumination: number,
  comm: number,
  score: number,
  filters: Filters = DEFAULT_FILTERS,
): SafetyClass {
  if (slopeDeg > HARD_SLOPE_LIMIT_DEG || score < HAZARD_SCORE_BELOW || illumination < PSR_ILLUMINATION)
    return "hazard";
  if (
    slopeDeg <= filters.maxSlope &&
    illumination >= filters.minIllumination &&
    comm >= filters.minComm &&
    score >= filters.minScore
  )
    return "safe";
  return "caution";
}

/* ---------------- terrain sampling ---------------- */

export function sampleHeight(t: Pick<TerrainData, "height" | "size">, x: number, y: number): number {
  const fx = (x + MAP_HALF_KM) / CELL_KM;
  const fy = (y + MAP_HALF_KM) / CELL_KM;
  const n = t.size;
  const ix = Math.max(0, Math.min(n - 2, Math.floor(fx)));
  const iy = Math.max(0, Math.min(n - 2, Math.floor(fy)));
  const tx = Math.min(1, Math.max(0, fx - ix));
  const ty = Math.min(1, Math.max(0, fy - iy));
  const h = t.height;
  const a = h[iy * n + ix]!;
  const b = h[iy * n + ix + 1]!;
  const c = h[(iy + 1) * n + ix]!;
  const d = h[(iy + 1) * n + ix + 1]!;
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/**
 * Horizon elevation angle (radians) seen from (x, y) toward azimuth `az`
 * (radians, 0 = +y / Earth-facing, clockwise toward +x). Includes lunar curvature.
 */
export function horizonAngle(
  t: Pick<TerrainData, "height" | "size">,
  x: number,
  y: number,
  az: number,
  observerLift = 0.002,
): number {
  const h0 = sampleHeight(t, x, y) + observerLift;
  const dx = Math.sin(az);
  const dy = Math.cos(az);
  let best = -Infinity;
  let d = CELL_KM;
  while (true) {
    const px = x + dx * d;
    const py = y + dy * d;
    if (px < -MAP_HALF_KM || px > MAP_HALF_KM || py < -MAP_HALF_KM || py > MAP_HALF_KM) break;
    const drop = (d * d) / (2 * MOON_RADIUS_KM);
    const a = Math.atan2(sampleHeight(t, px, py) - h0 - drop, d);
    if (a > best) best = a;
    d += Math.max(CELL_KM, d * 0.07);
  }
  // Beyond the modelled area assume the mean surface (height 0) on a sphere.
  const offMap = h0 > 0 ? -Math.sqrt((2 * h0) / MOON_RADIUS_KM) : 0;
  return Math.max(best, offMap);
}

/** Fraction (0..1) of a disk of angular radius `r` (deg) above a horizon. */
export function diskVisible(elevDeg: number, horizonRad: number, radiusDeg: number): number {
  const margin = elevDeg - horizonRad / DEG;
  return clamp01(margin / (2 * radiusDeg) + 0.5);
}

const SUN_AZ_SAMPLES = 24;
const SUN_ELEVS = [-1, -0.5, 0, 0.5, 1].map((k) => k * SUN_MAX_ELEV_DEG);
const EARTH_AZ = [-1, -0.5, 0, 0.5, 1].map((k) => k * EARTH_LIB_AZ_DEG * DEG);
const EARTH_ELEVS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((k) => k * EARTH_LIB_ELEV_DEG);

export function illuminationAt(t: Pick<TerrainData, "height" | "size">, x: number, y: number): number {
  let lit = 0;
  for (let a = 0; a < SUN_AZ_SAMPLES; a++) {
    const hz = horizonAngle(t, x, y, (a / SUN_AZ_SAMPLES) * Math.PI * 2);
    for (const e of SUN_ELEVS) lit += diskVisible(e, hz, SUN_RADIUS_DEG);
  }
  return lit / (SUN_AZ_SAMPLES * SUN_ELEVS.length);
}

export function earthVisibilityAt(t: Pick<TerrainData, "height" | "size">, x: number, y: number): number {
  let vis = 0;
  for (const az of EARTH_AZ) {
    const hz = horizonAngle(t, x, y, az);
    for (const e of EARTH_ELEVS) vis += diskVisible(e, hz, EARTH_RADIUS_DEG) > 0.5 ? 1 : 0;
  }
  return vis / (EARTH_AZ.length * EARTH_ELEVS.length);
}

/** Sun visibility around one lunar day (samples over azimuth) at mean-season elevation. */
export function sunProfile(t: TerrainData, x: number, y: number, samples = 72, elevDeg = 0.8): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const hz = horizonAngle(t, x, y, (i / samples) * Math.PI * 2);
    out.push(diskVisible(elevDeg, hz, SUN_RADIUS_DEG));
  }
  return out;
}

/** Earth visibility over one libration cycle (~27.3 days). */
export function earthProfile(t: TerrainData, x: number, y: number, samples = 48): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const p = (i / samples) * Math.PI * 2;
    const az = Math.sin(p) * EARTH_LIB_AZ_DEG * DEG;
    const el = Math.sin(p * 1.08 + 1.1) * EARTH_LIB_ELEV_DEG;
    out.push(diskVisible(el, horizonAngle(t, x, y, az), EARTH_RADIUS_DEG));
  }
  return out;
}

export function isSunlit(t: TerrainData, x: number, y: number, phase: number, elevDeg = 0.8) {
  return diskVisible(elevDeg, horizonAngle(t, x, y, phase * Math.PI * 2), SUN_RADIUS_DEG);
}

/* ---------------- full build ---------------- */

/** Procedural demonstration terrain (used when real LOLA data is unavailable). */
export function simulatedHeights(seed = 1969): Float32Array {
  const n = GRID;
  const heightFn = makeHeightFn(seed);
  const height = new Float32Array(n * n);
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) height[iy * n + ix] = heightFn(gridToKm(ix), gridToKm(iy));
  }
  return height;
}

export function buildTerrain(seed = 1969, reason?: string): TerrainData {
  return buildTerrainFromHeights(simulatedHeights(seed), reason ? { kind: "simulated", reason } : { kind: "simulated" });
}

/** Derive slope, illumination and Earth visibility from a GRID×GRID height field (km). */
export function buildTerrainFromHeights(height: Float32Array, source: TerrainSource): TerrainData {
  const n = GRID;
  if (height.length !== n * n) throw new Error(`Expected ${n * n} heights, got ${height.length}`);
  let minH = Infinity;
  let maxH = -Infinity;
  for (let k = 0; k < height.length; k++) {
    const h = height[k]!;
    if (!Number.isFinite(h)) throw new Error(`Height grid has a non-finite value at index ${k}`);
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }

  const slope = new Float32Array(n * n);
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const l = height[iy * n + Math.max(0, ix - 1)]!;
      const r = height[iy * n + Math.min(n - 1, ix + 1)]!;
      const d = height[Math.max(0, iy - 1) * n + ix]!;
      const u = height[Math.min(n - 1, iy + 1) * n + ix]!;
      const sx = (r - l) / ((ix === 0 || ix === n - 1 ? 1 : 2) * CELL_KM);
      const sy = (u - d) / ((iy === 0 || iy === n - 1 ? 1 : 2) * CELL_KM);
      slope[iy * n + ix] = Math.atan(Math.sqrt(sx * sx + sy * sy)) / DEG;
    }
  }

  // Horizon analysis on a half-resolution lattice, then bilinear upsample.
  const base = { height, size: n };
  const step = 2;
  const m = (n - 1) / step + 1;
  const illumLo = new Float32Array(m * m);
  const commLo = new Float32Array(m * m);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const x = gridToKm(i * step);
      const y = gridToKm(j * step);
      illumLo[j * m + i] = illuminationAt(base, x, y);
      commLo[j * m + i] = earthVisibilityAt(base, x, y);
    }
  }
  const illumination = new Float32Array(n * n);
  const comm = new Float32Array(n * n);
  for (let iy = 0; iy < n; iy++) {
    const j = Math.min(m - 2, Math.floor(iy / step));
    const ty = iy / step - j;
    for (let ix = 0; ix < n; ix++) {
      const i = Math.min(m - 2, Math.floor(ix / step));
      const tx = ix / step - i;
      const k = j * m + i;
      const bl = (arr: Float32Array) =>
        arr[k]! * (1 - tx) * (1 - ty) +
        arr[k + 1]! * tx * (1 - ty) +
        arr[k + m]! * (1 - tx) * ty +
        arr[k + m + 1]! * tx * ty;
      illumination[iy * n + ix] = bl(illumLo);
      comm[iy * n + ix] = bl(commLo);
    }
  }

  const data: TerrainData = {
    source,
    size: n,
    cellKm: CELL_KM,
    halfKm: MAP_HALF_KM,
    height,
    slope,
    illumination,
    comm,
    minH,
    maxH,
    heightAt: (x, y) => sampleHeight(data, x, y),
  };
  return data;
}

export interface Classification {
  classes: Uint8Array; // 0 safe, 1 caution, 2 hazard
  scores: Float32Array;
  safeKm2: number;
  cautionKm2: number;
  hazardKm2: number;
}

export const CLASS_INDEX: Record<SafetyClass, number> = { safe: 0, caution: 1, hazard: 2 };
export const CLASS_FROM_INDEX: SafetyClass[] = ["safe", "caution", "hazard"];

export function classifyGrid(t: TerrainData, filters: Filters, weights: Weights): Classification {
  const len = t.size * t.size;
  const classes = new Uint8Array(len);
  const scores = new Float32Array(len);
  const area: [number, number, number] = [0, 0, 0];
  const cellArea = t.cellKm * t.cellKm;
  for (let k = 0; k < len; k++) {
    const s = safetyScore(t.slope[k]!, t.illumination[k]!, t.comm[k]!, weights);
    scores[k] = s;
    const c = CLASS_INDEX[classify(t.slope[k]!, t.illumination[k]!, t.comm[k]!, s, filters)];
    classes[k] = c;
    area[c as 0 | 1 | 2] += cellArea;
  }
  return { classes, scores, safeKm2: area[0], cautionKm2: area[1], hazardKm2: area[2] };
}

export interface PointMetrics {
  x: number;
  y: number;
  elevation: number;
  slope: number;
  illumination: number;
  comm: number;
  score: number;
  cls: SafetyClass;
}

export function metricsAt(t: TerrainData, x: number, y: number, filters: Filters, weights: Weights): PointMetrics {
  const ix = Math.max(0, Math.min(t.size - 1, Math.round((x + t.halfKm) / t.cellKm)));
  const iy = Math.max(0, Math.min(t.size - 1, Math.round((y + t.halfKm) / t.cellKm)));
  const k = iy * t.size + ix;
  const slope = t.slope[k]!;
  const illumination = t.illumination[k]!;
  const comm = t.comm[k]!;
  const score = safetyScore(slope, illumination, comm, weights);
  return {
    x,
    y,
    elevation: t.height[k]!,
    slope,
    illumination,
    comm,
    score,
    cls: classify(slope, illumination, comm, score, filters),
  };
}
