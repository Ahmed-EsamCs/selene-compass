import { describe, expect, it } from "vitest";
import { SITES, findSite, labelLevels } from "./sites";
import { MAP_HALF_KM, kmToLatLon, latLonToKm } from "./terrain";

describe("landing sites", () => {
  it("have unique ids and sit inside the mapped window", () => {
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    for (const s of SITES) {
      expect(Math.abs(s.x)).toBeLessThan(MAP_HALF_KM);
      expect(Math.abs(s.y)).toBeLessThan(MAP_HALF_KM);
    }
  });

  it("derive map positions that round-trip to their published lat/lon", () => {
    for (const s of SITES) {
      const ll = kmToLatLon(s.x, s.y);
      expect(ll.lat).toBeCloseTo(s.lat, 6);
      expect((ll.lon + 360) % 360).toBeCloseTo((s.lon + 360) % 360, 6);
    }
    expect(latLonToKm(-90, 0)).toEqual({ x: 0, y: 0 });
  });

  it("cite a source for every site", () => {
    for (const s of SITES) expect(s.ref?.url).toMatch(/^https:\/\//);
    expect(findSite("connecting-ridge")).toMatchObject({ lat: -89.53432, origin: "published" });
  });
});

describe("label stacking", () => {
  it("lifts labels of nearby sites to different levels and leaves isolated ones at 0", () => {
    const levels = labelLevels([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 2, y: 0 },
      { id: "c", x: 1, y: 1 },
      { id: "far", x: 40, y: 40 },
    ]);
    expect([levels.get("a"), levels.get("b"), levels.get("c"), levels.get("far")]).toEqual([
      0, 1, 2, 0,
    ]);
  });
});
