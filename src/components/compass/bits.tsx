import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Satellite } from "lucide-react";
import type { SafetyClass, TerrainSource } from "@/lib/lunar/analysis";
import { LOLA_BASE, lolaMetaSchema } from "@/lib/lunar/lola";
import { useTerrainStatus } from "@/hooks/use-terrain";
import { cn } from "@/lib/utils";

/** Terrain provenance: the loaded terrain if any, else whether the LOLA asset is deployed. */
export function useDataSource(): TerrainSource | null {
  const loaded = useTerrainStatus((s) => s.source);
  const meta = useQuery({
    queryKey: ["lola-meta"],
    queryFn: async () => lolaMetaSchema.parse(await (await fetch(`${LOLA_BASE}/meta.json`)).json()),
    enabled: !loaded && typeof window !== "undefined",
    staleTime: Infinity,
    retry: false,
  });
  if (loaded) return loaded;
  if (meta.data)
    return {
      kind: "lola",
      product: meta.data.product,
      resolutionM: meta.data.sourceResolutionM,
      url: meta.data.sourceImage,
      generatedAt: meta.data.generatedAt,
    };
  if (meta.isError) return { kind: "simulated", reason: "NASA LOLA terrain asset not deployed" };
  return null;
}

/** Honest provenance label — real NASA terrain vs. demonstration simulation. */
export function DataSourceBadge({ className }: { className?: string }) {
  const source = useDataSource();
  if (!source) return null;
  if (source.kind === "lola") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-display text-[10px] font-medium tracking-[0.14em] text-primary uppercase",
          className,
        )}
        title={`Elevation: NASA LRO LOLA ${source.product} (${source.resolutionM} m/px), resampled to 750 m cells. Sun/Earth positions: NASA JPL Horizons. Illumination, Earth-visibility and safety scores are modelled by Selene Compass from that data — not official NASA products.`}
      >
        <Satellite className="size-3" />
        NASA LOLA terrain · modelled scores
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-caution/40 bg-caution/10 px-2.5 py-1 font-display text-[10px] font-medium tracking-[0.14em] text-caution uppercase",
        className,
      )}
      title={`All terrain, illumination and communication values are simulated for demonstration. Not NASA-verified data.${source.reason ? ` (${source.reason})` : ""}`}
    >
      <FlaskConical className="size-3" />
      Demonstration data · simulated
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="hud-label flex items-center gap-2">
        <span className="h-px w-3 bg-primary" />
        {children}
      </h2>
      {action}
    </div>
  );
}

export const CLASS_LABEL: Record<SafetyClass, string> = {
  safe: "Safe",
  caution: "Caution",
  hazard: "Hazard",
};

export function ClassPill({ cls, className }: { cls: SafetyClass; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-display text-[10px] font-semibold tracking-[0.14em] uppercase",
        cls === "safe" && "bg-safe/15 text-safe",
        cls === "caution" && "bg-caution/15 text-caution",
        cls === "hazard" && "bg-hazard/15 text-hazard",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          cls === "safe" && "bg-safe",
          cls === "caution" && "bg-caution",
          cls === "hazard" && "bg-hazard",
        )}
      />
      {CLASS_LABEL[cls]}
    </span>
  );
}

export function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("panel p-4", className)}>{children}</section>;
}
