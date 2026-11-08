/**
 * Candidate landing sites. Names echo publicly discussed south-pole regions, but the
 * positions are approximate and every metric shown for them is SIMULATED demo output.
 */
export interface Site {
  id: string;
  name: string;
  x: number; // km, map frame
  y: number;
  note: string;
}

export const SITES: Site[] = [
  {
    id: "peak-shackleton",
    name: "Peak near Shackleton",
    x: 16,
    y: 4,
    note: "Elevated massif east of Shackleton; long sunlit periods in this model.",
  },
  {
    id: "connecting-ridge",
    name: "Connecting Ridge",
    x: -17,
    y: -2.3,
    note: "Ridge linking Shackleton and de Gerlache rims.",
  },
  {
    id: "connecting-ridge-ext",
    name: "Connecting Ridge Extension",
    x: -27,
    y: -0.5,
    note: "Western continuation of the ridge toward de Gerlache.",
  },
  {
    id: "de-gerlache-rim",
    name: "de Gerlache Rim 1",
    x: -33,
    y: 14,
    note: "Northern rim segment of de Gerlache crater.",
  },
  {
    id: "shoemaker-rim",
    name: "Shoemaker Rim",
    x: 22,
    y: 22,
    note: "Southwest rim of Shoemaker crater.",
  },
  {
    id: "kocher-massif",
    name: "de Gerlache–Kocher Massif",
    x: -22,
    y: -20,
    note: "Broad massif between de Gerlache and Sverdrup.",
  },
  {
    id: "haworth-rim",
    name: "Haworth North Rim",
    x: -6,
    y: 52,
    note: "Earth-facing rim of Haworth crater.",
  },
  {
    id: "shackleton-floor",
    name: "Shackleton Floor (PSR)",
    x: 7.7,
    y: -6.4,
    note: "Permanently shadowed crater floor — science target, not a solar-powered landing site.",
  },
];

export function findSite(id: string | null | undefined): Site | undefined {
  return SITES.find((s) => s.id === id);
}
