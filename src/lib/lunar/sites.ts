/**
 * Candidate landing sites at the lunar south pole.
 *
 * Where a peer-reviewed or NASA publication gives exact coordinates we use them verbatim
 * (`origin: "published"`). For regions with no published point, the site is the best-scoring
 * 750 m cell within 4 km of the region's approximate position on the NASA LOLA terrain,
 * picked by Selene Compass's own model (`origin: "modelled"`) — the UI says which is which.
 */
import { latLonToKm } from "./terrain";

export interface SiteRef {
  label: string;
  url: string;
}

export interface Site {
  id: string;
  name: string;
  /** Compact label for small screens. */
  short: string;
  /** Selenographic latitude (°, negative = south) and east longitude (°). */
  lat: number;
  lon: number;
  /** Map frame, km (derived from lat/lon). */
  x: number;
  y: number;
  origin: "published" | "modelled";
  note: string;
  ref?: SiteRef;
}

const NASA_ILLUM: SiteRef = {
  label:
    "Gläser et al. 2017, Illumination conditions at the lunar poles (Planet. Space Sci.; NASA NTRS 20170007365)",
  url: "https://ntrs.nasa.gov/citations/20170007365",
};
const LPSC_2024: SiteRef = {
  label: "LPSC 2024 abstract #1695 — Candidate landing sites for Artemis 3",
  url: "https://www.hou.usra.edu/meetings/lpsc2024/pdf/1695.pdf",
};
const LOLA: SiteRef = {
  label: "Selected on NASA LRO LOLA terrain by Selene Compass",
  url: "https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE",
};

type SiteInput = Omit<Site, "x" | "y">;

const site = (s: SiteInput): Site => ({ ...s, ...latLonToKm(s.lat, s.lon) });

export const SITES: Site[] = [
  site({
    id: "peak-shackleton",
    name: "Peak near Shackleton",
    short: "Peak/Shackleton",
    lat: -89.01701,
    lon: 126.27302,
    origin: "published",
    note: "Candidate site in NASA's “Peak near Shackleton” Artemis region, on the massif east of Shackleton.",
    ref: LPSC_2024,
  }),
  site({
    id: "connecting-ridge",
    name: "Connecting Ridge",
    short: "Conn. Ridge",
    lat: -89.53432,
    lon: 209.94767,
    origin: "published",
    note: "Candidate site on the ridge linking the Shackleton and de Gerlache rims (Artemis “Connecting Ridge” region).",
    ref: LPSC_2024,
  }),
  site({
    id: "shackleton-rim",
    name: "Shackleton Rim (high-light point)",
    short: "Shackleton rim",
    lat: -89.7849,
    lon: 203.97,
    origin: "published",
    note: "One of the most persistently sunlit points at the south pole (~81% average illumination in the NASA study).",
    ref: NASA_ILLUM,
  }),
  site({
    id: "connecting-ridge-c1",
    name: "Connecting Ridge C1",
    short: "Ridge C1",
    lat: -89.4505,
    lon: 222.84,
    origin: "published",
    note: "Highly illuminated ridge point C1 (~76% average illumination in the NASA study).",
    ref: NASA_ILLUM,
  }),
  site({
    id: "connecting-ridge-c2",
    name: "Connecting Ridge C2",
    short: "Ridge C2",
    lat: -89.3157,
    lon: 245.94,
    origin: "published",
    note: "Highly illuminated ridge point C2 toward de Gerlache (~76% average illumination in the NASA study).",
    ref: NASA_ILLUM,
  }),
  site({
    id: "connecting-ridge-ext",
    name: "Connecting Ridge Extension",
    short: "Ridge ext.",
    lat: -88.999,
    lon: 265.28,
    origin: "modelled",
    note: "Best-scoring spot this app finds in the ridge's western extension toward de Gerlache.",
    ref: LOLA,
  }),
  site({
    id: "de-gerlache-rim",
    name: "de Gerlache Rim 1",
    short: "de Gerlache",
    lat: -88.694,
    lon: 291.87,
    origin: "modelled",
    note: "Best-scoring spot this app finds on the eastern rim of de Gerlache crater.",
    ref: LOLA,
  }),
  site({
    id: "shoemaker-rim",
    name: "Shoemaker Rim",
    short: "Shoemaker",
    lat: -88.997,
    lon: 47.0,
    origin: "modelled",
    note: "Pole-facing rim of Shoemaker crater — flat but often shadowed; a comparison case.",
    ref: LOLA,
  }),
  site({
    id: "haworth-rim",
    name: "Haworth North Rim",
    short: "Haworth",
    lat: -88.307,
    lon: 351.32,
    origin: "modelled",
    note: "Pole-facing rim of Haworth crater on the Earth-facing side; low sunlight — a comparison case.",
    ref: LOLA,
  }),
  site({
    id: "shackleton-floor",
    name: "Shackleton Floor (PSR)",
    short: "Shackleton PSR",
    lat: -89.67,
    lon: 129.78,
    origin: "published",
    note: "Permanently shadowed crater floor — a science target for water ice, not a solar-powered landing site.",
    ref: {
      label: "Shackleton crater — IAU Gazetteer of Planetary Nomenclature",
      url: "https://planetarynames.wr.usgs.gov/Feature/5450",
    },
  }),
];

/**
 * Stack labels of nearby sites at different heights so they don't overlap: each site takes
 * the lowest level not used by an earlier site within `radiusKm`. Returns site id → level.
 */
export function labelLevels(
  sites: Pick<Site, "id" | "x" | "y">[],
  radiusKm = 9,
): Map<string, number> {
  const out = new Map<string, number>();
  sites.forEach((s, i) => {
    const used = new Set<number>();
    for (const o of sites.slice(0, i)) {
      if (Math.hypot(o.x - s.x, o.y - s.y) < radiusKm) used.add(out.get(o.id)!);
    }
    let level = 0;
    while (used.has(level)) level++;
    out.set(s.id, level);
  });
  return out;
}

export function findSite(id: string | null | undefined): Site | undefined {
  return SITES.find((s) => s.id === id);
}
