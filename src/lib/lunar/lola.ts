/**
 * Loads the baked NASA LRO LOLA height grid produced by `scripts/fetch-lola-dem.ts`.
 * Falls back to the procedural demonstration terrain — clearly labelled — if the asset
 * is missing, corrupt or fails its checksum.
 */
import { z } from "zod";
import { buildTerrain, buildTerrainFromHeights, type TerrainData } from "./analysis";
import { CELL_KM, GRID, MAP_HALF_KM } from "./terrain";

export const LOLA_BASE = "/data/lola-south-pole";

export const lolaMetaSchema = z.object({
  schema: z.literal(1),
  product: z.string(),
  sourceImage: z.string().url(),
  sourceResolutionM: z.number().positive(),
  encoding: z.literal("float32-le"),
  grid: z.object({ size: z.number().int(), cellKm: z.number(), halfKm: z.number() }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  generatedAt: z.string(),
});
export type LolaMeta = z.infer<typeof lolaMetaSchema>;

type FetchLike = (input: string) => Promise<Response>;

async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null; // non-secure context: skip the integrity check rather than fail
  const digest = await subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fetch + verify the LOLA grid. Throws with a human-readable reason on any problem. */
export async function fetchLolaHeights(fetchImpl: FetchLike = fetch, base = LOLA_BASE) {
  const metaRes = await fetchImpl(`${base}/meta.json`);
  if (!metaRes.ok) throw new Error(`LOLA metadata not available (HTTP ${metaRes.status})`);
  const meta = lolaMetaSchema.parse(await metaRes.json());
  if (meta.grid.size !== GRID || Math.abs(meta.grid.halfKm - MAP_HALF_KM) > 1e-6 || Math.abs(meta.grid.cellKm - CELL_KM) > 1e-6) {
    throw new Error("LOLA grid does not match this app version");
  }
  const binRes = await fetchImpl(`${base}/heights.f32`);
  if (!binRes.ok) throw new Error(`LOLA heights not available (HTTP ${binRes.status})`);
  const buf = await binRes.arrayBuffer();
  if (buf.byteLength !== GRID * GRID * 4) throw new Error(`LOLA heights have the wrong size (${buf.byteLength} bytes)`);
  const hash = await sha256Hex(buf);
  if (hash && hash !== meta.sha256) throw new Error("LOLA heights failed their checksum");
  const view = new DataView(buf);
  const heights = new Float32Array(GRID * GRID);
  for (let k = 0; k < heights.length; k++) heights[k] = view.getFloat32(k * 4, true);
  return { heights, meta };
}

/** Real LOLA terrain when available, otherwise the labelled simulation. Never throws. */
export async function loadTerrain(fetchImpl: FetchLike = fetch): Promise<TerrainData> {
  try {
    const { heights, meta } = await fetchLolaHeights(fetchImpl);
    return buildTerrainFromHeights(heights, {
      kind: "lola",
      product: meta.product,
      resolutionM: meta.sourceResolutionM,
      url: meta.sourceImage,
      generatedAt: meta.generatedAt,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`Selene Compass: using simulated terrain — ${reason}`);
    return buildTerrain(1969, reason);
  }
}
