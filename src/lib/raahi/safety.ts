/**
 * RAAHI Safety Intelligence Engine (simulated, deterministic).
 *
 * IMPORTANT: These signals are SIMULATED for demonstration. They do not
 * predict crime and do not guarantee anything. Output is a *relative safety
 * score* used to compare route options against each other.
 */

export type LatLng = [number, number]; // [lat, lon]

export const KARACHI_BOUNDS = {
  minLat: 24.72,
  maxLat: 25.2,
  minLon: 66.75,
  maxLon: 67.35,
};

export const KARACHI_CENTER: LatLng = [24.8607, 67.0011];

/* ------------------------------------------------------------------ */
/* Deterministic pseudo-random: same location -> same base values      */
/* ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable 0..1 value for a coordinate cell + signal name. */
function seed(lat: number, lon: number, salt: string, cell = 3): number {
  const key = `${lat.toFixed(cell)}:${lon.toFixed(cell)}:${salt}`;
  return hash(key) / 4294967295;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/* ------------------------------------------------------------------ */
/* Time-of-day curves                                                  */
/* ------------------------------------------------------------------ */

/** 0..1 pedestrian/street activity curve across the day. */
export function activityCurve(minutes: number): number {
  const h = minutes / 60;
  // Peaks late morning and early evening, drops sharply after midnight.
  const table = [
    0.08, 0.05, 0.04, 0.05, 0.1, 0.22, 0.42, 0.66, 0.82, 0.88, 0.92, 0.94, 0.9,
    0.86, 0.86, 0.9, 0.95, 1.0, 0.97, 0.85, 0.66, 0.48, 0.3, 0.16,
  ];
  const i = Math.floor(h) % 24;
  const j = (i + 1) % 24;
  const t = h - Math.floor(h);
  return table[i]! * (1 - t) + table[j]! * t;
}

/** How "dark" it is: 0 = full daylight, 1 = deep night (Karachi-ish). */
export function darknessFactor(minutes: number): number {
  const h = minutes / 60;
  if (h >= 7 && h <= 17.5) return 0;
  if (h > 17.5 && h < 19.5) return (h - 17.5) / 2;
  if (h > 5.5 && h < 7) return 1 - (h - 5.5) / 1.5;
  return 1;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Safe points                                                         */
/* ------------------------------------------------------------------ */

export type SafePointKind = "pharmacy" | "hospital" | "cafe" | "police";

export interface SafePoint {
  id: string;
  kind: SafePointKind;
  name: string;
  position: LatLng;
  openNow: boolean;
}

const SAFE_POINT_META: Record<
  SafePointKind,
  { label: string; names: string[]; opens: number; closes: number }
> = {
  pharmacy: {
    label: "Pharmacy",
    names: ["Sehat Pharmacy", "Clifton Medicos", "Al-Noor Chemist", "City Pharmacy"],
    opens: 8,
    closes: 24,
  },
  hospital: {
    label: "Hospital",
    names: ["Aga Khan Clinic", "Ziauddin Medical Centre", "Liaquat Emergency Unit"],
    opens: 0,
    closes: 24,
  },
  cafe: {
    label: "Café",
    names: ["Chai Wala Corner", "Espresso Lane", "Karachi Coffee House", "Roasted"],
    opens: 8,
    closes: 23,
  },
  police: {
    label: "Police point",
    names: ["Traffic Police Point", "Neighbourhood Police Post", "Patrol Checkpoint"],
    opens: 0,
    closes: 24,
  },
};

const KINDS: SafePointKind[] = ["pharmacy", "hospital", "cafe", "police"];

/* ------------------------------------------------------------------ */
/* Sampling                                                            */
/* ------------------------------------------------------------------ */

function samplePoints(coords: LatLng[], count = 14): LatLng[] {
  if (coords.length <= count) return coords;
  const out: LatLng[] = [];
  for (let i = 0; i < count; i++) {
    out.push(coords[Math.round((i * (coords.length - 1)) / (count - 1))]!);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export interface SignalBreakdown {
  lighting: number;
  activity: number;
  incidents: number;
  openBusinesses: number;
  safePoints: number;
}

export const SIGNAL_WEIGHTS: Record<keyof SignalBreakdown, number> = {
  lighting: 0.25,
  activity: 0.2,
  incidents: 0.25,
  openBusinesses: 0.15,
  safePoints: 0.15,
};

export const SIGNAL_LABELS: Record<keyof SignalBreakdown, string> = {
  lighting: "Lighting",
  activity: "Street activity",
  incidents: "Reported incident density",
  openBusinesses: "Businesses open now",
  safePoints: "Verified safe points",
};

export interface ScoredRoute {
  id: string;
  label: string;
  score: number;
  durationMin: number;
  distanceKm: number;
  coords: LatLng[];
  signals: SignalBreakdown;
  factors: string[];
  safePoints: SafePoint[];
  band: "strong" | "moderate" | "weak";
}

export interface RawRoute {
  coords: LatLng[];
  durationSec: number;
  distanceM: number;
}

export function scoreBand(score: number): ScoredRoute["band"] {
  if (score >= 70) return "strong";
  if (score >= 45) return "moderate";
  return "weak";
}

function safePointsFor(coords: LatLng[], minutes: number, routeId: string): SafePoint[] {
  const samples = samplePoints(coords, 10);
  const points: SafePoint[] = [];
  samples.forEach(([lat, lon], i) => {
    const density = seed(lat, lon, "sp-density");
    if (density < 0.42) return;
    const kind = KINDS[Math.floor(seed(lat, lon, "sp-kind") * KINDS.length)]!;
    const meta = SAFE_POINT_META[kind];
    const name = meta.names[Math.floor(seed(lat, lon, "sp-name") * meta.names.length)]!;
    const jitter = (seed(lat, lon, "sp-jitter") - 0.5) * 0.0016;
    const jitter2 = (seed(lat, lon, "sp-jitter2") - 0.5) * 0.0016;
    const h = minutes / 60;
    points.push({
      id: `${routeId}-sp-${i}`,
      kind,
      name,
      position: [lat + jitter, lon + jitter2],
      openNow: h >= meta.opens && h < meta.closes,
    });
  });
  return points;
}

function averageSignals(coords: LatLng[], minutes: number): SignalBreakdown {
  const samples = samplePoints(coords);
  const dark = darknessFactor(minutes);
  const activityBase = activityCurve(minutes);
  const h = minutes / 60;

  let lighting = 0;
  let activity = 0;
  let incidents = 0;
  let openBusinesses = 0;
  let safePoints = 0;

  for (const [lat, lon] of samples) {
    // Lighting: seeded infrastructure quality, penalised by darkness.
    const lightQuality = seed(lat, lon, "lighting");
    lighting += clamp(100 - dark * (78 - 68 * lightQuality));

    // Street / pedestrian activity: time curve modulated by seeded busyness.
    const busyness = 0.55 + 0.45 * seed(lat, lon, "busyness");
    activity += clamp(activityBase * busyness * 112);

    // Historical incident density: static per location.
    const density = Math.pow(seed(lat, lon, "incidents"), 1.25);
    incidents += clamp(100 - density * 88);

    // Businesses open now: seeded count with seeded closing hours.
    const total = 2 + Math.floor(seed(lat, lon, "biz-count") * 7);
    let open = 0;
    for (let b = 0; b < total; b++) {
      const opens = 7 + Math.floor(seed(lat, lon, `biz-open-${b}`) * 4);
      const closes = 17 + Math.floor(seed(lat, lon, `biz-close-${b}`) * 8);
      if (h >= opens && h < closes) open++;
    }
    openBusinesses += clamp((open / total) * 100);

    // Verified safe points reachable nearby.
    const spDensity = seed(lat, lon, "sp-density");
    const nightPenalty = dark * 12;
    safePoints += clamp(spDensity * 105 - nightPenalty);
  }

  const n = samples.length;
  return {
    lighting: lighting / n,
    activity: activity / n,
    incidents: incidents / n,
    openBusinesses: openBusinesses / n,
    safePoints: safePoints / n,
  };
}

function buildFactors(s: SignalBreakdown, minutes: number, sp: SafePoint[]): string[] {
  const dark = darknessFactor(minutes) > 0.4;
  const pos: string[] = [];
  const neg: string[] = [];

  if (s.lighting >= 70) pos.push("Well-lit stretches for most of the walk");
  else if (s.lighting >= 45) neg.push("Mixed lighting along parts of this stretch");
  else neg.push("Poor lighting along this stretch");

  if (s.activity >= 68) pos.push("Steady pedestrian activity right now");
  else if (s.activity >= 40) neg.push("Moderate footfall at this hour");
  else neg.push(dark ? "Low late-night activity" : "Quiet streets at this hour");

  if (s.incidents >= 70) pos.push("Few community reports on this corridor");
  else if (s.incidents >= 45) neg.push("Some community reports on this corridor");
  else neg.push("Higher density of recent community reports");

  if (s.openBusinesses >= 65) pos.push("Active businesses currently open");
  else if (s.openBusinesses >= 35) neg.push("Only a few businesses still open");
  else neg.push("Most businesses closed at this hour");

  const openSp = sp.filter((p) => p.openNow);
  if (openSp.length > 0) {
    const first = openSp[0]!;
    pos.push(
      `Nearby ${SAFE_POINT_META[first.kind].label.toLowerCase()} (verified safe point)`,
    );
  } else if (sp.length > 0) {
    neg.push("Verified safe points nearby are closed now");
  } else {
    neg.push("No verified safe points close to this path");
  }

  const ordered = s.lighting + s.activity >= 120 ? [...pos, ...neg] : [...neg, ...pos];
  return ordered.slice(0, 5);
}

export function scoreRoutes(raw: RawRoute[], minutes: number): ScoredRoute[] {
  return raw.map((r, i) => {
    const id = `route-${i}`;
    const signals = averageSignals(r.coords, minutes);
    const score = Math.round(
      (Object.keys(SIGNAL_WEIGHTS) as (keyof SignalBreakdown)[]).reduce(
        (acc, k) => acc + signals[k] * SIGNAL_WEIGHTS[k],
        0,
      ),
    );
    const safePoints = safePointsFor(r.coords, minutes, id);
    return {
      id,
      label: `Route ${String.fromCharCode(65 + i)}`,
      score,
      durationMin: Math.max(1, Math.round(r.durationSec / 60)),
      distanceKm: r.distanceM / 1000,
      coords: r.coords,
      signals,
      factors: buildFactors(signals, minutes, safePoints),
      safePoints,
      band: scoreBand(score),
    };
  });
}

/** One-line comparison of the time tradeoff against the best alternative. */
export function recommendationLine(route: ScoredRoute, all: ScoredRoute[]): string {
  const best = [...all].sort((a, b) => b.score - a.score)[0]!;
  if (route.id === best.id) {
    const other = all.find((r) => r.id !== route.id);
    if (!other) return "Currently the strongest relative safety profile available.";
    const delta = route.durationMin - other.durationMin;
    if (delta > 0)
      return `This route takes about ${delta} minute${delta === 1 ? "" : "s"} longer but currently has a stronger safety profile.`;
    if (delta < 0)
      return `This route is about ${-delta} minute${delta === -1 ? "" : "s"} quicker and currently has a stronger safety profile.`;
    return "Same travel time, stronger current safety profile.";
  }
  const delta = route.durationMin - best.durationMin;
  if (delta < 0)
    return `Saves about ${-delta} minute${delta === -1 ? "" : "s"}, but ${best.label} currently scores ${best.score - route.score} points higher.`;
  return `${best.label} currently has a stronger safety profile at a similar travel time.`;
}
