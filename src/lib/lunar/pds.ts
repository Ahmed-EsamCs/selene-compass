/**
 * Pure helpers for reading NASA PDS3 polar-stereographic DEM products (LRO LOLA LDEM_*S_*)
 * and resampling them onto the app's map grid. No I/O here — the download script in
 * `scripts/fetch-lola-dem.ts` feeds bytes in, so everything below is unit-testable.
 */
import { GRID, MAP_HALF_KM, gridToKm, kmToLatLon } from "./terrain";

export interface PdsLabel {
  /** Flat `KEY = value` pairs; nested OBJECTs are prefixed `OBJECT.KEY` (e.g. `IMAGE.LINES`). */
  values: Record<string, string>;
}

/** Parse a PDS3 ODL label. Handles OBJECT/END_OBJECT nesting, quoted strings and `<UNIT>` suffixes. */
export function parsePdsLabel(text: string): PdsLabel {
  const values: Record<string, string> = {};
  const stack: string[] = [];
  let pendingKey: string | null = null;
  let pendingValue = "";

  const commit = (key: string, raw: string) => {
    const full = stack.length ? `${stack.join(".")}.${key}` : key;
    values[full] = raw.trim();
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\*.*?\*\//g, "").trimEnd();
    if (pendingKey) {
      pendingValue += ` ${line.trim()}`;
      if (isBalanced(pendingValue)) {
        commit(pendingKey, pendingValue);
        pendingKey = null;
      }
      continue;
    }
    const m = /^\s*([A-Z0-9_^:]+)\s*=\s*(.*)$/i.exec(line);
    if (!m) {
      if (/^\s*END\s*$/i.test(line)) break;
      continue;
    }
    const key = m[1]!.toUpperCase();
    const value = m[2]!;
    if (key === "OBJECT" || key === "GROUP") {
      stack.push(value.trim().replace(/"/g, "").toUpperCase());
      continue;
    }
    if (key === "END_OBJECT" || key === "END_GROUP") {
      stack.pop();
      continue;
    }
    if (!isBalanced(value)) {
      pendingKey = key;
      pendingValue = value;
      continue;
    }
    commit(key, value);
  }
  return { values };
}

function isBalanced(v: string) {
  const quotes = (v.match(/"/g) ?? []).length;
  const open = (v.match(/[({]/g) ?? []).length;
  const close = (v.match(/[)}]/g) ?? []).length;
  return quotes % 2 === 0 && open === close;
}

/** Find a key regardless of the OBJECT it lives in (first match wins, exact key preferred). */
export function labelValue(label: PdsLabel, key: string): string | undefined {
  const k = key.toUpperCase();
  if (k in label.values) return label.values[k];
  const hit = Object.keys(label.values).find((x) => x === k || x.endsWith(`.${k}`));
  return hit ? label.values[hit] : undefined;
}

/** Numeric value with optional `<UNIT>`; converts KM↔M when `want` is given. */
export function labelNumber(label: PdsLabel, key: string, want?: "KM" | "M"): number {
  const raw = labelValue(label, key);
  if (raw === undefined) throw new Error(`PDS label is missing ${key}`);
  const m = /^\s*"?([-+0-9.eE]+)"?\s*(?:<\s*([A-Z/]+)\s*>)?/i.exec(raw);
  if (!m) throw new Error(`PDS label ${key} is not numeric: ${raw}`);
  let v = Number(m[1]);
  const unit = m[2]?.toUpperCase();
  if (want && unit) {
    const base = unit.split("/")[0];
    if (base === "M" && want === "KM") v /= 1000;
    if (base === "KM" && want === "M") v *= 1000;
  }
  if (!Number.isFinite(v)) throw new Error(`PDS label ${key} is not finite: ${raw}`);
  return v;
}

export interface DemLayout {
  lines: number;
  samples: number;
  bytesPerSample: 2 | 4;
  kind: "float" | "int";
  littleEndian: boolean;
  scalingFactor: number;
  offset: number;
  /** Image record (byte) offset of the first pixel. */
  headerBytes: number;
  /** Polar stereographic parameters. */
  radiusKm: number;
  centerLatitude: number;
  centerLongitude: number;
  mapScaleKm: number;
  lineProjectionOffset: number;
  sampleProjectionOffset: number;
  /** Factor that converts a scaled pixel value to km relative to `radiusKm`. */
  valueToKm: (v: number) => number;
}

/** Turn a parsed LOLA LDEM label into a byte/projection layout. */
export function demLayoutFromLabel(label: PdsLabel): DemLayout {
  const lines = labelNumber(label, "IMAGE.LINES");
  const samples = labelNumber(label, "IMAGE.LINE_SAMPLES");
  const bits = labelNumber(label, "IMAGE.SAMPLE_BITS");
  const type = (labelValue(label, "IMAGE.SAMPLE_TYPE") ?? "").replace(/"/g, "").toUpperCase();
  if (bits !== 16 && bits !== 32) throw new Error(`Unsupported SAMPLE_BITS ${bits}`);
  const kind = /REAL|FLOAT|IEEE/.test(type) ? "float" : "int";
  const littleEndian = /PC_|LSB|VAX/.test(type);
  const scalingFactor = numberOr(label, "IMAGE.SCALING_FACTOR", 1);
  const offset = numberOr(label, "IMAGE.OFFSET", 0);

  const projection = (labelValue(label, "MAP_PROJECTION_TYPE") ?? "")
    .replace(/"/g, "")
    .toUpperCase();
  if (!projection.includes("POLAR STEREOGRAPHIC")) {
    throw new Error(`Expected a POLAR STEREOGRAPHIC product, got "${projection}"`);
  }
  const radiusKm = labelNumber(label, "A_AXIS_RADIUS", "KM");
  const centerLatitude = labelNumber(label, "CENTER_LATITUDE");
  const centerLongitude = labelNumber(label, "CENTER_LONGITUDE");
  // LOLA labels give MAP_SCALE in <KM/PIXEL> or <METERS/PIXEL>.
  const scaleRaw = labelValue(label, "MAP_SCALE") ?? "";
  let mapScaleKm = labelNumber(label, "MAP_SCALE");
  if (/METER|<\s*M\s*\//i.test(scaleRaw)) mapScaleKm /= 1000;
  const lineProjectionOffset = labelNumber(label, "LINE_PROJECTION_OFFSET");
  const sampleProjectionOffset = labelNumber(label, "SAMPLE_PROJECTION_OFFSET");

  // Records: ^IMAGE = ("FILE.IMG", n) or ^IMAGE = n means a header before the pixels.
  let headerBytes = 0;
  const pointer = labelValue(label, "^IMAGE");
  const recordBytes = numberOr(label, "RECORD_BYTES", 0);
  const ptr = pointer ? /(\d+)\s*(<\s*BYTES\s*>)?\s*\)?\s*$/i.exec(pointer) : null;
  if (ptr && !/^\s*"[^"]+"\s*$/.test(pointer!)) {
    const n = Number(ptr[1]);
    headerBytes = ptr[2] ? n - 1 : Math.max(0, n - 1) * recordBytes;
  }

  // Heights are stored either in km (float products) or as radius/height in metres scaled by
  // SCALING_FACTOR + OFFSET. Normalise both to "km above the reference radius".
  const unit = (labelValue(label, "IMAGE.UNIT") ?? "").replace(/"/g, "").toUpperCase();
  const scaled = (v: number) => v * scalingFactor + offset;
  const radiusM = radiusKm * 1000;
  let valueToKm: (v: number) => number;
  if (unit.startsWith("KILOMETER") || unit === "KM") {
    valueToKm = (v) => {
      const s = scaled(v);
      return s > radiusKm * 0.5 ? s - radiusKm : s;
    };
  } else {
    valueToKm = (v) => {
      const s = scaled(v);
      return (s > radiusM * 0.5 ? s - radiusM : s) / 1000;
    };
  }

  return {
    lines,
    samples,
    bytesPerSample: (bits / 8) as 2 | 4,
    kind,
    littleEndian,
    scalingFactor,
    offset,
    headerBytes,
    radiusKm,
    centerLatitude,
    centerLongitude,
    mapScaleKm,
    lineProjectionOffset,
    sampleProjectionOffset,
    valueToKm,
  };
}

function numberOr(label: PdsLabel, key: string, fallback: number) {
  return labelValue(label, key) === undefined ? fallback : labelNumber(label, key);
}

const DEG = Math.PI / 180;

/**
 * Selenographic (lat, east-lon) → fractional 0-based (line, sample) in a south polar
 * stereographic product (PDS3 convention: x = (sample − S0)·scale, y = (L0 − line)·scale).
 */
export function latLonToPixel(layout: DemLayout, latDeg: number, lonDeg: number) {
  const south = layout.centerLatitude < 0;
  const phi = latDeg * DEG;
  const rho = 2 * layout.radiusKm * Math.tan(Math.PI / 4 + (south ? phi : -phi) / 2);
  const dl = (lonDeg - layout.centerLongitude) * DEG;
  const x = rho * Math.sin(dl);
  const y = south ? rho * Math.cos(dl) : -rho * Math.cos(dl);
  return {
    line: layout.lineProjectionOffset - y / layout.mapScaleKm,
    sample: layout.sampleProjectionOffset + x / layout.mapScaleKm,
  };
}

/** Rows (0-based, inclusive) of the product needed to cover the app's map window. */
export function requiredLines(layout: DemLayout, marginKm = 2): { first: number; last: number } {
  let lo = Infinity;
  let hi = -Infinity;
  const H = MAP_HALF_KM + marginKm;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    for (const [x, y] of [
      [-H + (2 * H * i) / steps, -H],
      [-H + (2 * H * i) / steps, H],
      [-H, -H + (2 * H * i) / steps],
      [H, -H + (2 * H * i) / steps],
    ] as const) {
      const { lat, lon } = kmToLatLon(x, y);
      const p = latLonToPixel(layout, lat, lon);
      lo = Math.min(lo, p.line);
      hi = Math.max(hi, p.line);
    }
  }
  return {
    first: Math.max(0, Math.floor(lo) - 2),
    last: Math.min(layout.lines - 1, Math.ceil(hi) + 2),
  };
}

/** Decode one pixel from a row buffer that starts at product line `firstLine`. */
export function makePixelReader(layout: DemLayout, rows: DataView, firstLine: number) {
  const rowBytes = layout.samples * layout.bytesPerSample;
  const lastLine = firstLine + Math.floor(rows.byteLength / rowBytes) - 1;
  return (line: number, sample: number): number => {
    const l = Math.max(firstLine, Math.min(lastLine, line));
    const s = Math.max(0, Math.min(layout.samples - 1, sample));
    const at = (l - firstLine) * rowBytes + s * layout.bytesPerSample;
    let v: number;
    if (layout.kind === "float") {
      v = layout.bytesPerSample === 4 ? rows.getFloat32(at, layout.littleEndian) : NaN;
    } else {
      v =
        layout.bytesPerSample === 2
          ? rows.getInt16(at, layout.littleEndian)
          : rows.getInt32(at, layout.littleEndian);
    }
    return layout.valueToKm(v);
  };
}

function bilinear(read: (l: number, s: number) => number, line: number, sample: number) {
  const l0 = Math.floor(line);
  const s0 = Math.floor(sample);
  const tl = line - l0;
  const ts = sample - s0;
  const a = read(l0, s0);
  const b = read(l0, s0 + 1);
  const c = read(l0 + 1, s0);
  const d = read(l0 + 1, s0 + 1);
  return a * (1 - tl) * (1 - ts) + b * (1 - tl) * ts + c * tl * (1 - ts) + d * tl * ts;
}

/**
 * Resample the DEM onto the app's GRID×GRID map (row-major, iy = 0 at y = −MAP_HALF_KM).
 * Each output cell is the mean of a k×k bilinear sub-sample so a fine product is box-filtered
 * down to the 0.75 km cell instead of aliasing.
 */
export function resampleToGrid(
  layout: DemLayout,
  read: (line: number, sample: number) => number,
  size = GRID,
): Float32Array {
  const cellKm = (2 * MAP_HALF_KM) / (size - 1);
  const k = Math.max(1, Math.min(8, Math.ceil(cellKm / layout.mapScaleKm)));
  const out = new Float32Array(size * size);
  for (let iy = 0; iy < size; iy++) {
    for (let ix = 0; ix < size; ix++) {
      const cx = size === GRID ? gridToKm(ix) : -MAP_HALF_KM + ix * cellKm;
      const cy = size === GRID ? gridToKm(iy) : -MAP_HALF_KM + iy * cellKm;
      let sum = 0;
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const x = cx + ((i + 0.5) / k - 0.5) * cellKm;
          const y = cy + ((j + 0.5) / k - 0.5) * cellKm;
          const { lat, lon } = kmToLatLon(x, y);
          const p = latLonToPixel(layout, lat, lon);
          sum += bilinear(read, p.line, p.sample);
        }
      }
      out[iy * size + ix] = sum / (k * k);
    }
  }
  return out;
}
