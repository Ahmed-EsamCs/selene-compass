import { Link } from "@tanstack/react-router";
import { BookOpen, Map as MapIcon, Rows3 } from "lucide-react";
import { DataSourceBadge } from "./bits";

const NAV = [
  { to: "/", label: "Mission Map", icon: MapIcon },
  { to: "/sites", label: "Landing Sites", icon: Rows3 },
  { to: "/about", label: "Methodology", icon: BookOpen },
] as const;

export function CompassLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle
        cx="20"
        cy="20"
        r="17"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.2"
      />
      <circle
        cx="20"
        cy="20"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1"
      />
      <path d="M20 3 L23 20 L20 37 L17 20 Z" fill="currentColor" fillOpacity="0.9" />
      <path d="M3 20 L20 17.5 L37 20 L20 22.5 Z" fill="currentColor" fillOpacity="0.35" />
      <circle
        cx="20"
        cy="20"
        r="2.4"
        className="fill-background"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function AppHeader() {
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur md:px-5">
      <Link to="/" className="flex items-center gap-2.5">
        <CompassLogo className="size-8 text-primary" />
        <div className="leading-none">
          <div className="font-display text-base font-semibold tracking-[0.18em] text-foreground">
            SELENE <span className="text-primary">COMPASS</span>
          </div>
          <div className="mt-1 hidden text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:block">
            Lunar South Pole · Landing Safety Explorer
          </div>
        </div>
      </Link>

      <nav className="ml-auto flex items-center gap-1 md:ml-8" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 font-display text-xs tracking-wider text-muted-foreground uppercase transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:text-primary"
            aria-label={label}
          >
            <Icon className="size-4" />
            <span className="hidden md:inline">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="ml-2 hidden lg:ml-auto lg:block">
        <DataSourceBadge />
      </div>
    </header>
  );
}
