import { describe, expect, it } from "vitest";
import {
  demLayoutFromLabel,
  latLonToPixel,
  makePixelReader,
  parsePdsLabel,
  requiredLines,
  resampleToGrid,
} from "./pds";
import { CELL_KM, GRID, MAP_HALF_KM, gridToKm, kmToLatLon } from "./terrain";

/** Shaped like the real LOLA polar LDEM labels (PDS3 ODL). */
function makeLabel(opts: {
  size: number;
  scaleM: number;
  type?: string;
  bits?: number;
  unit?: string;
  offset?: number;
}) {
  const c = opts.size / 2 - 0.5;
  return `PDS_VERSION_ID       = "PDS3"
RECORD_TYPE          = FIXED_LENGTH
RECORD_BYTES         = ${opts.size * ((opts.bits ?? 32) / 8)}
^IMAGE               = "LDEM_TEST.IMG"
/* comment that should be ignored */
OBJECT               = IMAGE
  NAME               = HEIGHT
  DESCRIPTION        = "Multi-line description
                        that spans lines = with an equals sign."
  LINES              = ${opts.size}
  LINE_SAMPLES       = ${opts.size}
  SAMPLE_TYPE        = ${opts.type ?? "PC_REAL"}
  SAMPLE_BITS        = ${opts.bits ?? 32}
  UNIT               = ${opts.unit ?? "KILOMETER"}
  SCALING_FACTOR     = ${opts.unit === "METER" ? 0.5 : 1}
  OFFSET             = ${opts.offset ?? 0}
END_OBJECT           = IMAGE
OBJECT               = IMAGE_MAP_PROJECTION
  MAP_PROJECTION_TYPE  = "POLAR STEREOGRAPHIC"
  A_AXIS_RADIUS        = 1737.4 <KM>
  MAP_SCALE            = ${opts.scaleM} <METERS/PIXEL>
  CENTER_LATITUDE      = -90 <DEG>
  CENTER_LONGITUDE     = 0 <DEG>
  LINE_PROJECTION_OFFSET   = ${c} <PIXEL>
  SAMPLE_PROJECTION_OFFSET = ${c} <PIXEL>
END_OBJECT           = IMAGE_MAP_PROJECTION
END
`;
}

/** A known synthetic surface: a tilted plane plus a bowl at Shackleton's position. */
const truth = (x: number, y: number) =>
  0.01 * x - 0.02 * y - 3 * Math.exp(-((x - 7.7) ** 2 + (y + 6.4) ** 2) / 40);

/** Render the truth into a synthetic south polar stereographic product. */
function synthProduct(size: number, scaleM: number) {
  const layout = demLayoutFromLabel(parsePdsLabel(makeLabel({ size, scaleM })));
  const buf = new DataView(new ArrayBuffer(size * size * 4));
  const R = 1737.4;
  for (let line = 0; line < size; line++) {
    for (let s = 0; s < size; s++) {
      const px = (s - layout.sampleProjectionOffset) * layout.mapScaleKm;
      const py = (layout.lineProjectionOffset - line) * layout.mapScaleKm;
      // Invert the stereographic projection, then map into the app frame.
      const rho = Math.hypot(px, py);
      const colat = 2 * Math.atan(rho / (2 * R));
      const lon = Math.atan2(px, py);
      const d = colat * R;
      buf.setFloat32((line * size + s) * 4, truth(d * Math.sin(lon), d * Math.cos(lon)), true);
    }
  }
  return { layout, buf };
}

describe("PDS label parsing", () => {
  it("reads nested OBJECT keys, units, multi-line strings and ignores comments", () => {
    const label = parsePdsLabel(makeLabel({ size: 100, scaleM: 80 }));
    expect(label.values["IMAGE.LINES"]).toBe("100");
    expect(label.values["IMAGE.DESCRIPTION"]).toContain("equals sign");
    const layout = demLayoutFromLabel(label);
    expect(layout).toMatchObject({
      lines: 100,
      samples: 100,
      kind: "float",
      littleEndian: true,
      headerBytes: 0,
    });
    expect(layout.mapScaleKm).toBeCloseTo(0.08, 9);
    expect(layout.radiusKm).toBe(1737.4);
  });

  it("decodes 16-bit integer products scaled to metres of radius", () => {
    const layout = demLayoutFromLabel(
      parsePdsLabel(
        makeLabel({
          size: 4,
          scaleM: 240,
          type: "LSB_INTEGER",
          bits: 16,
          unit: "METER",
          offset: 1737400,
        }),
      ),
    );
    // 2000 counts × 0.5 m + 1737400 m → +1.0 km above the reference sphere
    expect(layout.valueToKm(2000)).toBeCloseTo(1.0, 9);
    const dv = new DataView(new ArrayBuffer(4 * 4 * 2));
    dv.setInt16(0, -1000, true);
    expect(makePixelReader(layout, dv, 0)(0, 0)).toBeCloseTo(-0.5, 9);
  });

  it("rejects non-polar products", () => {
    const text = makeLabel({ size: 4, scaleM: 80 }).replace(
      "POLAR STEREOGRAPHIC",
      "SIMPLE CYLINDRICAL",
    );
    expect(() => demLayoutFromLabel(parsePdsLabel(text))).toThrow(/POLAR STEREOGRAPHIC/);
  });
});

describe("polar stereographic mapping", () => {
  const layout = demLayoutFromLabel(parsePdsLabel(makeLabel({ size: 2000, scaleM: 100 })));

  it("puts the pole at the projection centre", () => {
    const p = latLonToPixel(layout, -90, 0);
    expect(p.line).toBeCloseTo(layout.lineProjectionOffset, 6);
    expect(p.sample).toBeCloseTo(layout.sampleProjectionOffset, 6);
  });

  it("puts 0°E toward the top of the image and 90°E to the right", () => {
    const up = latLonToPixel(layout, -89, 0);
    const right = latLonToPixel(layout, -89, 90);
    expect(up.line).toBeLessThan(layout.lineProjectionOffset);
    expect(up.sample).toBeCloseTo(layout.sampleProjectionOffset, 6);
    expect(right.sample).toBeGreaterThan(layout.sampleProjectionOffset);
    expect(right.line).toBeCloseTo(layout.lineProjectionOffset, 6);
  });

  it("only asks for the rows that cover the map window", () => {
    const { first, last } = requiredLines(layout);
    const rowsKm = ((last - first) * layout.mapScaleKm) / 2;
    expect(rowsKm).toBeGreaterThan(MAP_HALF_KM);
    expect(rowsKm).toBeLessThan(MAP_HALF_KM + 6);
  });
});

describe("resampling to the app grid", () => {
  it("reproduces a known surface at the right map positions (orientation + scale)", () => {
    const { layout, buf } = synthProduct(1700, 80);
    const out = resampleToGrid(layout, makePixelReader(layout, buf, 0));
    expect(out.length).toBe(GRID * GRID);
    let maxErr = 0;
    for (let iy = 0; iy < GRID; iy += 7) {
      for (let ix = 0; ix < GRID; ix += 7) {
        const err = Math.abs(out[iy * GRID + ix]! - truth(gridToKm(ix), gridToKm(iy)));
        maxErr = Math.max(maxErr, err);
      }
    }
    // Box-filtering over a 0.75 km cell smooths the bowl slightly; the plane must be exact-ish.
    expect(maxErr).toBeLessThan(0.05);
    // The bowl lands where Shackleton is, not mirrored.
    const k = (x: number, y: number) =>
      Math.round((y + MAP_HALF_KM) / CELL_KM) * GRID + Math.round((x + MAP_HALF_KM) / CELL_KM);
    expect(out[k(7.7, -6.4)]!).toBeLessThan(out[k(-7.7, -6.4)]! - 2);
    expect(out[k(7.7, -6.4)]!).toBeLessThan(out[k(7.7, 6.4)]! - 2);
    expect(kmToLatLon(7.7, -6.4).lon).toBeCloseTo(129.7, 0);
  });
});
