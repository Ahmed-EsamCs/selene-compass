import { describe, expect, it } from "vitest";
import { buildTerrainFromHeights } from "./analysis";
import {
  HorizonsError,
  horizonsTime,
  horizonsUrl,
  liveSky,
  parseHorizonsDate,
  parseHorizonsObserver,
  sunPhaseFromSample,
  toMapAzimuth,
} from "./ephemeris";
import { GRID } from "./terrain";

/** Trimmed copy of a Horizons OBSERVER table (CSV, QUANTITIES=4, ANG_FORMAT=DEG). */
const FIXTURE = `*******************************************************************************
Ephemeris / API_USER Mon Nov  9 21:00:00 2026 Pasadena, USA      / Horizons
*******************************************************************************
Target body name: Earth (399)                     {source: DE441}
Center body name: Moon (301)                      {source: DE441}
Center-site name: (user defined site below)
*******************************************************************************
 Date__(UT)__HR:MN, , , Azi_(a-app), Elev_(a-app),
***************************************************************
$$SOE
 2026-Nov-09 00:00, , ,  230.123456,   1.234567,
 2026-Nov-09 06:00,*,m,  231.000000,   2.000000,
 2026-Nov-09 12:00, , ,  229.500000,  -0.500000,
$$EOE
***************************************************************
`;

describe("Horizons query", () => {
  it("builds an OBSERVER query for a topocentric site on the Moon", () => {
    const url = new URL(
      horizonsUrl("earth", {
        latDeg: -89.67,
        lonDeg: -40,
        altKm: 1.2,
        start: new Date(Date.UTC(2026, 10, 9, 21)),
        days: 2,
        stepHours: 6,
      }),
    );
    expect(url.origin + url.pathname).toBe("https://ssd.jpl.nasa.gov/api/horizons.api");
    const p = url.searchParams;
    expect(p.get("COMMAND")).toBe("'399'");
    expect(p.get("CENTER")).toBe("'coord@301'");
    expect(p.get("SITE_COORD")).toBe("'320.0000,-89.6700,1.200'"); // west → 0..360 east
    expect(p.get("START_TIME")).toBe("'2026-11-09 21:00'");
    expect(p.get("STOP_TIME")).toBe("'2026-11-11 21:00'");
    expect(p.get("QUANTITIES")).toBe("'4'");
    expect(p.get("CSV_FORMAT")).toBe("'YES'");
  });

  it("formats and parses Horizons dates as UTC", () => {
    expect(horizonsTime(new Date(Date.UTC(2026, 0, 5, 3, 7)))).toBe("2026-01-05 03:07");
    expect(parseHorizonsDate("2026-Nov-09 06:00")).toBe(Date.UTC(2026, 10, 9, 6));
    expect(parseHorizonsDate("2026-Nov-09 06:00:30.500")).toBe(
      Date.UTC(2026, 10, 9, 6, 0, 30, 500),
    );
    expect(parseHorizonsDate("nonsense")).toBeNaN();
  });
});

describe("Horizons parsing", () => {
  it("reads az/el rows by header name, ignoring flag columns", () => {
    const rows = parseHorizonsObserver(FIXTURE);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ t: Date.UTC(2026, 10, 9, 6), az: 231, el: 2 });
    expect(rows[2]!.el).toBe(-0.5);
  });

  it("surfaces Horizons error text when there is no ephemeris", () => {
    expect(() => parseHorizonsObserver("Cannot interpret date. Type `?!` for help.\n")).toThrow(
      HorizonsError,
    );
    expect(() => parseHorizonsObserver("Cannot interpret date.\n")).toThrow(
      /Cannot interpret date/,
    );
  });
});

describe("azimuth frames", () => {
  it("maps Horizons azimuth (from local north) into the map frame", () => {
    // From 129.78°E, the 0°E meridian (Earth-facing, map +y) lies at Horizons azimuth ≈ 230.2°.
    expect(toMapAzimuth(360 - 129.78, 129.78)).toBeCloseTo(0, 9);
    // At 0°E, local north *is* map +y.
    expect(toMapAzimuth(90, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(sunPhaseFromSample({ t: 0, az: 180, el: 0 }, 0)).toBeCloseTo(0.5, 9);
  });
});

describe("live sky against terrain", () => {
  // Flat terrain: horizon is set only by lunar curvature (slightly below 0°).
  const flat = buildTerrainFromHeights(new Float32Array(GRID * GRID), { kind: "simulated" });
  const t0 = Date.UTC(2026, 10, 9);
  const h = 3_600_000;
  const eph = {
    sun: [
      { t: t0, az: 10, el: 1 },
      { t: t0 + 6 * h, az: 100, el: 0.5 },
      { t: t0 + 12 * h, az: 190, el: -1.2 },
      { t: t0 + 18 * h, az: 280, el: -0.8 },
    ],
    earth: [
      { t: t0, az: 0, el: 3 },
      { t: t0 + 6 * h, az: 2, el: 2 },
      { t: t0 + 12 * h, az: 4, el: -3 },
      { t: t0 + 18 * h, az: 6, el: -4 },
    ],
  };

  it("reports what is above the horizon now and when it changes", () => {
    const sky = liveSky(flat, 10, 10, eph, t0 + 3 * h)!;
    expect(sky.sunNow.visible).toBeGreaterThan(0.5);
    expect(sky.earthNow.visible).toBe(1);
    expect(sky.nextSunChange).toEqual({ t: t0 + 12 * h, to: "sunset" });
    expect(sky.nextEarthChange).toEqual({ t: t0 + 12 * h, to: "set" });
    expect(sky.sunlitShare).toBeCloseTo(1 / 3, 9);
  });

  it("interpolates azimuth across the 360° wrap", () => {
    const sky = liveSky(
      flat,
      10,
      10,
      {
        sun: [
          { t: 0, az: 350, el: 1 },
          { t: 10, az: 10, el: 1 },
        ],
        earth: eph.earth,
      },
      5,
    )!;
    expect(sky.sunNow.az).toBeCloseTo(0, 9);
  });

  it("returns null without samples", () => {
    expect(liveSky(flat, 0, 0, { sun: [], earth: [] })).toBeNull();
  });
});
