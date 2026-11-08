import { create } from "zustand";
import { DEFAULT_FILTERS, DEFAULT_WEIGHTS, type Filters, type Weights } from "@/lib/lunar/analysis";

export type ColorMode = "safety" | "slope" | "illumination" | "comm" | "elevation" | "none";

export interface Layers {
  safe: boolean;
  caution: boolean;
  hazard: boolean;
  psr: boolean;
  sites: boolean;
  labels: boolean;
  grid: boolean;
  earth: boolean;
  shadows: boolean;
}

export const DEFAULT_LAYERS: Layers = {
  safe: true,
  caution: true,
  hazard: true,
  psr: true,
  sites: true,
  labels: true,
  grid: true,
  earth: true,
  shadows: true,
};

export interface GridPoint {
  x: number;
  y: number;
}

interface CompassState {
  colorMode: ColorMode;
  layers: Layers;
  filters: Filters;
  weights: Weights;
  exaggeration: number;
  sunPhase: number; // 0..1 around a lunar day
  sunPlaying: boolean;
  autoRotate: boolean;
  selectedSiteId: string | null;
  probe: GridPoint | null;
  hover: GridPoint | null;
  /** Fly the camera to the selected site once the map is ready (set when arriving from another page). */
  pendingFocus: boolean;
  setColorMode: (m: ColorMode) => void;
  toggleLayer: (k: keyof Layers) => void;
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  resetFilters: () => void;
  setWeight: <K extends keyof Weights>(k: K, v: number) => void;
  resetWeights: () => void;
  setExaggeration: (v: number) => void;
  setSunPhase: (v: number) => void;
  setSunPlaying: (v: boolean) => void;
  setAutoRotate: (v: boolean) => void;
  selectSite: (id: string | null, opts?: { focusOnLoad?: boolean }) => void;
  clearPendingFocus: () => void;
  setProbe: (p: GridPoint | null) => void;
  setHover: (p: GridPoint | null) => void;
}

export const useCompass = create<CompassState>((set) => ({
  colorMode: "safety",
  layers: DEFAULT_LAYERS,
  filters: DEFAULT_FILTERS,
  weights: DEFAULT_WEIGHTS,
  exaggeration: 2,
  sunPhase: 0.32,
  sunPlaying: false,
  autoRotate: false,
  selectedSiteId: "peak-shackleton",
  probe: null,
  hover: null,
  pendingFocus: false,
  setColorMode: (colorMode) => set({ colorMode }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setFilter: (k, v) => set((s) => ({ filters: { ...s.filters, [k]: v } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setWeight: (k, v) => set((s) => ({ weights: { ...s.weights, [k]: v } })),
  resetWeights: () => set({ weights: DEFAULT_WEIGHTS }),
  setExaggeration: (exaggeration) => set({ exaggeration }),
  setSunPhase: (sunPhase) => set({ sunPhase: ((sunPhase % 1) + 1) % 1 }),
  setSunPlaying: (sunPlaying) => set({ sunPlaying }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  selectSite: (selectedSiteId, opts) =>
    set({ selectedSiteId, probe: null, pendingFocus: !!opts?.focusOnLoad }),
  clearPendingFocus: () => set({ pendingFocus: false }),
  setProbe: (probe) =>
    set((s) => ({ probe, selectedSiteId: probe ? null : s.selectedSiteId })),
  setHover: (hover) => set({ hover }),
}));
