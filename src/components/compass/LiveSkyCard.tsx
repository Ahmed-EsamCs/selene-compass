import { formatDistanceStrict } from "date-fns";
import { Earth, ExternalLink, RefreshCw, Satellite, Sun, Sunrise } from "lucide-react";
import type { TerrainData } from "@/lib/lunar/analysis";
import { sunPhaseFromSample, type LiveSample } from "@/lib/lunar/ephemeris";
import { useLiveSky } from "@/hooks/use-ephemeris";
import { useCompass } from "@/store/compass";
import { cn } from "@/lib/utils";
import { pct } from "./bits";

const deg = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}°`;

function Row({
  icon,
  label,
  s,
  up,
  upText,
  downText,
  next,
}: {
  icon: React.ReactNode;
  label: string;
  s: LiveSample;
  up: boolean;
  upText: string;
  downText: string;
  next: string | null;
}) {
  return (
    <div className="rounded-md border bg-background/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-display text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          {icon} {label}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-display text-[10px] font-semibold tracking-wider uppercase",
            up ? "bg-safe/15 text-safe" : "bg-hazard/15 text-hazard",
          )}
        >
          {up ? upText : downText}
        </span>
      </div>
      <dl className="mt-1.5 grid grid-cols-3 gap-1 font-mono text-[11px]">
        <div>
          <dt className="text-[9px] text-muted-foreground uppercase">Azimuth</dt>
          <dd>{s.az.toFixed(1)}°</dd>
        </div>
        <div>
          <dt className="text-[9px] text-muted-foreground uppercase">Elevation</dt>
          <dd>{deg(s.el)}</dd>
        </div>
        <div>
          <dt className="text-[9px] text-muted-foreground uppercase">Terrain hzn</dt>
          <dd>{deg(s.horizonDeg)}</dd>
        </div>
      </dl>
      {next && <p className="mt-1 text-[10px] text-muted-foreground">{next}</p>}
    </div>
  );
}

function Strip({ samples, tone, label }: { samples: LiveSample[]; tone: string; label: string }) {
  return (
    <div className="flex h-3 gap-px overflow-hidden rounded-sm" aria-label={label} role="img">
      {samples.map((s) => (
        <span
          key={s.t}
          className={cn("flex-1", s.visible >= 0.5 ? tone : "bg-secondary")}
          title={`${new Date(s.t).toUTCString()} · ${Math.round(s.visible * 100)}% of disk above terrain`}
        />
      ))}
    </div>
  );
}

/** Real-time Sun/Earth geometry (NASA JPL Horizons) tested against the terrain horizon. */
export function LiveSkyCard({ data, point }: { data: TerrainData; point: { x: number; y: number } }) {
  const { sky, lonDeg, isLoading, error, refetch, data: eph } = useLiveSky(data, point);
  const setSunPhase = useCompass((s) => s.setSunPhase);
  const now = Date.now();
  const rel = (t: number) => formatDistanceStrict(t, now, { addSuffix: true });

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/5 p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display text-[11px] tracking-[0.12em] text-primary uppercase">
          <Satellite className="size-3.5" /> Live sky now
        </h3>
        <a
          href="https://ssd.jpl.nasa.gov/horizons/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
        >
          NASA JPL Horizons <ExternalLink className="size-3" />
        </a>
      </div>

      {isLoading && (
        <div className="mt-3 space-y-2" aria-label="Loading live ephemeris">
          <div className="h-16 animate-pulse rounded-md bg-secondary/60" />
          <div className="h-16 animate-pulse rounded-md bg-secondary/60" />
        </div>
      )}

      {error && !isLoading && (
        <div className="mt-2 rounded-md border border-caution/40 bg-caution/5 p-2.5 text-[11px] text-muted-foreground">
          <p>
            <strong className="text-caution">Live ephemeris unavailable.</strong> {error.message}. The modelled
            indicators above still work.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-1.5 inline-flex items-center gap-1 text-primary hover:underline"
          >
            <RefreshCw className="size-3" /> Retry
          </button>
        </div>
      )}

      {sky && eph && (
        <div className="mt-2.5 space-y-2">
          <Row
            icon={<Sun className="size-3.5 text-sun" />}
            label="Sun"
            s={sky.sunNow}
            up={sky.sunNow.visible >= 0.5}
            upText="Sunlit"
            downText="In shadow"
            next={sky.nextSunChange ? `${sky.nextSunChange.to === "sunrise" ? "Sunrise" : "Sunset"} ${rel(sky.nextSunChange.t)}` : null}
          />
          <Row
            icon={<Earth className="size-3.5 text-primary" />}
            label="Earth"
            s={sky.earthNow}
            up={sky.earthNow.visible >= 0.5}
            upText="Link possible"
            downText="Below horizon"
            next={sky.nextEarthChange ? `Earth ${sky.nextEarthChange.to}s ${rel(sky.nextEarthChange.t)}` : null}
          />

          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>Next {Math.round((eph.sun.length * eph.stepHours) / 24)} days</span>
              <span>
                <span className="text-sun">Sun {pct(sky.sunlitShare)}</span> · <span className="text-primary">Earth {pct(sky.earthShare)}</span>
              </span>
            </div>
            <Strip samples={sky.sun} tone="bg-sun/80" label={`Sunlit ${pct(sky.sunlitShare)} of the next month`} />
            <Strip samples={sky.earth} tone="bg-primary/80" label={`Earth in view ${pct(sky.earthShare)} of the next month`} />
          </div>

          <button
            type="button"
            onClick={() => setSunPhase(sunPhaseFromSample(sky.sunNow, lonDeg))}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/50 py-1.5 font-display text-[11px] tracking-wider text-primary uppercase hover:bg-primary/10"
          >
            <Sunrise className="size-3.5" /> Set map sun to real position now
          </button>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Positions from NASA JPL Horizons (fetched {rel(Date.parse(eph.generatedAt))}); visibility is
            tested against the terrain horizon by Selene Compass.
          </p>
        </div>
      )}
    </section>
  );
}
