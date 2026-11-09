/**
 * Downloads real NASA LRO LOLA south-pole elevation data and bakes it into a small static
 * asset the app loads at runtime:
 *
 *   public/data/lola-south-pole/heights.f32  — Float32 LE, GRID×GRID, km above 1737.4 km
 *   public/data/lola-south-pole/meta.json    — provenance, grid, checksum, validation
 *
 * Only the image rows covering the map window are requested (HTTP Range), so the
 * multi-hundred-MB product is never fully downloaded.
 *
 * Usage:  bun scripts/fetch-lola-dem.ts [--product LDEM_80S_80M] [--out public/data/lola-south-pole]
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  demLayoutFromLabel,
  makePixelReader,
  parsePdsLabel,
  requiredLines,
  resampleToGrid,
  type DemLayout,
} from "../src/lib/lunar/pds";
import { CELL_KM, GRID, MAP_HALF_KM, gridToKm } from "../src/lib/lunar/terrain";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1]!);

const PRODUCTS = (args.get("product") ?? "LDEM_80S_80M,LDEM_75S_240M").split(",");
const OUT_DIR = args.get("out") ?? "public/data/lola-south-pole";

/** Official PDS Geosciences Node first, MIT LOLA team mirror second. */
const MIRRORS = [
  (p: string, ext: string) =>
    `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/${p.toLowerCase()}.${ext.toLowerCase()}`,
  (p: string, ext: string) => `https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/${p}.${ext}`,
];

const UA =
  "SeleneCompass-data-pipeline/1.0 (+https://github.com/Ahmed-EsamCs/lunar-south-pole-compass)";

async function fetchWithRetry(url: string, init: RequestInit = {}, tries = 3): Promise<Response> {
  let last: unknown;
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "user-agent": UA, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok || res.status === 206) return res;
      last = new Error(`HTTP ${res.status} for ${url}`);
      if (res.status === 404) break;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 2000 * (t + 1)));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** Read bytes [start, end) — via Range if the server honours it, else by streaming and slicing. */
async function readRange(url: string, start: number, end: number): Promise<Uint8Array> {
  const res = await fetchWithRetry(url, { headers: { range: `bytes=${start}-${end - 1}` } });
  if (res.status === 206) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength !== end - start)
      throw new Error(`Short range read: ${buf.byteLength} of ${end - start}`);
    return buf;
  }
  console.warn("  server ignored Range; streaming the file and keeping the needed slice");
  const out = new Uint8Array(end - start);
  const reader = res.body!.getReader();
  let pos = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const a = Math.max(start, pos);
    const b = Math.min(end, pos + value.byteLength);
    if (b > a) out.set(value.subarray(a - pos, b - pos), a - start);
    pos += value.byteLength;
    if (pos >= end) {
      await reader.cancel();
      break;
    }
  }
  if (pos < end) throw new Error(`File ended at byte ${pos}, needed ${end}`);
  return out;
}

interface Loaded {
  product: string;
  labelUrl: string;
  imageUrl: string;
  layout: DemLayout;
  heights: Float32Array;
}

async function loadProduct(product: string): Promise<Loaded> {
  let lastErr: unknown;
  for (const mirror of MIRRORS) {
    const labelUrl = mirror(product, "LBL");
    const imageUrl = mirror(product, "IMG");
    try {
      console.log(`→ ${labelUrl}`);
      const labelText = await (await fetchWithRetry(labelUrl)).text();
      const layout = demLayoutFromLabel(parsePdsLabel(labelText));
      console.log(
        `  ${layout.lines}×${layout.samples} ${layout.kind}${layout.bytesPerSample * 8} ` +
          `${layout.littleEndian ? "LE" : "BE"}, ${(layout.mapScaleKm * 1000).toFixed(0)} m/px, ` +
          `L0=${layout.lineProjectionOffset} S0=${layout.sampleProjectionOffset}`,
      );
      const { first, last } = requiredLines(layout);
      const rowBytes = layout.samples * layout.bytesPerSample;
      const start = layout.headerBytes + first * rowBytes;
      const end = layout.headerBytes + (last + 1) * rowBytes;
      console.log(
        `  reading lines ${first}–${last} (${((end - start) / 1e6).toFixed(1)} MB) from ${imageUrl}`,
      );
      const bytes = await readRange(imageUrl, start, end);
      const read = makePixelReader(
        layout,
        new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        first,
      );
      const heights = resampleToGrid(layout, read);
      return { product, labelUrl, imageUrl, layout, heights };
    } catch (e) {
      console.warn(`  failed: ${e instanceof Error ? e.message : e}`);
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Could not load ${product}`);
}

/** Sanity checks against well-known south-pole topography; throws if the data look wrong. */
function validate(h: Float32Array) {
  const at = (x: number, y: number) => {
    const ix = Math.round((x + MAP_HALF_KM) / CELL_KM);
    const iy = Math.round((y + MAP_HALF_KM) / CELL_KM);
    return h[iy * GRID + ix]!;
  };
  let min = Infinity;
  let max = -Infinity;
  for (const v of h) {
    if (!Number.isFinite(v)) throw new Error("DEM contains non-finite values");
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Shackleton (89.67°S 129.78°E ≈ x 7.7, y −6.4 km): ~4 km deep bowl, ~21 km wide.
  const floor = at(7.7, -6.4);
  let rimMax = -Infinity;
  for (let a = 0; a < 360; a += 10) {
    const r = 10.5;
    rimMax = Math.max(
      rimMax,
      at(7.7 + r * Math.sin((a * Math.PI) / 180), -6.4 + r * Math.cos((a * Math.PI) / 180)),
    );
  }
  const shackletonDepth = rimMax - floor;
  const checks = {
    finite: true,
    reliefKm: +(max - min).toFixed(3),
    shackletonDepthKm: +shackletonDepth.toFixed(3),
    plausibleRelief: max - min > 4 && max - min < 15,
    shackletonIsBowl: shackletonDepth > 2.5,
  };
  console.log("  validation", checks);
  if (!checks.plausibleRelief || !checks.shackletonIsBowl) {
    throw new Error(`DEM failed validation: ${JSON.stringify(checks)}`);
  }
  return { min, max, checks };
}

async function main() {
  let loaded: Loaded | null = null;
  let validation: ReturnType<typeof validate> | null = null;
  for (const p of PRODUCTS) {
    try {
      const l = await loadProduct(p);
      validation = validate(l.heights);
      loaded = l;
      break;
    } catch (e) {
      console.warn(`✗ ${p}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!loaded || !validation) throw new Error("No LOLA product could be downloaded and validated");

  await mkdir(OUT_DIR, { recursive: true });
  const bin = Buffer.from(
    loaded.heights.buffer,
    loaded.heights.byteOffset,
    loaded.heights.byteLength,
  );
  const sha256 = createHash("sha256").update(bin).digest("hex");
  const previous = await readFile(path.join(OUT_DIR, "meta.json"), "utf8").then(
    JSON.parse,
    () => null,
  );
  if (previous?.sha256 === sha256 && previous?.product === loaded.product) {
    console.log(
      `✓ ${OUT_DIR} already up to date (${loaded.product}, sha256 ${sha256.slice(0, 12)}…)`,
    );
    return;
  }
  await writeFile(path.join(OUT_DIR, "heights.f32"), bin);
  const meta = {
    schema: 1,
    dataset: "LRO LOLA Gridded Data Record — polar stereographic DEM",
    product: loaded.product,
    mission: "Lunar Reconnaissance Orbiter (LRO) / Lunar Orbiter Laser Altimeter (LOLA)",
    provider: "NASA Planetary Data System, Geosciences Node",
    sourceLabel: loaded.labelUrl,
    sourceImage: loaded.imageUrl,
    sourceResolutionM: Math.round(loaded.layout.mapScaleKm * 1000),
    referenceRadiusKm: loaded.layout.radiusKm,
    units: "km above reference radius",
    encoding: "float32-le",
    grid: {
      size: GRID,
      cellKm: CELL_KM,
      halfKm: MAP_HALF_KM,
      rowMajor: "iy (y from -halfKm), then ix (x from -halfKm)",
    },
    frame:
      "+y toward 0°E (Earth-facing), +x toward 90°E; distance from pole maps linearly to latitude",
    minKm: +validation.min.toFixed(4),
    maxKm: +validation.max.toFixed(4),
    sha256,
    validation: validation.checks,
    generatedAt: new Date().toISOString(),
    firstCellKm: [gridToKm(0), gridToKm(0)],
  };
  await writeFile(path.join(OUT_DIR, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`✓ wrote ${OUT_DIR} (${loaded.product}, sha256 ${sha256.slice(0, 12)}…)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
