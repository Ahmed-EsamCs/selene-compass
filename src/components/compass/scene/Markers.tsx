import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Classification, TerrainData } from "@/lib/lunar/analysis";
import { CLASS_FROM_INDEX } from "@/lib/lunar/analysis";
import { SITES } from "@/lib/lunar/sites";
import { useCompass } from "@/store/compass";
import { cameraApi } from "./camera-api";
import { PALETTE } from "./palette";
import { cn } from "@/lib/utils";

const CLASS_COLOR = {
  safe: new THREE.Color().setRGB(...PALETTE.safe, THREE.SRGBColorSpace),
  caution: new THREE.Color().setRGB(...PALETTE.caution, THREE.SRGBColorSpace),
  hazard: new THREE.Color().setRGB(...PALETTE.hazard, THREE.SRGBColorSpace),
};

function classAt(data: TerrainData, cls: Classification, x: number, y: number) {
  const ix = Math.round((x + data.halfKm) / data.cellKm);
  const iy = Math.round((y + data.halfKm) / data.cellKm);
  return CLASS_FROM_INDEX[cls.classes[iy * data.size + ix]!] ?? "hazard";
}

export function SiteMarkers({
  data,
  classification,
  exaggeration,
  showLabels,
  labelPortal,
}: {
  data: TerrainData;
  classification: Classification;
  exaggeration: number;
  showLabels: boolean;
  labelPortal: React.RefObject<HTMLElement | null>;
}) {
  const selected = useCompass((s) => s.selectedSiteId);
  const selectSite = useCompass((s) => s.selectSite);

  return (
    <group>
      {SITES.map((s) => {
        const h = data.heightAt(s.x, s.y) * exaggeration;
        const cls = classAt(data, classification, s.x, s.y);
        return (
          <SiteMarker
            key={s.id}
            position={[s.x, h, -s.y]}
            color={CLASS_COLOR[cls]}
            cls={cls}
            name={s.name}
            selected={selected === s.id}
            showLabel={showLabels}
            labelPortal={labelPortal}
            onSelect={() => {
              selectSite(s.id);
              cameraApi.focus(s.x, s.y);
            }}
          />
        );
      })}
    </group>
  );
}

function SiteMarker({
  position,
  color,
  cls,
  name,
  selected,
  showLabel,
  labelPortal,
  onSelect,
}: {
  labelPortal: React.RefObject<HTMLElement | null>;
  position: [number, number, number];
  color: THREE.Color;
  cls: "safe" | "caution" | "hazard";
  name: string;
  selected: boolean;
  showLabel: boolean;
  onSelect: () => void;
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = selected ? 1 + 0.25 * Math.sin(clock.elapsedTime * 3) : 1;
    ring.current.scale.setScalar(s);
  });
  const size = selected ? 1.6 : 1.1;
  return (
    <group position={position}>
      <mesh
        ref={ring}
        rotation-x={-Math.PI / 2}
        position-y={0.15}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <ringGeometry args={[size, size + 0.45, 40]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position-y={3.2} onClick={(e) => (e.stopPropagation(), onSelect())}>
        <cylinderGeometry args={[0.09, 0.09, 6.4, 8]} />
        <meshBasicMaterial color={selected ? PALETTE.cyan : color} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <mesh position-y={6.6}>
        <octahedronGeometry args={[selected ? 0.6 : 0.4]} />
        <meshBasicMaterial color={selected ? PALETTE.cyan : color} toneMapped={false} />
      </mesh>
      {showLabel && (
        <Html position={[0, 8, 0]} center zIndexRange={[15, 0]} portal={labelPortal as React.RefObject<HTMLElement>}>
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "whitespace-nowrap rounded border px-1.5 py-0.5 font-display text-[10px] tracking-wider uppercase backdrop-blur transition-colors",
              selected
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-background/70 text-foreground hover:border-primary",
            )}
          >
            <span
              className={cn(
                "mr-1 inline-block size-1.5 rounded-full align-middle",
                cls === "safe" && "bg-safe",
                cls === "caution" && "bg-caution",
                cls === "hazard" && "bg-hazard",
              )}
            />
            {name}
          </button>
        </Html>
      )}
    </group>
  );
}

export function ProbeMarker({ data, exaggeration }: { data: TerrainData; exaggeration: number }) {
  const probe = useCompass((s) => s.probe);
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 1.5;
  });
  if (!probe) return null;
  const h = data.heightAt(probe.x, probe.y) * exaggeration;
  return (
    <group ref={ref} position={[probe.x, h, -probe.y]}>
      <mesh position-y={2.2} rotation-x={Math.PI}>
        <coneGeometry args={[0.7, 2.2, 4]} />
        <meshBasicMaterial color={PALETTE.cyan} toneMapped={false} wireframe />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.2}>
        <ringGeometry args={[0.9, 1.2, 4]} />
        <meshBasicMaterial color={PALETTE.cyan} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Concentric latitude rings (88°–89.5°S) and longitude spokes draped on the terrain. */
export function PolarGrid({ data, exaggeration }: { data: TerrainData; exaggeration: number }) {
  const geom = useMemo(() => {
    const pts: number[] = [];
    const H = data.halfKm;
    const add = (ax: number, ay: number, bx: number, by: number) => {
      if (Math.abs(ax) > H || Math.abs(ay) > H || Math.abs(bx) > H || Math.abs(by) > H) return;
      pts.push(ax, data.heightAt(ax, ay) * exaggeration + 0.25, -ay);
      pts.push(bx, data.heightAt(bx, by) * exaggeration + 0.25, -by);
    };
    for (const lat of [0.5, 1, 1.5, 2]) {
      const r = lat * 30.32;
      const segs = 180;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        add(r * Math.sin(a0), r * Math.cos(a0), r * Math.sin(a1), r * Math.cos(a1));
      }
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      for (let d = 0; d < 85; d += 1) {
        add(d * Math.sin(a), d * Math.cos(a), (d + 1) * Math.sin(a), (d + 1) * Math.cos(a));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [data, exaggeration]);

  return (
    <lineSegments geometry={geom} raycast={() => null}>
      <lineBasicMaterial color={PALETTE.cyan} transparent opacity={0.28} toneMapped={false} />
    </lineSegments>
  );
}
