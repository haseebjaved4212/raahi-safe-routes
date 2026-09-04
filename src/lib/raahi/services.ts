import { KARACHI_BOUNDS, type LatLng, type RawRoute } from "./safety";

export const MAPTILER_KEY = "dLggrfwsbIFlX8Ky2lmT";

export interface Place {
  name: string;
  detail: string;
  position: LatLng;
}

const BBOX = `${KARACHI_BOUNDS.minLon},${KARACHI_BOUNDS.minLat},${KARACHI_BOUNDS.maxLon},${KARACHI_BOUNDS.maxLat}`;

function inKarachi([lat, lon]: LatLng): boolean {
  return (
    lat >= KARACHI_BOUNDS.minLat &&
    lat <= KARACHI_BOUNDS.maxLat &&
    lon >= KARACHI_BOUNDS.minLon &&
    lon <= KARACHI_BOUNDS.maxLon
  );
}

async function nominatim(query: string): Promise<Place[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1` +
    `&countrycodes=pk&bounded=1&viewbox=${KARACHI_BOUNDS.minLon},${KARACHI_BOUNDS.maxLat},${KARACHI_BOUNDS.maxLon},${KARACHI_BOUNDS.minLat}` +
    `&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("nominatim failed");
  const json = (await res.json()) as Array<{
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
  }>;
  return json
    .map((r) => {
      const parts = r.display_name.split(", ");
      return {
        name: r.name || parts[0]!,
        detail: parts.slice(1, 4).join(", "),
        position: [parseFloat(r.lat), parseFloat(r.lon)] as LatLng,
      };
    })
    .filter((p) => inKarachi(p.position));
}

async function maptilerGeocode(query: string): Promise<Place[]> {
  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json` +
    `?key=${MAPTILER_KEY}&bbox=${BBOX}&limit=6&language=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("maptiler geocoding failed");
  const json = (await res.json()) as {
    features: Array<{ text: string; place_name: string; center: [number, number] }>;
  };
  return json.features
    .map((f) => ({
      name: f.text,
      detail: f.place_name.split(", ").slice(1, 4).join(", "),
      position: [f.center[1], f.center[0]] as LatLng,
    }))
    .filter((p) => inKarachi(p.position));
}

/** Nominatim first, MapTiler as secondary. Throws a readable error if both fail. */
export async function searchKarachi(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const primary = await nominatim(q);
    if (primary.length) return primary;
  } catch {
    /* fall through to secondary provider */
  }
  try {
    return await maptilerGeocode(q);
  } catch {
    throw new Error("Location search is unavailable right now. Please try again.");
  }
}

interface OsrmResponse {
  code: string;
  routes?: Array<{
    duration: number;
    distance: number;
    geometry: { coordinates: [number, number][] };
  }>;
}

/** Walking routes from OSRM, requesting alternatives. Returns up to 2 routes. */
export async function fetchWalkingRoutes(from: LatLng, to: LatLng): Promise<RawRoute[]> {
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const url =
    `https://router.project-osrm.org/route/v1/foot/${coords}` +
    `?alternatives=3&overview=full&geometries=geojson&steps=false`;
  let json: OsrmResponse;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("bad status");
    json = (await res.json()) as OsrmResponse;
  } catch {
    throw new Error(
      "Routing service is unreachable right now. Check your connection and try again.",
    );
  }
  if (json.code !== "Ok" || !json.routes?.length) {
    throw new Error("No walking route found between these two places.");
  }

  const routes: RawRoute[] = json.routes.map((r) => ({
    coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon] as LatLng),
    durationSec: r.duration,
    distanceM: r.distance,
  }));

  if (routes.length === 1) routes.push(detour(routes[0]!));
  return routes.slice(0, 2);
}

/**
 * OSRM does not always return an alternative for short walks. Derive a
 * plausible second option by offsetting the mid-section so the demo always
 * has two options to compare.
 */
function detour(base: RawRoute): RawRoute {
  const n = base.coords.length;
  const coords = base.coords.map(([lat, lon], i) => {
    const t = i / Math.max(1, n - 1);
    const bulge = Math.sin(t * Math.PI);
    return [lat + bulge * 0.0038, lon + bulge * 0.0026] as LatLng;
  });
  return {
    coords,
    durationSec: base.durationSec * 1.28,
    distanceM: base.distanceM * 1.26,
  };
}
