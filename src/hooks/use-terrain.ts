import { useEffect, useMemo, useState } from "react";
import { buildTerrain, classifyGrid, metricsAt, type TerrainData } from "@/lib/lunar/analysis";
import { findSite } from "@/lib/lunar/sites";
import { useCompass } from "@/store/compass";

let cache: TerrainData | null = null;
let pending: Promise<TerrainData> | null = null;

function load(): Promise<TerrainData> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = new Promise((resolve) => {
      // Defer so the loading screen paints before the ~0.5s computation.
      setTimeout(() => {
        cache = buildTerrain();
        resolve(cache);
      }, 40);
    });
  }
  return pending;
}

/** Client-only: builds the simulated terrain once and shares it across pages. */
export function useTerrain(): TerrainData | null {
  const [data, setData] = useState<TerrainData | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

export function useClassification(t: TerrainData | null) {
  const filters = useCompass((s) => s.filters);
  const weights = useCompass((s) => s.weights);
  return useMemo(() => (t ? classifyGrid(t, filters, weights) : null), [t, filters, weights]);
}

/** Metrics for the current subject: the pinned probe point, else the selected site. */
export function useSubject(t: TerrainData | null) {
  const filters = useCompass((s) => s.filters);
  const weights = useCompass((s) => s.weights);
  const probe = useCompass((s) => s.probe);
  const siteId = useCompass((s) => s.selectedSiteId);
  return useMemo(() => {
    if (!t) return null;
    const site = findSite(siteId);
    const p = probe ?? (site ? { x: site.x, y: site.y } : null);
    if (!p) return null;
    return {
      label: probe ? "Probe point" : site!.name,
      site: probe ? undefined : site,
      metrics: metricsAt(t, p.x, p.y, filters, weights),
    };
  }, [t, filters, weights, probe, siteId]);
}
