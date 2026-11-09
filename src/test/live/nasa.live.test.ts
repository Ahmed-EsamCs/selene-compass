// @vitest-environment node
/**
 * Live integration tests against real NASA services. Skipped unless LIVE_NASA=1
 * (run with `bun run test:live`; CI runs them in the "NASA data" workflow).
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildTerrainFromHeights,
  DEFAULT_FILTERS,
  DEFAULT_WEIGHTS,
  metricsAt,
} from "@/lib/lunar/analysis";
import { liveSky } from "@/lib/lunar/ephemeris";
import { fetchLolaHeights } from "@/lib/lunar/lola";
import { findSite } from "@/lib/lunar/sites";
import { kmToLatLon } from "@/lib/lunar/terrain";
import { ephemerisQuerySchema, getEphemeris } from "@/server/horizons";

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const LIVE = env["LIVE_NASA"] === "1";

/** Serve files from public/ like the deployed site does. */
const localFetch = async (url: string) => {
  try {
    return new Response(await readFile(`public${url}`));
  } catch {
    return new Response("missing", { status: 404 });
  }
};

describe.skipIf(!LIVE)("NASA JPL Horizons (live)", () => {
  const peak = findSite("peak-shackleton")!;
  const { lat, lon } = kmToLatLon(peak.x, peak.y);

  it("returns a month of Sun and Earth positions for a south-pole site", async () => {
    const eph = await getEphemeris(ephemerisQuerySchema.parse({ lat, lon, alt: 1.5 }));
    console.log(
      `Horizons v${eph.source.version}: ${eph.sun.length} sun / ${eph.earth.length} earth samples`,
    );
    expect(eph.sun.length).toBeGreaterThanOrEqual(120);
    expect(eph.earth.length).toBe(eph.sun.length);
    // At ~89.5°S the Sun never strays more than ~2.5° from the horizontal plane …
    for (const s of eph.sun) expect(Math.abs(s.el)).toBeLessThan(2.5);
    // … and Earth stays within libration range (~±7°) of it, toward the 0° meridian.
    for (const s of eph.earth) expect(Math.abs(s.el)).toBeLessThan(8.5);
    const expectedEarthAz = (360 - lon + 360) % 360;
    for (const s of eph.earth) {
      const d = Math.abs(((s.az - expectedEarthAz + 540) % 360) - 180);
      expect(d).toBeLessThan(15);
    }
    // The Sun goes all the way around the horizon over a lunar day.
    const azs = new Set(eph.sun.map((s) => Math.floor(s.az / 45)));
    expect(azs.size).toBe(8);
  }, 90_000);
});

describe.skipIf(!LIVE)("NASA LRO LOLA terrain asset (live data)", () => {
  it("loads, verifies and shows real south-pole topography", async () => {
    const { heights, meta } = await fetchLolaHeights(localFetch);
    console.log(
      `LOLA ${meta.product} @ ${meta.sourceResolutionM} m/px, generated ${meta.generatedAt}`,
    );
    const t = buildTerrainFromHeights(heights, {
      kind: "lola",
      product: meta.product,
      resolutionM: meta.sourceResolutionM,
      url: meta.sourceImage,
      generatedAt: meta.generatedAt,
    });
    const floor = t.heightAt(7.7, -6.4);
    const peak = findSite("peak-shackleton")!;
    console.log(
      `Shackleton floor ${(floor * 1000).toFixed(0)} m, peak site ${(t.heightAt(peak.x, peak.y) * 1000).toFixed(0)} m`,
    );
    // Real LOLA at 750 m: the massif stands ~2.8 km above Shackleton's floor.
    expect(t.heightAt(peak.x, peak.y) - floor).toBeGreaterThan(2);
    // Shackleton's floor is a well-known permanently shadowed region.
    const idx = Math.round((-6.4 + 60) / t.cellKm) * t.size + Math.round((7.7 + 60) / t.cellKm);
    expect(t.illumination[idx]!).toBeLessThan(0.05);
  }, 60_000);

  it("agrees with NASA's published high-illumination points", async () => {
    const { heights, meta } = await fetchLolaHeights(localFetch);
    const t = buildTerrainFromHeights(heights, {
      kind: "lola",
      product: meta.product,
      resolutionM: meta.sourceResolutionM,
      url: "",
      generatedAt: "",
    });
    // Gläser et al. 2017 report ~76–81% average illumination at these points. Our coarse
    // 750 m horizon model should at least rank them as well lit and not hazardous.
    for (const id of ["shackleton-rim", "connecting-ridge-c1", "connecting-ridge-c2"]) {
      const s = findSite(id)!;
      const m = metricsAt(t, s.x, s.y, DEFAULT_FILTERS, DEFAULT_WEIGHTS);
      console.log(
        `${s.name}: sun ${Math.round(m.illumination * 100)}%, slope ${m.slope.toFixed(1)}°, score ${Math.round(m.score)}`,
      );
      expect(m.illumination).toBeGreaterThan(0.4);
      expect(m.cls).not.toBe("hazard");
    }
  }, 60_000);

  it("combines real terrain with the real sky", async () => {
    const { heights, meta } = await fetchLolaHeights(localFetch);
    const t = buildTerrainFromHeights(heights, {
      kind: "lola",
      product: meta.product,
      resolutionM: 80,
      url: "",
      generatedAt: "",
    });
    const site = findSite("connecting-ridge")!;
    const { lat, lon } = kmToLatLon(site.x, site.y);
    const eph = await getEphemeris(
      ephemerisQuerySchema.parse({ lat, lon, alt: t.heightAt(site.x, site.y) }),
    );
    const sky = liveSky(t, site.x, site.y, eph)!;
    console.log(
      `Connecting Ridge now: sun el ${sky.sunNow.el.toFixed(2)}° vs horizon ${sky.sunNow.horizonDeg.toFixed(2)}°, ` +
        `sunlit ${Math.round(sky.sunlitShare * 100)}% / Earth ${Math.round(sky.earthShare * 100)}% of next 30 days`,
    );
    expect(sky.sunlitShare).toBeGreaterThanOrEqual(0);
    expect(sky.sunlitShare).toBeLessThanOrEqual(1);
  }, 90_000);
});
