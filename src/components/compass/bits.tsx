import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import type { SafetyClass } from "@/lib/lunar/analysis";
import { cn } from "@/lib/utils";

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-caution/40 bg-caution/10 px-2.5 py-1 font-display text-[10px] font-medium tracking-[0.14em] text-caution uppercase",
        className,
      )}
      title="All terrain, illumination and communication values are simulated for demonstration. Not NASA-verified data."
    >
      <FlaskConical className="size-3" />
      Demonstration data · simulated
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="hud-label flex items-center gap-2">
        <span className="h-px w-3 bg-primary" />
        {children}
      </h2>
      {action}
    </div>
  );
}

export const CLASS_LABEL: Record<SafetyClass, string> = {
  safe: "Safe",
  caution: "Caution",
  hazard: "Hazard",
};

export function ClassPill({ cls, className }: { cls: SafetyClass; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-display text-[10px] font-semibold tracking-[0.14em] uppercase",
        cls === "safe" && "bg-safe/15 text-safe",
        cls === "caution" && "bg-caution/15 text-caution",
        cls === "hazard" && "bg-hazard/15 text-hazard",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          cls === "safe" && "bg-safe",
          cls === "caution" && "bg-caution",
          cls === "hazard" && "bg-hazard",
        )}
      />
      {CLASS_LABEL[cls]}
    </span>
  );
}

export function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("panel p-4", className)}>{children}</section>;
}
