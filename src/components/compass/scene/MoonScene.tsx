import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Classification, TerrainData } from "@/lib/lunar/analysis";
import { useCompass } from "@/store/compass";
import { Terrain } from "./Terrain";
import { PolarGrid, ProbeMarker, SiteMarkers } from "./Markers";
import { cameraApi } from "./camera-api";
import { PALETTE } from "./palette";

/** Display-only light elevation; the analysis uses the real ≈1.5° sun. */
const DISPLAY_SUN_ELEV = 9 * (Math.PI / 180);
const HOME_POS = new THREE.Vector3(0, 78, 96);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);
const MIN_DIST = 20;
const MAX_DIST = 240;

function sunDir(phase: number) {
  const az = phase * Math.PI * 2;
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(DISPLAY_SUN_ELEV),
    Math.sin(DISPLAY_SUN_ELEV),
    -Math.cos(az) * Math.cos(DISPLAY_SUN_ELEV),
  );
}

function Lighting({ shadows }: { shadows: boolean }) {
  const phase = useCompass((s) => s.sunPhase);
  const light = useRef<THREE.DirectionalLight>(null);
  const dir = useMemo(() => sunDir(phase), [phase]);
  useEffect(() => {
    if (light.current) {
      light.current.position.copy(dir).multiplyScalar(150);
      light.current.target.position.set(0, 0, 0);
      light.current.target.updateMatrixWorld();
    }
  }, [dir]);
  return (
    <>
      <ambientLight intensity={0.22} />
      <hemisphereLight args={["#9fc4ff", "#0b0f1c", 0.35]} />
      <directionalLight
        ref={light}
        intensity={2.6}
        color={PALETTE.sun}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-near={1}
        shadow-camera-far={400}
      />
      <group position={dir.clone().multiplyScalar(900)}>
        <mesh>
          <sphereGeometry args={[7, 24, 24]} />
          <meshBasicMaterial color={PALETTE.sun} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[18, 24, 24]} />
          <meshBasicMaterial color={PALETTE.sun} transparent opacity={0.12} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

function Earth() {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1d4f9c";
    g.fillRect(0, 0, 256, 128);
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 3 === 0 ? "rgba(255,255,255,0.75)" : "rgba(70,140,80,0.85)";
      g.beginPath();
      g.ellipse(
        rnd() * 256,
        20 + rnd() * 88,
        6 + rnd() * 24,
        3 + rnd() * 10,
        rnd() * 3,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.05;
  });
  const elev = 5 * (Math.PI / 180);
  return (
    <mesh ref={ref} position={[0, Math.sin(elev) * 800, -Math.cos(elev) * 800]}>
      <sphereGeometry args={[16, 48, 48]} />
      <meshStandardMaterial map={tex} roughness={0.7} emissive="#0a1a3a" emissiveIntensity={0.6} />
    </mesh>
  );
}

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const narrow = size.width / size.height < 0.8;
  const home = useMemo(() => HOME_POS.clone().multiplyScalar(narrow ? 1.55 : 1), [narrow]);
  const homeRef = useRef(home);
  homeRef.current = home;

  // Portrait screens need a wider framing to fit the map.
  useEffect(() => {
    if (narrow) camera.position.copy(homeRef.current);
  }, [narrow, camera]);
  const autoRotate = useCompass((s) => s.autoRotate);
  const anim = useRef<{
    fromP: THREE.Vector3;
    toP: THREE.Vector3;
    fromT: THREE.Vector3;
    toT: THREE.Vector3;
    t: number;
  } | null>(null);

  useEffect(() => {
    const ctl = () => controls.current!;
    const go = (toP: THREE.Vector3, toT: THREE.Vector3) => {
      anim.current = {
        fromP: camera.position.clone(),
        toP,
        fromT: ctl().target.clone(),
        toT,
        t: 0,
      };
    };
    const offset = () => camera.position.clone().sub(ctl().target);
    cameraApi.zoom = (f) => {
      const o = offset();
      const len = THREE.MathUtils.clamp(o.length() * f, MIN_DIST, MAX_DIST);
      go(ctl().target.clone().add(o.setLength(len)), ctl().target.clone());
    };
    cameraApi.rotate = (deg) => {
      const o = offset().applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
      go(ctl().target.clone().add(o), ctl().target.clone());
    };
    cameraApi.tilt = (deg) => {
      const s = new THREE.Spherical().setFromVector3(offset());
      s.phi = THREE.MathUtils.clamp(s.phi + (deg * Math.PI) / 180, 0.02, 1.45);
      go(ctl().target.clone().add(new THREE.Vector3().setFromSpherical(s)), ctl().target.clone());
    };
    cameraApi.pan = (dx, dy) => {
      // dx/dy in km, relative to the current view heading
      const o = offset();
      const fwd = new THREE.Vector3(-o.x, 0, -o.z).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const move = right.multiplyScalar(dx).add(fwd.multiplyScalar(dy));
      const t = ctl().target.clone().add(move);
      t.x = THREE.MathUtils.clamp(t.x, -60, 60);
      t.z = THREE.MathUtils.clamp(t.z, -60, 60);
      go(t.clone().add(o), t);
    };
    cameraApi.reset = () => go(homeRef.current.clone(), HOME_TARGET.clone());
    cameraApi.top = () => {
      const len = Math.max(offset().length(), 110);
      const t = ctl().target.clone();
      go(t.clone().add(new THREE.Vector3(0, len, 0.01)), t);
    };
    cameraApi.focus = (x, y) => {
      const t = new THREE.Vector3(x, 0, -y);
      const o = offset();
      o.y = Math.max(o.y, 10);
      go(t.clone().add(o.setLength(48)), t);
    };
  }, [camera]);

  useFrame((_, delta) => {
    const a = anim.current;
    const ctl = controls.current;
    if (!a || !ctl) return;
    a.t = Math.min(1, a.t + Math.min(delta, 0.05) / 0.8);
    const e = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerpVectors(a.fromP, a.toP, e);
    ctl.target.lerpVectors(a.fromT, a.toT, e);
    ctl.update();
    if (a.t >= 1) anim.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={MIN_DIST}
      maxDistance={MAX_DIST}
      maxPolarAngle={1.45}
      autoRotate={autoRotate}
      autoRotateSpeed={0.6}
      onStart={() => (anim.current = null)}
    />
  );
}

function SunStepper() {
  const playing = useCompass((s) => s.sunPlaying);
  const acc = useRef(0);
  useFrame((_, dt) => {
    if (!playing) return;
    acc.current += Math.min(dt, 0.1);
    if (acc.current > 0.1) {
      const s = useCompass.getState();
      s.setSunPhase(s.sunPhase + acc.current * 0.025);
      acc.current = 0;
    }
  });
  return null;
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (!done.current) {
      done.current = true;
      onReady();
    }
  });
  return null;
}

export function MoonScene({
  data,
  classification,
  onReady,
  labelPortal,
}: {
  data: TerrainData;
  classification: Classification;
  onReady: () => void;
  labelPortal: React.RefObject<HTMLElement | null>;
}) {
  const colorMode = useCompass((s) => s.colorMode);
  const layers = useCompass((s) => s.layers);
  const exaggeration = useCompass((s) => s.exaggeration);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: HOME_POS.toArray(), fov: 45, near: 0.5, far: 4000 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[PALETTE.space]} />
      <Stars
        radius={1400}
        depth={300}
        count={5000}
        factor={18}
        saturation={0.15}
        fade
        speed={0.3}
      />
      <Lighting shadows={layers.shadows} />
      {layers.earth && <Earth />}
      <Terrain
        data={data}
        classification={classification}
        colorMode={colorMode}
        layers={layers}
        exaggeration={exaggeration}
      />
      {layers.grid && <PolarGrid data={data} exaggeration={exaggeration} />}
      {layers.sites && (
        <SiteMarkers
          data={data}
          classification={classification}
          exaggeration={exaggeration}
          showLabels={layers.labels}
          labelPortal={labelPortal}
        />
      )}
      <ProbeMarker data={data} exaggeration={exaggeration} />
      <CameraRig />
      <SunStepper />
      <ReadySignal onReady={onReady} />
    </Canvas>
  );
}
