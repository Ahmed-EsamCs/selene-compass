/**
 * WebGL colours for the 3D scene. Three.js cannot read CSS variables, so these
 * mirror the design tokens in src/styles.css (safe / caution / hazard / primary / psr).
 */
export const PALETTE = {
  safe: [0.28, 0.86, 0.45],
  caution: [0.98, 0.72, 0.2],
  hazard: [0.94, 0.25, 0.22],
  psr: [0.35, 0.42, 0.95],
  cyan: "#5fd8ef",
  cyanRGB: [0.37, 0.85, 0.94],
  sun: "#ffe6a8",
  space: "#060a16",
  regolithLow: [0.24, 0.25, 0.28],
  regolithHigh: [0.66, 0.66, 0.68],
} as const;

type RGB = readonly [number, number, number] | readonly number[];

export function mix(a: RGB, b: RGB, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Multi-stop colour ramp, stops evenly spaced over 0..1. */
export function ramp(stops: RGB[], t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(v));
  return mix(stops[i]!, stops[i + 1]!, v - i);
}

export const RAMPS = {
  slope: [PALETTE.safe, [0.85, 0.9, 0.3], PALETTE.caution, PALETTE.hazard, [0.55, 0.08, 0.15]],
  illumination: [[0.05, 0.07, 0.25], [0.25, 0.2, 0.55], [0.85, 0.55, 0.2], [1, 0.95, 0.65]],
  comm: [[0.06, 0.08, 0.2], [0.1, 0.3, 0.55], PALETTE.cyanRGB, [0.85, 1, 1]],
  elevation: [[0.12, 0.1, 0.4], [0.1, 0.45, 0.6], [0.45, 0.75, 0.45], [0.92, 0.85, 0.55], [1, 1, 1]],
} satisfies Record<string, RGB[]>;
