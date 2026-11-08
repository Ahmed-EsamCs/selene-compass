import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDownUp, MapPin } from "lucide-react";
import { AppHeader } from "@/components/compass/AppHeader";
import { ClassPill, DemoBadge, pct } from "@/components/compass/bits";
import { useTerrain } from "@/hooks/use-terrain";
import { metricsAt } from "@/lib/lunar/analysis";
import { formatLatLon } from "@/lib/lunar/terrain";
import { SITES } from "@/lib/lunar/sites";
import { useCompass } from "@/store/compass";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sites")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Candidate Landing Sites — Selene Compass" },
      {
        name: "description",
        content:
          "Compare simulated safety scores, slope, sunlight and Earth visibility for lunar south pole candidate landing sites.",
      },
      { property: "og:title", content: "Candidate Landing Sites — Selene Compass" },
      {
        property: "og:description",
        content: "Side-by-side comparison of south pole landing candidates using demonstration data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SitesPage,
});

type SortKey = "score" | "slope" | "illumination" | "comm" | "elevation";

const COLS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "slope", label: "Slope" },
  { key: "illumination", label: "Sunlight" },
  { key: "comm", label: "Earth link" },
  { key: "elevation", label: "Elevation" },
];

function SitesPage() {
  const data = useTerrain();
  const filters = useCompass((s) => s.filters);
  const weights = useCompass((s) => s.weights);
  const selectSite = useCompass((s) => s.selectSite);
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "score", desc: true });

  const rows = useMemo(() => {
    if (!data) return [];
    const r = SITES.map((site) => ({ site, m: metricsAt(data, site.x, site.y, filters, weights) }));
    r.sort((a, b) => (sort.desc ? b.m[sort.key] - a.m[sort.key] : a.m[sort.key] - b.m[sort.key]));
    return r;
  }, [data, filters, weights, sort]);

  const view = (id: string) => {
    selectSite(id, { focusOnLoad: true });
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-dvh bg-space-gradient">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hud-label">Site comparison</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-wide md:text-4xl">
              Candidate landing sites
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Names follow publicly discussed south-pole regions; positions are approximate and all values
              are simulated. Scores use the filters and weights you set on the Mission Map.
            </p>
          </div>
          <DemoBadge />
        </div>

        {!data ? (
          <p className="mt-10 hud-label">Computing simulated terrain…</p>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              {COLS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.key !== "slope" }))}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-display text-xs tracking-wider uppercase",
                    sort.key === c.key ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ArrowDownUp className="size-3" />
                  {c.label}
                  {sort.key === c.key && <span>{sort.desc ? "↓" : "↑"}</span>}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:hidden">
              {rows.map(({ site, m }) => (
                <article key={site.id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display font-semibold tracking-wide">{site.name}</h2>
                      <p className="font-mono text-[11px] text-muted-foreground">{formatLatLon(site.x, site.y)}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-2xl">{Math.round(m.score)}</div>
                      <ClassPill cls={m.cls} />
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center font-mono text-xs">
                    <div><dt className="hud-label">Slope</dt><dd>{m.slope.toFixed(1)}°</dd></div>
                    <div><dt className="hud-label">Sun</dt><dd>{pct(m.illumination)}</dd></div>
                    <div><dt className="hud-label">Earth</dt><dd>{pct(m.comm)}</dd></div>
                    <div><dt className="hud-label">Elev</dt><dd>{(m.elevation * 1000).toFixed(0)}m</dd></div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => view(site.id)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-primary/50 py-2 font-display text-xs tracking-wider text-primary uppercase hover:bg-primary/10"
                  >
                    <MapPin className="size-3.5" /> View on map
                  </button>
                </article>
              ))}
            </div>

            <div className="panel mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="hud-label p-3">Site</th>
                    <th className="hud-label p-3">Location</th>
                    <th className="hud-label p-3">Class</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="hud-label p-3 text-right">{c.label}</th>
                    ))}
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ site, m }) => (
                    <tr key={site.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                      <td className="p-3">
                        <div className="font-medium">{site.name}</div>
                        <div className="max-w-xs text-xs text-muted-foreground">{site.note}</div>
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{formatLatLon(site.x, site.y)}</td>
                      <td className="p-3"><ClassPill cls={m.cls} /></td>
                      <td className="p-3 text-right font-mono text-base">{Math.round(m.score)}</td>
                      <td className="p-3 text-right font-mono">{m.slope.toFixed(1)}°</td>
                      <td className="p-3 text-right font-mono">{pct(m.illumination)}</td>
                      <td className="p-3 text-right font-mono">{pct(m.comm)}</td>
                      <td className="p-3 text-right font-mono">{(m.elevation * 1000).toFixed(0)} m</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => view(site.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 px-2.5 py-1 font-display text-[11px] tracking-wider text-primary uppercase hover:bg-primary/10"
                        >
                          <MapPin className="size-3" /> Map
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
