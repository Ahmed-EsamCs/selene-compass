import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fetchLolaHeights, loadTerrain } from "./lola";
import { CELL_KM, GRID, MAP_HALF_KM } from "./terrain";

function asset(mutate?: (meta: Record<string, unknown>, bin: Buffer) => void) {
  const heights = new Float32Array(GRID * GRID);
  for (let k = 0; k < heights.length; k++) heights[k] = Math.sin(k / 97) * 2;
  const bin = Buffer.from(heights.buffer);
  const meta: Record<string, unknown> = {
    schema: 1,
    product: "LDEM_80S_80M",
    sourceImage: "https://pds-geosciences.wustl.edu/lro/x.img",
    sourceResolutionM: 80,
    encoding: "float32-le",
    grid: { size: GRID, cellKm: CELL_KM, halfKm: MAP_HALF_KM },
    sha256: createHash("sha256").update(bin).digest("hex"),
    generatedAt: "2026-11-09T00:00:00.000Z",
  };
  mutate?.(meta, bin);
  const fetchImpl = async (url: string) =>
    url.endsWith("meta.json")
      ? new Response(JSON.stringify(meta))
      : new Response(
          bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer,
        );
  return { heights, fetchImpl };
}

describe("LOLA asset loading", () => {
  it("decodes a verified height grid", async () => {
    const { heights, fetchImpl } = asset();
    const out = await fetchLolaHeights(fetchImpl);
    expect(out.heights).toEqual(heights);
    expect(out.meta.product).toBe("LDEM_80S_80M");
  });

  it("cache-busts the grid by checksum and revalidates the metadata", async () => {
    const { fetchImpl } = asset();
    const calls: [string, RequestInit | undefined][] = [];
    await fetchLolaHeights(async (url, init) => (calls.push([url, init]), fetchImpl(url)));
    expect(calls[0]).toEqual(["/data/lola-south-pole/meta.json", { cache: "no-cache" }]);
    expect(calls[1]![0]).toMatch(/^\/data\/lola-south-pole\/heights\.f32\?v=[0-9a-f]{16}$/);
  });

  it("rejects a corrupted file via its checksum", async () => {
    const { fetchImpl } = asset((_, bin) => bin.writeFloatLE(123, 40));
    await expect(fetchLolaHeights(fetchImpl)).rejects.toThrow(/checksum/);
  });

  it("rejects a grid baked for a different map layout", async () => {
    const { fetchImpl } = asset((m) => (m["grid"] = { size: 81, cellKm: 1.5, halfKm: 60 }));
    await expect(fetchLolaHeights(fetchImpl)).rejects.toThrow(/does not match/);
  });

  it("builds real terrain tagged with its NASA provenance", async () => {
    const { fetchImpl } = asset();
    const t = await loadTerrain(fetchImpl);
    expect(t.source).toMatchObject({ kind: "lola", product: "LDEM_80S_80M", resolutionM: 80 });
  });

  it("falls back to labelled simulated terrain when the asset is missing", async () => {
    const t = await loadTerrain(async () => new Response("nope", { status: 404 }));
    expect(t.source.kind).toBe("simulated");
    expect(t.source.kind === "simulated" && t.source.reason).toMatch(/HTTP 404/);
  });
});
