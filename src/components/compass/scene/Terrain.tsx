import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Classification, TerrainData } from "@/lib/lunar/analysis";
import { PSR_ILLUMINATION } from "@/lib/lunar/analysis";
import { valueNoise } from "@/lib/lunar/terrain";
import { useCompass, type ColorMode, type Layers } from "@/store/compass";
import { PALETTE, RAMPS, mix, ramp } from "./palette";

/** Palette values are sRGB; vertex colours are read as linear. */
const lin = (v: number) => Math.pow(v, 2.2);

interface Props {
  data: TerrainData;
  classification: Classification;
  colorMode: ColorMode;
  layers: Layers;
  exaggeration: number;
}

export function Terrain({ data, classification, colorMode, layers, exaggeration }: Props) {
  const n = data.size;
  const setHover = useCompass((s) => s.setHover);
  const setProbe = useCompass((s) => s.setProbe);
  const lastCell = useRef(-1);

  const { base, overlay } = useMemo(() => {
    const positions = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const span = data.maxH - data.minH;
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const k = iy * n + ix;
        const x = -data.halfKm + ix * data.cellKm;
        const y = -data.halfKm + iy * data.cellKm;
        positions[k * 3] = x;
        positions[k * 3 + 1] = data.height[k]!;
        positions[k * 3 + 2] = -y;
        const t = (data.height[k]! - data.minH) / span;
        const grain = 0.06 * valueNoise(x * 1.7, y * 1.7, 7);
        const c = mix(PALETTE.regolithLow, PALETTE.regolithHigh, Math.min(1, t * 0.9 + 0.1 + grain));
        colors[k * 3] = lin(c[0]);
        colors[k * 3 + 1] = lin(c[1]);
        colors[k * 3 + 2] = lin(c[2]);
      }
    }
    const index: number[] = [];
    for (let iy = 0; iy < n - 1; iy++) {
      for (let ix = 0; ix < n - 1; ix++) {
        const a = iy * n + ix;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        // Counter-clockwise seen from above (+Y): rows advance toward −Z.
        index.push(a, b, c, b, d, c);
      }
    }
    const pos = new THREE.BufferAttribute(positions, 3);
    const idx = new THREE.Uint32BufferAttribute(index, 1);
    const base = new THREE.BufferGeometry();
    base.setAttribute("position", pos);
    base.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    base.setIndex(idx);
    const overlay = new THREE.BufferGeometry();
    overlay.setAttribute("position", pos);
    overlay.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * n * 4), 4));
    overlay.setIndex(idx);
    return { base, overlay };
  }, [data, n]);

  useEffect(
    () => () => {
      base.dispose();
      overlay.dispose();
    },
    [base, overlay],
  );

  // Vertical exaggeration
  useEffect(() => {
    const pos = base.getAttribute("position") as THREE.BufferAttribute;
    for (let k = 0; k < n * n; k++) pos.setY(k, data.height[k]! * exaggeration);
    pos.needsUpdate = true;
    base.computeVertexNormals();
    overlay.setAttribute("normal", base.getAttribute("normal"));
    base.computeBoundingSphere();
    base.computeBoundingBox();
    overlay.computeBoundingSphere();
  }, [base, overlay, data, exaggeration, n]);

  // Overlay colours
  useEffect(() => {
    const attr = overlay.getAttribute("color") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const span = data.maxH - data.minH;
    for (let k = 0; k < n * n; k++) {
      let c: readonly number[] = [0, 0, 0];
      let a = 0;
      if (colorMode === "safety") {
        const cls = classification.classes[k]!;
        if (cls === 0 && layers.safe) [c, a] = [PALETTE.safe, 0.62];
        else if (cls === 1 && layers.caution) [c, a] = [PALETTE.caution, 0.22];
        else if (cls === 2 && layers.hazard) [c, a] = [PALETTE.hazard, 0.42];
      } else if (colorMode === "slope") {
        [c, a] = [ramp(RAMPS.slope, data.slope[k]! / 25), 0.7];
      } else if (colorMode === "illumination") {
        [c, a] = [ramp(RAMPS.illumination, data.illumination[k]! / 0.75), 0.75];
      } else if (colorMode === "comm") {
        [c, a] = [ramp(RAMPS.comm, data.comm[k]! / 0.65), 0.75];
      } else if (colorMode === "elevation") {
        [c, a] = [ramp(RAMPS.elevation, (data.height[k]! - data.minH) / span), 0.7];
      }
      if (layers.psr && data.illumination[k]! < PSR_ILLUMINATION) {
        c = a > 0 ? mix(c, PALETTE.psr, 0.75) : PALETTE.psr;
        a = Math.max(a, 0.42);
      }
      arr[k * 4] = lin(c[0]!);
      arr[k * 4 + 1] = lin(c[1]!);
      arr[k * 4 + 2] = lin(c[2]!);
      arr[k * 4 + 3] = a;
    }
    attr.needsUpdate = true;
  }, [overlay, classification, colorMode, layers, data, n]);

  const toMap = (p: THREE.Vector3) => ({ x: p.x, y: -p.z });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const m = toMap(e.point);
    const cell =
      Math.round((m.y + data.halfKm) / data.cellKm) * n + Math.round((m.x + data.halfKm) / data.cellKm);
    if (cell !== lastCell.current) {
      lastCell.current = cell;
      setHover(m);
    }
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // was a drag
    e.stopPropagation();
    setProbe(toMap(e.point));
  };

  return (
    <group>
      <mesh
        geometry={base}
        castShadow={layers.shadows}
        receiveShadow={layers.shadows}
        onPointerMove={onMove}
        onPointerOut={() => {
          lastCell.current = -1;
          setHover(null);
        }}
        onClick={onClick}
      >
        <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
      </mesh>
      <mesh geometry={overlay} renderOrder={1} raycast={() => null}>
        <meshBasicMaterial
          vertexColors
          transparent
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
