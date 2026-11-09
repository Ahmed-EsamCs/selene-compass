import { useMemo } from "react";
import { Crosshair, Mountain, RadioTower, Sun, X } from "lucide-react";
import {
  earthProfile,
  factorScores,
  HARD_SLOPE_LIMIT_DEG,
  metricsAt,
  sunProfile,
  type TerrainData,
} from "@/lib/lunar/analysis";
import { formatLatLon } from "@/lib/lunar/terrain";
import { SITES } from "@/lib/lunar/sites";
import { Slider } from "@/components/ui/slider";
import { useSubject } from "@/hooks/use-terrain";
import { useCompass, type ColorMode } from "@/store/compass";
import { cameraApi } from "./scene/camera-api";
import { ClassPill, pct, SectionTitle, useDataSource } from "./bits";
import { LiveSkyCard } from "./LiveSkyCard";
import { cn } from "@/lib/utils";

export function SafetyDashboard({ data }: { data: TerrainData | null }) {
  const subject = useSubject(data);
  const probe = useCompass((s) => s.probe);
  const setProbe = useCompass((s) => s.setProbe);
  const selectSite = useCompass((s) => s.selectSite);
  const selectedSiteId = useCompass((s) => s.selectedSiteId);
  const source = useDataSource();

  return (
    <div className="space-y-5">
      <div>
        <SectionTitle>Safety score dashboard</SectionTitle>
        <div className="flex gap-2">
          <select
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-secondary/60 px-2 text-sm text-foreground focus:ring-1 focus:ring-ring focus:outline-none"
            value={probe ? "__probe" : (selectedSiteId ?? "")}
            onChange={(e) => {
              const id = e.target.value;
              if (id === "__probe") return;
              selectSite(id);
              const s = SITES.find((x) => x.id === id);
              if (s) cameraApi.focus(s.x, s.y);
            }}
            aria-label="Analysed location"
          >
            {probe && <option value="__probe">Probe point (clicked on map)</option>}
            {!probe && !selectedSiteId && <option value="">Select a site…</option>}
            {SITES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {probe && (
            <button
              type="button"
              onClick={() => setProbe(null)}
              className="flex size-9 items-center justify-center rounded-md border text-muted-foreground hover:border-hazard hover:text-hazard"
              aria-label="Clear probe point"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {!probe && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Crosshair className="size-3" /> Tap anywhere on the terrain to probe a point.
          </p>
        )}
      </div>

      {!data || !subject ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {data ? "Select a landing site or tap the map." : "Loading terrain…"}
        </div>
      ) : (
        <SubjectView data={data} subject={subject} />
      )}

      {data && <WeightsSection />}
      {data && <Ranking data={data} />}

      {source?.kind === "lola" ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <strong className="text-primary">Real NASA terrain, modelled scores.</strong> Elevation is
          LRO LOLA {source.product} resampled to 750 m cells; Sun/Earth positions come from JPL
          Horizons. Slope, illumination, Earth visibility and safety scores are computed by Selene
          Compass from that data — they are estimates, not official NASA products, and must not be
          used for mission planning.
        </p>
      ) : (
        <p className="rounded-md border border-caution/30 bg-caution/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <strong className="text-caution">Demonstration only.</strong> Scores come from
          procedurally generated terrain and a simplified horizon model. They are not NASA
          measurements and must not be used for mission planning.
        </p>
      )}
    </div>
  );
}

type Subject = NonNullable<ReturnType<typeof useSubject>>;

function ScoreRing({ score, cls }: { score: number; cls: "safe" | "caution" | "hazard" }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const val = (Math.max(0, Math.min(100, score)) / 100) * arc;
  const stroke =
    cls === "safe" ? "stroke-safe" : cls === "caution" ? "stroke-caution" : "stroke-hazard";
  return (
    <svg
      viewBox="0 0 128 128"
      className="size-32 shrink-0"
      role="img"
      aria-label={`Safety score ${Math.round(score)} of 100`}
    >
      <g transform="rotate(135 64 64)">
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          className="stroke-secondary"
          strokeWidth="9"
          strokeDasharray={`${arc} ${c}`}
          strokeLinecap="round"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          className={cn(stroke, "transition-[stroke-dasharray] duration-500")}
          strokeWidth="9"
          strokeDasharray={`${val} ${c}`}
          strokeLinecap="round"
        />
      </g>
      <circle
        cx="64"
        cy="64"
        r="40"
        fill="none"
        className="stroke-primary/20"
        strokeDasharray="2 4"
      />
      <text
        x="64"
        y="64"
        textAnchor="middle"
        className="fill-foreground font-display text-[30px] font-semibold"
      >
        {Math.round(score)}
      </text>
      <text
        x="64"
        y="84"
        textAnchor="middle"
        className="fill-muted-foreground font-display text-[9px] tracking-[0.2em]"
      >
        / 100
      </text>
    </svg>
  );
}

function SubjectView({ data, subject }: { data: TerrainData; subject: Subject }) {
  const m = subject.metrics;
  const filters = useCompass((s) => s.filters);
  const weights = useCompass((s) => s.weights);
  const colorMode = useCompass((s) => s.colorMode);
  const setColorMode = useCompass((s) => s.setColorMode);
  const sunPhase = useCompass((s) => s.sunPhase);
  const setSunPhase = useCompass((s) => s.setSunPhase);

  const sun = useMemo(() => sunProfile(data, m.x, m.y), [data, m.x, m.y]);
  const earth = useMemo(() => earthProfile(data, m.x, m.y), [data, m.x, m.y]);
  const f = factorScores(m.slope, m.illumination, m.comm);
  const wSum = weights.slope + weights.illumination + weights.comm || 1;
  const sunIdx = Math.floor(sunPhase * sun.length) % sun.length;
  const litNow = sun[sunIdx]! > 0.5;

  const toggleMode = (mode: ColorMode) => setColorMode(colorMode === mode ? "safety" : mode);

  return (
    <div className="space-y-3">
      <div className="hud-corner flex items-center gap-4 rounded-lg border bg-secondary/30 p-3">
        <ScoreRing score={m.score} cls={m.cls} />
        <div className="min-w-0 space-y-1.5">
          <div className="truncate font-display text-sm font-semibold tracking-wide">
            {subject.label}
          </div>
          <ClassPill cls={m.cls} />
          <dl className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
            <div>{formatLatLon(m.x, m.y)}</div>
            <div>
              Elev {m.elevation >= 0 ? "+" : ""}
              {(m.elevation * 1000).toFixed(0)} m
            </div>
            <div>
              {m.x.toFixed(1)}, {m.y.toFixed(1)} km
            </div>
          </dl>
        </div>
      </div>
      {subject.site && <p className="text-xs text-muted-foreground">{subject.site.note}</p>}

      <LiveSkyCard data={data} point={{ x: m.x, y: m.y }} />

      {/* Solar illumination */}
      <IndicatorCard
        icon={<Sun className="size-4" />}
        title="Solar illumination"
        tone="text-sun"
        value={pct(m.illumination)}
        sub={`Sunlit now: ${litNow ? "yes" : "no"} · threshold ${pct(filters.minIllumination)}`}
        points={Math.round((100 * weights.illumination * f.illumination) / wSum)}
        active={colorMode === "illumination"}
        onToggle={() => toggleMode("illumination")}
        bar={m.illumination}
        threshold={filters.minIllumination}
      >
        <div className="flex h-10 items-end gap-px" aria-label="Sun visibility over a lunar day">
          {sun.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSunPhase(i / sun.length);
              }}
              title={`Azimuth ${Math.round((i / sun.length) * 360)}° · ${Math.round(v * 100)}% of disk`}
              className={cn(
                "flex-1 rounded-t-[1px] transition-colors",
                i === sunIdx
                  ? "bg-primary"
                  : v > 0.5
                    ? "bg-sun/80 hover:bg-sun"
                    : "bg-secondary hover:bg-muted-foreground/40",
              )}
              style={{ height: `${15 + v * 85}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>0°</span>
          <span>Sun azimuth over one lunar day (tap to set)</span>
          <span>360°</span>
        </div>
      </IndicatorCard>

      {/* Terrain slope */}
      <IndicatorCard
        icon={<Mountain className="size-4" />}
        title="Terrain slope"
        tone="text-primary"
        value={`${m.slope.toFixed(1)}°`}
        sub={`Safe ≤ ${filters.maxSlope}° · lander limit ${HARD_SLOPE_LIMIT_DEG}°`}
        points={Math.round((100 * weights.slope * f.slope) / wSum)}
        active={colorMode === "slope"}
        onToggle={() => toggleMode("slope")}
      >
        <div className="relative h-3 overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute inset-y-0 left-0 bg-safe/70"
            style={{ width: `${(filters.maxSlope / 25) * 100}%` }}
          />
          <div
            className="absolute inset-y-0 bg-caution/70"
            style={{
              left: `${(filters.maxSlope / 25) * 100}%`,
              width: `${((HARD_SLOPE_LIMIT_DEG - filters.maxSlope) / 25) * 100}%`,
            }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-hazard/70"
            style={{ left: `${(HARD_SLOPE_LIMIT_DEG / 25) * 100}%` }}
          />
          <div
            className="absolute inset-y-[-2px] w-1 rounded bg-foreground shadow transition-[left] duration-500"
            style={{ left: `calc(${Math.min(100, (m.slope / 25) * 100)}% - 2px)` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>0°</span>
          <span>{HARD_SLOPE_LIMIT_DEG}°</span>
          <span>25°+</span>
        </div>
      </IndicatorCard>

      {/* Earth comm */}
      <IndicatorCard
        icon={<RadioTower className="size-4" />}
        title="Earth comm stability"
        tone="text-primary"
        value={pct(m.comm)}
        sub={`Direct-to-Earth line of sight · threshold ${pct(filters.minComm)}`}
        points={Math.round((100 * weights.comm * f.comm) / wSum)}
        active={colorMode === "comm"}
        onToggle={() => toggleMode("comm")}
        bar={m.comm}
        threshold={filters.minComm}
      >
        <svg
          viewBox={`0 0 ${earth.length - 1} 10`}
          preserveAspectRatio="none"
          className="h-10 w-full"
          aria-label="Earth visibility over one libration cycle"
        >
          <path
            d={`M0 10 ${earth.map((v, i) => `L${i} ${10 - v * 9}`).join(" ")} L${earth.length - 1} 10 Z`}
            className="fill-primary/20"
          />
          <path
            d={earth.map((v, i) => `${i === 0 ? "M" : "L"}${i} ${10 - v * 9}`).join(" ")}
            className="fill-none stroke-primary"
            strokeWidth="0.25"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>Day 0</span>
          <span>Earth visibility over ~27-day libration</span>
          <span>27</span>
        </div>
      </IndicatorCard>
    </div>
  );
}

function IndicatorCard({
  icon,
  title,
  tone,
  value,
  sub,
  points,
  active,
  onToggle,
  bar,
  threshold,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: string;
  value: string;
  sub: string;
  points: number;
  active: boolean;
  onToggle: () => void;
  bar?: number;
  threshold?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-secondary/30 p-3 transition-colors",
        active ? "border-primary glow" : "hover:border-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-md bg-background/60",
              tone,
            )}
          >
            {icon}
          </span>
          <div>
            <div className="font-display text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              {title}
            </div>
            <div className="font-mono text-lg leading-tight font-semibold">{value}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs text-primary">+{points} pts</div>
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={active}
            className={cn(
              "mt-1 rounded border px-1.5 py-0.5 text-[10px] tracking-wider uppercase transition-colors",
              active
                ? "border-primary bg-primary/15 text-primary"
                : "text-muted-foreground hover:border-primary/60 hover:text-primary",
            )}
          >
            {active ? "On map ✓" : "Show on map"}
          </button>
        </div>
      </div>
      {bar !== undefined && (
        <div className="relative mt-2.5 h-1.5 rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${bar * 100}%` }}
          />
          {threshold !== undefined && (
            <div
              className="absolute -top-1 h-3.5 w-px bg-caution"
              style={{ left: `${threshold * 100}%` }}
              title="Filter threshold"
            />
          )}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function WeightsSection() {
  const weights = useCompass((s) => s.weights);
  const setWeight = useCompass((s) => s.setWeight);
  const resetWeights = useCompass((s) => s.resetWeights);
  const sum = weights.slope + weights.illumination + weights.comm || 1;
  const rows = [
    ["slope", "Slope"],
    ["illumination", "Sunlight"],
    ["comm", "Earth link"],
  ] as const;
  return (
    <div>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={resetWeights}
            className="text-[11px] text-primary hover:underline"
          >
            Reset
          </button>
        }
      >
        Score weights
      </SectionTitle>
      <div className="space-y-3">
        {rows.map(([k, label]) => (
          <div key={k} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 text-sm">
            <span>{label}</span>
            <Slider
              value={[weights[k] * 100]}
              min={0}
              max={100}
              step={5}
              onValueChange={([v]) => setWeight(k, (v ?? 0) / 100)}
              aria-label={`${label} weight`}
            />
            <span className="text-right font-mono text-xs text-primary">
              {Math.round((weights[k] / sum) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ranking({ data }: { data: TerrainData }) {
  const filters = useCompass((s) => s.filters);
  const weights = useCompass((s) => s.weights);
  const selected = useCompass((s) => s.selectedSiteId);
  const selectSite = useCompass((s) => s.selectSite);
  const ranked = useMemo(
    () =>
      SITES.map((s) => ({ site: s, m: metricsAt(data, s.x, s.y, filters, weights) })).sort(
        (a, b) => b.m.score - a.m.score,
      ),
    [data, filters, weights],
  );
  return (
    <div>
      <SectionTitle>Site ranking</SectionTitle>
      <ol className="space-y-1">
        {ranked.map(({ site, m }, i) => (
          <li key={site.id}>
            <button
              type="button"
              onClick={() => {
                selectSite(site.id);
                cameraApi.focus(site.x, site.y);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                selected === site.id
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:bg-accent/50",
              )}
            >
              <span className="w-4 font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  m.cls === "safe" && "bg-safe",
                  m.cls === "caution" && "bg-caution",
                  m.cls === "hazard" && "bg-hazard",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{site.name}</span>
              <span className="font-mono text-xs">{Math.round(m.score)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
