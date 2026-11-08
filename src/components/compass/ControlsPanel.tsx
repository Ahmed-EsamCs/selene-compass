import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Grid3x3,
  Home,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Rotate3d,
  ScanEye,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Classification } from "@/lib/lunar/analysis";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useCompass, type ColorMode, type Layers } from "@/store/compass";
import { cameraApi } from "./scene/camera-api";
import { SectionTitle } from "./bits";
import { cn } from "@/lib/utils";

const MODES: { id: ColorMode; label: string }[] = [
  { id: "safety", label: "Safety" },
  { id: "slope", label: "Slope" },
  { id: "illumination", label: "Sunlight" },
  { id: "comm", label: "Earth link" },
  { id: "elevation", label: "Elevation" },
  { id: "none", label: "Plain" },
];

const LAYER_ROWS: { key: keyof Layers; label: string; dot?: string }[] = [
  { key: "safe", label: "Safe landing zones", dot: "bg-safe" },
  { key: "caution", label: "Caution zones", dot: "bg-caution" },
  { key: "hazard", label: "Hazardous zones", dot: "bg-hazard" },
  { key: "psr", label: "Permanent shadow", dot: "bg-psr" },
  { key: "sites", label: "Candidate sites" },
  { key: "labels", label: "Site labels" },
  { key: "grid", label: "Polar grid" },
  { key: "earth", label: "Earth in sky" },
  { key: "shadows", label: "Cast shadows" },
];

export function ControlsPanel({ classification }: { classification: Classification | null }) {
  return (
    <div className="space-y-6">
      <LayersSection />
      <FiltersSection classification={classification} />
      <MapControlsSection />
    </div>
  );
}

function LayersSection() {
  const colorMode = useCompass((s) => s.colorMode);
  const setColorMode = useCompass((s) => s.setColorMode);
  const layers = useCompass((s) => s.layers);
  const toggleLayer = useCompass((s) => s.toggleLayer);

  return (
    <div>
      <SectionTitle>Map layers</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Map colouring">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={colorMode === m.id}
            onClick={() => setColorMode(m.id)}
            className={cn(
              "rounded-md border px-2 py-1.5 font-display text-[11px] tracking-wider uppercase transition-colors",
              colorMode === m.id
                ? "border-primary bg-primary/15 text-primary glow"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {LAYER_ROWS.map((r) => {
          const disabled =
            colorMode !== "safety" && (r.key === "safe" || r.key === "caution" || r.key === "hazard");
          return (
            <li key={r.key}>
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/50",
                  disabled && "opacity-50",
                )}
              >
                <span className="flex items-center gap-2.5">
                  {r.dot ? (
                    <span className={cn("size-2.5 rounded-sm", r.dot)} />
                  ) : (
                    <span className="size-2.5 rounded-sm border border-primary/60" />
                  )}
                  {r.label}
                </span>
                <Switch
                  checked={layers[r.key]}
                  onCheckedChange={() => toggleLayer(r.key)}
                  aria-label={r.label}
                />
              </label>
            </li>
          );
        })}
      </ul>
      {colorMode !== "safety" && (
        <p className="mt-1 px-2 text-[11px] text-muted-foreground">
          Zone toggles apply in Safety colouring.
        </p>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs text-primary">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v ?? value)}
        aria-label={label}
      />
    </div>
  );
}

function FiltersSection({ classification }: { classification: Classification | null }) {
  const filters = useCompass((s) => s.filters);
  const setFilter = useCompass((s) => s.setFilter);
  const resetFilters = useCompass((s) => s.resetFilters);

  const total = classification
    ? classification.safeKm2 + classification.cautionKm2 + classification.hazardKm2
    : 1;

  return (
    <div>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={resetFilters}
            className="text-[11px] text-primary hover:underline"
          >
            Reset
          </button>
        }
      >
        Landing filters
      </SectionTitle>
      <div className="space-y-4">
        <SliderRow
          label="Max terrain slope"
          value={filters.maxSlope}
          display={`≤ ${filters.maxSlope.toFixed(0)}°`}
          min={2}
          max={15}
          step={1}
          onChange={(v) => setFilter("maxSlope", v)}
        />
        <SliderRow
          label="Min solar illumination"
          value={filters.minIllumination * 100}
          display={`≥ ${Math.round(filters.minIllumination * 100)}%`}
          min={0}
          max={80}
          step={5}
          onChange={(v) => setFilter("minIllumination", v / 100)}
        />
        <SliderRow
          label="Min Earth visibility"
          value={filters.minComm * 100}
          display={`≥ ${Math.round(filters.minComm * 100)}%`}
          min={0}
          max={80}
          step={5}
          onChange={(v) => setFilter("minComm", v / 100)}
        />
        <SliderRow
          label="Min safety score"
          value={filters.minScore}
          display={`≥ ${filters.minScore}`}
          min={40}
          max={95}
          step={5}
          onChange={(v) => setFilter("minScore", v)}
        />
      </div>

      {classification && (
        <div className="mt-4 rounded-md border bg-secondary/40 p-3">
          <div className="flex h-2 overflow-hidden rounded-full">
            <div className="bg-safe" style={{ width: `${(classification.safeKm2 / total) * 100}%` }} />
            <div className="bg-caution" style={{ width: `${(classification.cautionKm2 / total) * 100}%` }} />
            <div className="bg-hazard" style={{ width: `${(classification.hazardKm2 / total) * 100}%` }} />
          </div>
          <dl className="mt-2.5 grid grid-cols-3 gap-1 text-center">
            {(
              [
                ["Safe", classification.safeKm2, "text-safe"],
                ["Caution", classification.cautionKm2, "text-caution"],
                ["Hazard", classification.hazardKm2, "text-hazard"],
              ] as const
            ).map(([l, v, c]) => (
              <div key={l}>
                <dt className="text-[10px] tracking-wider text-muted-foreground uppercase">{l}</dt>
                <dd className={cn("font-mono text-sm", c)}>{Math.round(v).toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">km² of simulated area</p>
        </div>
      )}
    </div>
  );
}

function CtlButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border py-2 text-[10px] tracking-wide text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary",
        active && "border-primary bg-primary/15 text-primary",
      )}
    >
      {children}
      <span className="leading-none">{label}</span>
    </button>
  );
}

function MapControlsSection() {
  const autoRotate = useCompass((s) => s.autoRotate);
  const setAutoRotate = useCompass((s) => s.setAutoRotate);
  const exaggeration = useCompass((s) => s.exaggeration);
  const setExaggeration = useCompass((s) => s.setExaggeration);
  const sunPhase = useCompass((s) => s.sunPhase);
  const setSunPhase = useCompass((s) => s.setSunPhase);
  const sunPlaying = useCompass((s) => s.sunPlaying);
  const setSunPlaying = useCompass((s) => s.setSunPlaying);
  const grid = useCompass((s) => s.layers.grid);
  const toggleLayer = useCompass((s) => s.toggleLayer);

  return (
    <div>
      <SectionTitle>Map controls</SectionTitle>
      <div className="grid grid-cols-4 gap-1.5 [&_svg]:size-4">
        <CtlButton label="Zoom in" onClick={() => cameraApi.zoom(0.7)}>
          <ZoomIn />
        </CtlButton>
        <CtlButton label="Zoom out" onClick={() => cameraApi.zoom(1.4)}>
          <ZoomOut />
        </CtlButton>
        <CtlButton label="Rotate L" onClick={() => cameraApi.rotate(-30)}>
          <RotateCcw />
        </CtlButton>
        <CtlButton label="Rotate R" onClick={() => cameraApi.rotate(30)}>
          <RotateCw />
        </CtlButton>
        <CtlButton label="Tilt up" onClick={() => cameraApi.tilt(-12)}>
          <ArrowUpFromLine />
        </CtlButton>
        <CtlButton label="Tilt down" onClick={() => cameraApi.tilt(12)}>
          <ArrowDownToLine />
        </CtlButton>
        <CtlButton label="Top view" onClick={() => cameraApi.top()}>
          <ScanEye />
        </CtlButton>
        <CtlButton label="Reset" onClick={() => cameraApi.reset()}>
          <Home />
        </CtlButton>
        <CtlButton label="Auto spin" active={autoRotate} onClick={() => setAutoRotate(!autoRotate)}>
          <Rotate3d />
        </CtlButton>
        <CtlButton label="Grid" active={grid} onClick={() => toggleLayer("grid")}>
          <Grid3x3 />
        </CtlButton>
      </div>

      <div className="mt-4 space-y-4">
        <SliderRow
          label="Vertical exaggeration"
          value={exaggeration}
          display={`${exaggeration.toFixed(1)}×`}
          min={1}
          max={5}
          step={0.5}
          onChange={setExaggeration}
        />
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>Sun azimuth</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-sun">{Math.round(sunPhase * 360)}°</span>
              <button
                type="button"
                onClick={() => setSunPlaying(!sunPlaying)}
                className="flex size-6 items-center justify-center rounded border border-sun/40 text-sun hover:bg-sun/10"
                aria-label={sunPlaying ? "Pause sun animation" : "Play sun animation"}
              >
                {sunPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
              </button>
            </span>
          </div>
          <Slider
            value={[sunPhase * 360]}
            min={0}
            max={359}
            step={1}
            onValueChange={([v]) => setSunPhase((v ?? 0) / 360)}
            aria-label="Sun azimuth"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            3D lighting is raised to 9° for visibility; analysis uses the real ≈1.5° polar sun.
          </p>
        </div>
      </div>
    </div>
  );
}
