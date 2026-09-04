import { Check, Clock, Footprints, ShieldCheck } from "lucide-react";

import {
  SIGNAL_LABELS,
  SIGNAL_WEIGHTS,
  recommendationLine,
  type ScoredRoute,
  type SignalBreakdown,
} from "@/lib/raahi/safety";

const BAND_TEXT: Record<ScoredRoute["band"], string> = {
  strong: "text-safe",
  moderate: "text-caution",
  weak: "text-alert",
};
const BAND_BG: Record<ScoredRoute["band"], string> = {
  strong: "bg-safe",
  moderate: "bg-caution",
  weak: "bg-alert",
};
const BAND_RING: Record<ScoredRoute["band"], string> = {
  strong: "border-safe/60",
  moderate: "border-caution/60",
  weak: "border-alert/60",
};

interface Props {
  route: ScoredRoute;
  all: ScoredRoute[];
  isRecommended: boolean;
  isActive: boolean;
  onSelect: () => void;
}

export function RouteCard({ route, all, isRecommended, isActive, onSelect }: Props) {
  const signalKeys = Object.keys(SIGNAL_WEIGHTS) as (keyof SignalBreakdown)[];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border bg-surface p-4 text-left transition-all ${
        isActive ? `${BAND_RING[route.band]} shadow-panel` : "border-border hover:border-border/80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wide text-foreground">
              {route.label}
            </span>
            {isRecommended && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                <Check className="size-3" /> Recommended
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {route.durationMin} min
            </span>
            <span className="inline-flex items-center gap-1">
              <Footprints className="size-3.5" /> {route.distanceKm.toFixed(1)} km
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className={`text-2xl font-semibold leading-none ${BAND_TEXT[route.band]}`}>
            {route.score}
            <span className="text-xs font-normal text-muted-foreground">/100</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Relative safety
          </div>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${BAND_BG[route.band]}`}
          style={{ width: `${route.score}%` }}
        />
      </div>

      <ul className="mt-3 space-y-1.5">
        {route.factors.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-foreground/85">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${BAND_BG[route.band]}`} />
            {f}
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-border pt-3 text-xs italic text-muted-foreground">
        “{recommendationLine(route, all)}”
      </p>

      {isActive && (
        <div className="mt-3 space-y-1.5 rounded-lg bg-surface-raised p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Signal breakdown
          </div>
          {signalKeys.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-[46%] shrink-0 truncate text-[11px] text-muted-foreground">
                {SIGNAL_LABELS[k]}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80 transition-all duration-500"
                  style={{ width: `${Math.round(route.signals[k])}%` }}
                />
              </div>
              <span className="w-7 text-right text-[11px] tabular-nums text-foreground/80">
                {Math.round(route.signals[k])}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
