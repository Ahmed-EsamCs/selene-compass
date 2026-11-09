import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Home,
  RotateCcw,
  RotateCw,
  ScanEye,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Classification, TerrainData } from "@/lib/lunar/analysis";
import { metricsAt } from "@/lib/lunar/analysis";
import { formatLatLon } from "@/lib/lunar/terrain";
import { findSite } from "@/lib/lunar/sites";
import { useCompass, type ColorMode } from "@/store/compass";
import { MoonScene } from "./scene/MoonScene";
import { cameraApi } from "./scene/camera-api";
import { ClassPill, DataSourceBadge, pct } from "./bits";
import { cn } from "@/lib/utils";

const LEGENDS: Record<Exclude<ColorMode, "none">, { title: string; gradient?: string; ends?: [string, string] }> = {
  safety: { title: "Landing safety" },
  slope: {
    title: "Terrain slope",
    gradient: "linear-gradient(90deg, var(--safe), var(--caution), var(--hazard))",
    ends: ["0°", "25°+"],
  },
  illumination: {
    title: "Solar illumination",
    gradient: "linear-gradient(90deg, var(--psr), var(--caution), var(--sun))",
    ends: ["0%", "75%+"],
  },
  comm: {
    title: "Earth visibility",
    gradient: "linear-gradient(90deg, var(--space), var(--primary), var(--foreground))",
    ends: ["0%", "65%+"],
  },
  elevation: {
    title: "Elevation",
    gradient: "linear-gradient(90deg, var(--psr), var(--primary), var(--safe), var(--sun))",
    ends: ["low", "high"],
  },
};

function HudButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

export function MapView({ data, classification }: { data: TerrainData | null; classification: Classification | null }) {
  const [ready, setReady] = useState(false);
  const labelLayer = useRef<HTMLDivElement>(null);
  const colorMode = useCompass((s) => s.colorMode);
  const layers = useCompass((s) => s.layers);
  const hover = useCompass((s) => s.hover);
  const filters = useCompass((s) => s.filters);
  const weights = useCompass((s) => s.weights);
  const hoverM = useMemo(
    () => (data && hover ? metricsAt(data, hover.x, hover.y, filters, weights) : null),
    [data, hover, filters, weights],
  );

  useEffect(() => {
    if (!ready) return;
    const s = useCompass.getState();
    const site = findSite(s.selectedSiteId);
    if (s.pendingFocus && site) cameraApi.focus(site.x, site.y);
    if (s.pendingFocus) s.clearPendingFocus();
  }, [ready]);

  const legend = colorMode !== "none" ? LEGENDS[colorMode] : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-space-gradient" data-scene-ready={ready ? "" : undefined}>
      {data && classification && (
        <div className="absolute inset-0">
          <MoonScene
            data={data}
            classification={classification}
            onReady={() => setReady(true)}
            labelPortal={labelLayer}
          />
        </div>
      )}
      <div ref={labelLayer} className="pointer-events-none absolute inset-0 z-[5] overflow-hidden [&_button]:pointer-events-auto" />

      {(!data || !ready) && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-space-gradient">
          <div className="relative size-16 overflow-hidden rounded-full border border-primary/40">
            <div className="absolute inset-x-0 h-1/2 bg-gradient-to-b from-transparent to-primary/40 animate-scan" />
          </div>
          <p className="hud-label">Loading south-pole terrain…</p>
        </div>
      )}

      {/* Legend */}
      {legend && (
        <div className="panel pointer-events-auto absolute top-3 left-3 z-20 w-40 p-2.5 sm:w-48 sm:p-3">
          <div className="hud-label mb-2">{legend.title}</div>
          {colorMode === "safety" ? (
            <ul className="space-y-1 text-[11px] sm:text-xs">
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-safe" /> Safe landing zone</li>
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-caution" /> Caution</li>
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-hazard" /> Hazardous</li>
              {layers.psr && (
                <li className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-psr" /> Permanent shadow</li>
              )}
            </ul>
          ) : (
            <>
              <div className="h-2 rounded-full" style={{ background: legend.gradient }} />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>{legend.ends?.[0]}</span>
                <span>{legend.ends?.[1]}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Navigation HUD */}
      <div className="panel absolute top-3 right-3 z-20 flex flex-col items-center p-1">
        <HudButton label="Zoom in" onClick={() => cameraApi.zoom(0.7)}><ZoomIn /></HudButton>
        <HudButton label="Zoom out" onClick={() => cameraApi.zoom(1.4)}><ZoomOut /></HudButton>
        <div className="my-1 h-px w-6 bg-border" />
        <HudButton label="Rotate left" onClick={() => cameraApi.rotate(-30)}><RotateCcw /></HudButton>
        <HudButton label="Rotate right" onClick={() => cameraApi.rotate(30)}><RotateCw /></HudButton>
        <div className="my-1 h-px w-6 bg-border" />
        <HudButton label="Top view" onClick={() => cameraApi.top()}><ScanEye /></HudButton>
        <HudButton label="Reset view" onClick={() => cameraApi.reset()}><Home /></HudButton>
      </div>

      {/* Pan pad */}
      <div className="panel absolute right-3 bottom-24 z-20 hidden grid-cols-3 p-1 sm:grid md:bottom-16">
        <span />
        <HudButton label="Pan forward" onClick={() => cameraApi.pan(0, 10)}><ChevronUp /></HudButton>
        <span />
        <HudButton label="Pan left" onClick={() => cameraApi.pan(-10, 0)}><ChevronLeft /></HudButton>
        <span className="flex items-center justify-center"><span className="size-1.5 rounded-full bg-primary" /></span>
        <HudButton label="Pan right" onClick={() => cameraApi.pan(10, 0)}><ChevronRight /></HudButton>
        <span />
        <HudButton label="Pan back" onClick={() => cameraApi.pan(0, -10)}><ChevronDown /></HudButton>
        <span />
      </div>

      {/* Readout */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-wrap items-end justify-between gap-2">
        <div
          className={cn(
            "panel pointer-events-auto flex min-h-10 items-center gap-x-4 gap-y-1 px-3 py-2 font-mono text-[11px] flex-wrap",
            !hoverM && "text-muted-foreground",
          )}
        >
          {hoverM ? (
            <>
              <span className="text-primary">{formatLatLon(hoverM.x, hoverM.y)}</span>
              <span>Elev {(hoverM.elevation * 1000).toFixed(0)} m</span>
              <span>Slope {hoverM.slope.toFixed(1)}°</span>
              <span className="text-sun">Sun {pct(hoverM.illumination)}</span>
              <span>Earth {pct(hoverM.comm)}</span>
              <span>Score {Math.round(hoverM.score)}</span>
              <ClassPill cls={hoverM.cls} />
            </>
          ) : (
            <span>Hover the terrain for a readout · drag to orbit · scroll or pinch to zoom</span>
          )}
        </div>
        <DataSourceBadge className="pointer-events-auto hidden md:inline-flex lg:hidden" />
      </div>
    </div>
  );
}
