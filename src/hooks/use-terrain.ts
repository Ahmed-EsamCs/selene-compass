import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import {
  classifyGrid,
  metricsAt,
  type TerrainData,
  type TerrainSource,
} from "@/lib/lunar/analysis";
import { loadTerrain } from "@/lib/lunar/lola";
import { findSite } from "@/lib/lunar/sites";
import { useCompass } from "@/store/compass";

/** Provenance of the loaded terrain, readable by badges on any page without building it. */
export const useTerrainStatus = create<{ source: TerrainSource | null }>(() => ({ source: null }));

let cache: TerrainData | null = null;
let pending: Promise<TerrainData> | null = null;

function load(): Promise<TerrainData> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    // loadTerrain awaits the network before the ~0.5 s horizon analysis, so the
    // loading screen has painted by the time the CPU work starts.
    pending = loadTerrain().then((t) => {
      cache = t;
      useTerrainStatus.setState({ source: t.source });
      return t;
    });
  }
  return pending;
}

/** Client-only: loads NASA LOLA terrain (or the labelled simulation) once and shares it across pages. */
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
