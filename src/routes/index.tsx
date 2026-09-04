import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Compass, Loader2, Moon, Navigation, Sun } from "lucide-react";
import { toast } from "sonner";

import MapView from "@/components/raahi/MapView";
import { RouteCard } from "@/components/raahi/RouteCard";
import { SearchField } from "@/components/raahi/SearchField";
import { Slider } from "@/components/ui/slider";
import {
  activityCurve,
  darknessFactor,
  formatClock,
  scoreRoutes,
  type LatLng,
  type RawRoute,
  type ScoredRoute,
} from "@/lib/raahi/safety";
import { fetchWalkingRoutes, type Place } from "@/lib/raahi/services";

const TITLE = "RAAHI — Safer routes across Karachi";
const DESCRIPTION =
  "RAAHI compares walking route options in Karachi and recommends the one with the stronger relative safety profile — and explains why.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RaahiPage,
});

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function RaahiPage() {
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);

  const [raw, setRaw] = useState<RawRoute[]>([]);
  const [minutes, setMinutes] = useState(1230); // 20:30 — evening by default
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [fitKey, setFitKey] = useState("");

  useEffect(() => setMinutes(nowMinutes()), []);

  const routes: ScoredRoute[] = useMemo(
    () => (raw.length ? scoreRoutes(raw, minutes) : []),
    [raw, minutes],
  );

  const ranked = useMemo(() => [...routes].sort((a, b) => b.score - a.score), [routes]);
  const recommendedId = ranked[0]?.id ?? null;

  // "Recalculating…" moment when the recommendation flips as time changes.
  const prevRecommended = useRef<string | null>(null);
  useEffect(() => {
    if (!recommendedId) {
      prevRecommended.current = null;
      return undefined;
    }
    if (prevRecommended.current && prevRecommended.current !== recommendedId) {
      const label = routes.find((r) => r.id === recommendedId)?.label ?? "route";
      setRecalculating(true);
      toast("Recalculating…", {
        description: `${label} now has the stronger relative safety profile.`,
        duration: 2200,
      });
      const t = setTimeout(() => setRecalculating(false), 900);
      prevRecommended.current = recommendedId;
      setActiveId(recommendedId);
      return () => clearTimeout(t);
    }
    prevRecommended.current = recommendedId;
    return undefined;
  }, [recommendedId, routes]);

  const activeRoute = routes.find((r) => r.id === activeId) ?? ranked[0] ?? null;

  const plan = useCallback(
    async (a: LatLng | null, b: LatLng | null) => {
      if (!a || !b) return;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchWalkingRoutes(a, b);
        setRaw(result);
        setActiveId(null);
        prevRecommended.current = null;
        setFitKey(`${a.join()}-${b.join()}-${Date.now()}`);
      } catch (e) {
        setRaw([]);
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (origin && destination) void plan(origin, destination);
  }, [origin, destination, plan]);

  const dark = darknessFactor(minutes) > 0.4;
  const activityPct = Math.round(activityCurve(minutes) * 100);

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-border bg-background lg:h-screen lg:w-[400px] lg:border-b-0 lg:border-r">
        <header className="border-b border-border px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Compass className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-none tracking-[0.18em] text-foreground">
                RAAHI
              </h1>
              <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-primary">
                Safety-aware navigation
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Maps optimise for time. RAAHI compares walking options across Karachi and
            recommends the one with the stronger{" "}
            <span className="text-foreground/90">relative safety score</span> right now.
          </p>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 raahi-scroll">
          <div className="space-y-3">
            <SearchField
              id="from"
              label="From"
              dotClass="bg-primary"
              value={fromText}
              placeholder="e.g. Empress Market, Saddar"
              onTextChange={(t) => {
                setFromText(t);
                setOrigin(null);
              }}
              onPick={(p: Place) => {
                setFromText(p.name);
                setOrigin(p.position);
              }}
            />
            <SearchField
              id="to"
              label="To"
              dotClass="bg-foreground"
              value={toText}
              placeholder="e.g. Frere Hall, Civil Lines"
              onTextChange={(t) => {
                setToText(t);
                setDestination(null);
              }}
              onPick={(p: Place) => {
                setToText(p.name);
                setDestination(p.position);
              }}
            />
          </div>

          {/* Time-of-day */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Time of travel
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-primary">
                {dark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
                {formatClock(minutes)}
              </span>
            </div>
            <Slider
              className="mt-4"
              min={0}
              max={1439}
              step={5}
              value={[minutes]}
              onValueChange={(v) => setMinutes(v[0] ?? 0)}
              aria-label="Time of day"
            />
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:59</span>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Simulated street activity at this hour:{" "}
              <span className="text-foreground/90">{activityPct}%</span> of daily peak. Move
              the slider to see scores update live.
            </p>
          </section>

          {/* States */}
          {loading && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Comparing route options…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-alert/50 bg-alert/10 px-4 py-3 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alert" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && routes.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <Navigation className="mx-auto size-5 text-primary" />
              <p className="mt-2 text-sm text-foreground/90">Pick a start and destination</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Search is limited to Karachi. RAAHI will fetch two walking options and score
                each one.
              </p>
            </div>
          )}

          {routes.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Route options
                </h2>
                {recalculating && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
                    <Loader2 className="size-3 animate-spin" /> Recalculating…
                  </span>
                )}
              </div>
              {ranked.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
                  all={routes}
                  isRecommended={r.id === recommendedId}
                  isActive={activeRoute?.id === r.id}
                  onSelect={() => setActiveId(r.id)}
                />
              ))}
            </section>
          )}

          <p className="pb-2 text-[10px] leading-relaxed text-muted-foreground/80">
            RAAHI is a decision-support tool. Safety signals in this demo are simulated and
            deterministic. Scores are relative comparisons between the options shown — they do
            not guarantee outcomes or predict incidents.
          </p>
        </div>
      </aside>

      {/* Map */}
      <main className="relative h-[60vh] min-h-[380px] flex-1 lg:h-screen">
        <MapView
          routes={routes}
          recommendedId={recommendedId}
          activeId={activeRoute?.id ?? null}
          origin={origin}
          destination={destination}
          fitKey={fitKey}
          onSelect={setActiveId}
        />

        <div className="pointer-events-none absolute left-4 top-4 z-[600] flex flex-wrap gap-2">
          <Legend color="bg-safe" label="Stronger profile · 70+" />
          <Legend color="bg-caution" label="Moderate · 45–69" />
          <Legend color="bg-alert" label="Weaker · under 45" />
        </div>

        {activeRoute && (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-[600] mx-auto max-w-xl rounded-xl border border-border bg-background/90 px-4 py-3 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Showing {activeRoute.label} · {formatClock(minutes)}
            </p>
            <p className="mt-1 text-sm text-foreground/90">
              {activeRoute.safePoints.length} verified safe point
              {activeRoute.safePoints.length === 1 ? "" : "s"} near this path ·{" "}
              {activeRoute.safePoints.filter((p) => p.openNow).length} open now
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/85 px-2.5 py-1 text-[10px] font-medium tracking-wide text-foreground/85 backdrop-blur">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
