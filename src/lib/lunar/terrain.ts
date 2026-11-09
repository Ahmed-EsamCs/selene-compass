/**
 * Procedural, DEMONSTRATION-ONLY terrain for the lunar south pole region.
 *
 * Crater names and approximate placements are inspired by real features, but every
 * height value here is generated from seeded noise and simple crater profiles.
 * Nothing in this module is NASA-verified measurement data.
 *
 * Map frame: polar-stereographic-like plane centered on the south pole, in kilometres.
 * +y points toward 0° longitude (the Earth-facing direction), +x toward 90°E.
 */

export const MAP_HALF_KM = 60;
export const GRID = 161; // vertices per side
export const CELL_KM = (2 * MAP_HALF_KM) / (GRID - 1);
export const MOON_RADIUS_KM = 1737.4;
export const KM_PER_DEG_LAT = (Math.PI * MOON_RADIUS_KM) / 180; // ≈ 30.32 km

export interface Crater {
  name: string;
  x: number;
  y: number;
  r: number; // radius, km
  depth: number; // km below local datum
  rim: number; // rim height, km
}

export interface Ridge {
  name: string;
  from: [number, number];
  to: [number, number];
  height: number;
  width: number;
}

export interface Peak {
  name: string;
  x: number;
  y: number;
  height: number;
  width: number;
}

/** Major named craters (illustrative placement). */
export const CRATERS: Crater[] = [
  { name: "Shackleton", x: 7.7, y: -6.4, r: 10.5, depth: 4.0, rim: 0.9 },
  { name: "de Gerlache", x: -45, y: 2.4, r: 16, depth: 3.0, rim: 0.7 },
  { name: "Shoemaker", x: 40.7, y: 40.8, r: 25.5, depth: 3.2, rim: 0.8 },
  { name: "Sverdrup", x: -21, y: -39.8, r: 16, depth: 2.8, rim: 0.6 },
  { name: "Slater", x: 54, y: -20, r: 12, depth: 2.4, rim: 0.5 },
  { name: "Haworth", x: -6.9, y: 78.7, r: 25.5, depth: 3.2, rim: 0.8 },
];

export const RIDGES: Ridge[] = [
  { name: "Connecting Ridge", from: [-3, -4], to: [-30, 0], height: 1.5, width: 4.5 },
  { name: "de Gerlache–Kocher Massif", from: [-30, -14], to: [-14, -26], height: 1.1, width: 5 },
];

export const PEAKS: Peak[] = [
  { name: "Peak near Shackleton", x: 16, y: 4, height: 1.9, width: 5.5 },
  { name: "Leibnitz Beta (proxy)", x: 30, y: -42, height: 1.4, width: 7 },
];

/* ---------------- seeded noise ---------------- */

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}

export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- shape functions ---------------- */

export function craterProfile(q: number, depth: number, rim: number): number {
  if (q < 1) {
    const w = Math.max(0, (q - 0.22) / 0.78);
    return -depth + (depth + rim) * Math.pow(w, 1.7);
  }
  return rim * Math.exp(-(q - 1) * 3.2);
}

function segmentDistance(px: number, py: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)));
  const dx = px - (a[0] + t * vx);
  const dy = py - (a[1] + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

function smallCraters(seed: number): Crater[] {
  const rnd = mulberry32(seed);
  const out: Crater[] = [];
  for (let i = 0; i < 90; i++) {
    const r = 0.8 + Math.pow(rnd(), 2.2) * 4.5;
    out.push({
      name: "",
      x: (rnd() * 2 - 1) * (MAP_HALF_KM + 5),
      y: (rnd() * 2 - 1) * (MAP_HALF_KM + 5),
      r,
      depth: r * 0.19,
      rim: r * 0.04,
    });
  }
  return out;
}

/** Height (km, relative to a local datum) at map position (x, y) in km. */
export function makeHeightFn(seed = 1969) {
  const minor = smallCraters(seed);
  return (x: number, y: number): number => {
    let h = 0.55 * fbm(x / 38, y / 38, seed, 4) + 0.08 * fbm(x / 3.2, y / 3.2, seed + 99, 3);
    for (const c of CRATERS) {
      const dx = x - c.x;
      const dy = y - c.y;
      const q = Math.sqrt(dx * dx + dy * dy) / c.r;
      if (q < 4) h += craterProfile(q, c.depth, c.rim);
    }
    for (const c of minor) {
      const dx = x - c.x;
      const dy = y - c.y;
      const q = Math.sqrt(dx * dx + dy * dy) / c.r;
      if (q < 3) h += craterProfile(q, c.depth, c.rim);
    }
    for (const r of RIDGES) {
      const d = segmentDistance(x, y, r.from, r.to);
      h += r.height * Math.exp(-((d / r.width) ** 2));
    }
    for (const p of PEAKS) {
      const dx = x - p.x;
      const dy = y - p.y;
      h += p.height * Math.exp(-(dx * dx + dy * dy) / (p.width * p.width));
    }
    return h;
  };
}

/* ---------------- coordinates ---------------- */

export function gridToKm(i: number): number {
  return -MAP_HALF_KM + i * CELL_KM;
}

export function kmToGrid(v: number): number {
  return Math.max(0, Math.min(GRID - 1, Math.round((v + MAP_HALF_KM) / CELL_KM)));
}

/** Approximate selenographic coordinates for a map position (illustrative projection). */
export function kmToLatLon(x: number, y: number): { lat: number; lon: number } {
  const d = Math.sqrt(x * x + y * y);
  const lat = -90 + d / KM_PER_DEG_LAT;
  const lon = (Math.atan2(x, y) * 180) / Math.PI;
  return { lat, lon };
}

/** Inverse of `kmToLatLon`: selenographic latitude / east longitude (degrees) → map km. */
export function latLonToKm(lat: number, lon: number): { x: number; y: number } {
  const d = (90 + lat) * KM_PER_DEG_LAT;
  const r = (lon * Math.PI) / 180;
  return { x: d * Math.sin(r), y: d * Math.cos(r) };
}

export function formatLatLon(x: number, y: number): string {
  const { lat, lon } = kmToLatLon(x, y);
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°S ${Math.abs(lon).toFixed(1)}°${ew}`;
}
