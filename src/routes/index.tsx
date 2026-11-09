import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Gauge, SlidersHorizontal } from "lucide-react";
import { AppHeader } from "@/components/compass/AppHeader";
import { ControlsPanel } from "@/components/compass/ControlsPanel";
import { SafetyDashboard } from "@/components/compass/SafetyDashboard";
import { MapView } from "@/components/compass/MapView";
import { ClassPill, DataSourceBadge } from "@/components/compass/bits";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useClassification, useSubject, useTerrain } from "@/hooks/use-terrain";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Selene Compass — Lunar South Pole Landing Safety Map" },
      {
        name: "description",
        content:
          "Interactive 3D map of the lunar south pole with safe and hazardous landing zones, solar illumination, slope and Earth-communication indicators, built on NASA LOLA elevation and JPL Horizons data.",
      },
      { property: "og:title", content: "Selene Compass — Lunar South Pole Landing Safety Map" },
      {
        property: "og:description",
        content: "Explore landing safety at the lunar south pole on NASA LOLA terrain in an interactive 3D map.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const data = useTerrain();
  const classification = useClassification(data);
  const subject = useSubject(data);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-space">
      <AppHeader />
      <div className="flex min-h-0 flex-1">
        <aside className="scrollbar-thin hidden w-72 shrink-0 overflow-y-auto border-r bg-sidebar/70 p-4 lg:block xl:w-80">
          <ControlsPanel classification={classification} />
        </aside>

        <main className="relative min-w-0 flex-1">
          <MapView data={data} classification={classification} />
        </main>

        <aside className="scrollbar-thin hidden w-80 shrink-0 overflow-y-auto border-l bg-sidebar/70 p-4 lg:block xl:w-96">
          <SafetyDashboard data={data} />
        </aside>
      </div>

      {/* Mobile / tablet action bar */}
      <div className="flex shrink-0 items-center gap-2 border-t bg-background/90 p-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setLeftOpen(true)}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border font-display text-xs tracking-wider uppercase hover:border-primary hover:text-primary"
        >
          <SlidersHorizontal className="size-4" /> Layers &amp; filters
        </button>
        <button
          type="button"
          onClick={() => setRightOpen(true)}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-primary/50 bg-primary/10 font-display text-xs tracking-wider text-primary uppercase"
        >
          <Gauge className="size-4" /> Safety
          {subject && (
            <>
              <span className="font-mono">{Math.round(subject.metrics.score)}</span>
              <ClassPill cls={subject.metrics.cls} className="hidden min-[380px]:inline-flex" />
            </>
          )}
        </button>
      </div>

      <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
        <SheetContent side="left" className="scrollbar-thin w-[88vw] overflow-y-auto border-border bg-sidebar p-4 sm:max-w-sm">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="font-display tracking-wider">Map controls</SheetTitle>
            <SheetDescription>
              <DataSourceBadge />
            </SheetDescription>
          </SheetHeader>
          <ControlsPanel classification={classification} />
        </SheetContent>
      </Sheet>

      <Sheet open={rightOpen} onOpenChange={setRightOpen}>
        <SheetContent side="right" className="scrollbar-thin w-[92vw] overflow-y-auto border-border bg-sidebar p-4 sm:max-w-md">
          <SheetHeader className="mb-2 text-left">
            <SheetTitle className="sr-only">Safety score dashboard</SheetTitle>
            <SheetDescription className="sr-only">Safety indicators for the selected location</SheetDescription>
          </SheetHeader>
          <SafetyDashboard data={data} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
