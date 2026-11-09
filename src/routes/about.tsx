import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Mountain, RadioTower, ShieldAlert, Sun } from "lucide-react";
import { AppHeader } from "@/components/compass/AppHeader";
import { DataSourceBadge } from "@/components/compass/bits";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Methodology & Data Notice — Selene Compass" },
      {
        name: "description",
        content:
          "How Selene Compass turns NASA LRO LOLA elevation and JPL Horizons ephemerides into slope, illumination, Earth-visibility and landing-safety estimates — and their limits.",
      },
      { property: "og:title", content: "Methodology & Data Notice — Selene Compass" },
      {
        property: "og:description",
        content: "The NASA data and simplified models behind Selene Compass.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

const FACTORS = [
  {
    icon: Mountain,
    title: "Terrain slope",
    body: "Computed with central differences from NASA LRO LOLA elevations resampled to 0.75 km cells (procedural terrain if the LOLA asset is unavailable). Full credit at ≤ 2°, none at ≥ 20°. Ground steeper than 15° is always marked hazardous. Slopes at 0.75 km are smoother than what a lander sees at metre scale.",
  },
  {
    icon: Sun,
    title: "Solar illumination",
    body: "For each point, a horizon profile is ray-marched in 24 directions, including lunar curvature. The Sun circles the polar horizon at −1.5° to +1.5° elevation; the share of time its disk clears the horizon is the illumination value. Below 5% counts as permanent shadow. The Live sky card uses the real current Sun position from NASA JPL Horizons.",
  },
  {
    icon: RadioTower,
    title: "Earth communication stability",
    body: "Earth hangs low toward 0° longitude and wobbles about ±6.7° in elevation and ±7.9° in azimuth through libration. The value is the share of libration states in which Earth stays above the local horizon. The Live sky card forecasts the real Earth track for the next 30 days from JPL Horizons.",
  },
];

const SOURCES = [
  { label: "LRO Lunar Orbiter Laser Altimeter (LOLA)", href: "https://lola.gsfc.nasa.gov/" },
  {
    label: "LOLA south-pole DEM products (LDEM_80S_80M and others)",
    href: "https://imbrium.mit.edu/BROWSE/LOLA_GDR/POLAR/SOUTH_POLE",
  },
  { label: "NASA/JPL Horizons ephemeris system", href: "https://ssd.jpl.nasa.gov/horizons/" },
  { label: "NASA PGDA — South pole illumination & topography products", href: "https://pgda.gsfc.nasa.gov/" },
  { label: "NASA Moon Trek", href: "https://trek.nasa.gov/moon/" },
  { label: "NASA Artemis program", href: "https://www.nasa.gov/humans-in-space/artemis/" },
];

function AboutPage() {
  return (
    <div className="min-h-dvh bg-space-gradient">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-10 md:py-14">
        <p className="hud-label">Methodology</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-wide md:text-4xl">
          How the safety score works
        </h1>

        <div className="panel mt-6 flex gap-3 border-l-2 border-caution p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-caution" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold text-caution">Real NASA inputs — modelled outputs.</p>
            <p className="mt-1 text-muted-foreground">
              Selene Compass was built for the NASA Space Apps Challenge. Elevation comes from NASA&apos;s
              Lunar Reconnaissance Orbiter laser altimeter (LOLA) and live Sun/Earth positions from NASA
              JPL Horizons. Slope, illumination, Earth visibility and safety scores are computed by this
              app with simplified models over a 120 × 120 km window at 750 m resolution; they are
              estimates, not official NASA products, and must not be used for mission planning. If the
              LOLA data cannot be loaded, the app falls back to procedural terrain and says so.
            </p>
            <div className="mt-3"><DataSourceBadge /></div>
          </div>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {FACTORS.map(({ icon: Icon, title, body }) => (
            <article key={title} className="panel hud-corner p-5">
              <Icon className="size-5 text-primary" />
              <h2 className="mt-3 font-display text-lg font-semibold tracking-wide">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-wide">Score and zones</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Safety score</span> = weighted average of the slope,
              sunlight (full credit at 70%) and Earth-visibility (full credit at 60%) factors, 0–100.
              You can change the weights on the map page.
            </li>
            <li>
              <span className="text-hazard">Hazardous</span>: slope above 15°, score below 40, or
              permanently shadowed.
            </li>
            <li>
              <span className="text-safe">Safe</span>: passes every filter you set (max slope, minimum
              sunlight, minimum Earth visibility, minimum score).
            </li>
            <li>
              <span className="text-caution">Caution</span>: everything in between.
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-wide">Data sources</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Public NASA datasets and services used by, or useful for going beyond, this app:
          </p>
          <ul className="mt-3 space-y-2">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  {s.label} <ExternalLink className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <Link
          to="/"
          className="mt-12 inline-flex items-center rounded-md bg-primary px-5 py-2.5 font-display text-sm font-semibold tracking-wider text-primary-foreground uppercase hover:bg-primary/90"
        >
          Open the mission map
        </Link>
      </main>
    </div>
  );
}
