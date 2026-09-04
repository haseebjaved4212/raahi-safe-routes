import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup, TileLayer } from "leaflet";

import { KARACHI_BOUNDS, KARACHI_CENTER, type LatLng, type ScoredRoute } from "@/lib/raahi/safety";
import { MAPTILER_KEY } from "@/lib/raahi/services";

const BAND_VAR: Record<ScoredRoute["band"], string> = {
  strong: "--color-safe",
  moderate: "--color-caution",
  weak: "--color-alert",
};

const KIND_GLYPH: Record<string, string> = {
  pharmacy: "+",
  hospital: "H",
  cafe: "C",
  police: "P",
};

function cssVar(name: string): string {
  if (typeof window === "undefined") return "#3FC98A";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#3FC98A";
}

interface Props {
  routes: ScoredRoute[];
  recommendedId: string | null;
  activeId: string | null;
  origin: LatLng | null;
  destination: LatLng | null;
  fitKey: string;
  onSelect: (id: string) => void;
}

export default function MapView({
  routes,
  recommendedId,
  activeId,
  origin,
  destination,
  fitKey,
  onSelect,
}: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const lastFit = useRef<string>("");
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // Init map (client-only: leaflet is imported dynamically after mount).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default ?? (await import("leaflet"));
      if (cancelled || !holder.current || mapRef.current) return;
      leafletRef.current = L as typeof import("leaflet");

      const map = L.map(holder.current, {
        center: KARACHI_CENTER,
        zoom: 12,
        zoomControl: true,
        maxBounds: [
          [KARACHI_BOUNDS.minLat - 0.08, KARACHI_BOUNDS.minLon - 0.08],
          [KARACHI_BOUNDS.maxLat + 0.08, KARACHI_BOUNDS.maxLon + 0.08],
        ],
        maxBoundsViscosity: 0.9,
        minZoom: 10,
        attributionControl: true,
      });

      const osmFallback = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      });

      const maptiler: TileLayer = L.tileLayer(
        `https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
        { attribution: "&copy; MapTiler &copy; OpenStreetMap contributors", maxZoom: 20 },
      );

      let fellBack = false;
      maptiler.on("tileerror", () => {
        if (fellBack) return;
        fellBack = true;
        map.removeLayer(maptiler);
        osmFallback.addTo(map);
      });
      maptiler.addTo(map);

      layersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      // Nudge Leaflet after layout settles.
      setTimeout(() => map.invalidateSize(), 120);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Draw routes, safe points and endpoints.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const group = layersRef.current;
    if (!L || !map || !group) return;
    group.clearLayers();

    const ordered = [...routes].sort((a) =>
      a.id === recommendedId || a.id === activeId ? 1 : -1,
    );

    for (const route of ordered) {
      const isFocus = route.id === (activeId ?? recommendedId);
      const color = cssVar(BAND_VAR[route.band]);

      L.polyline(route.coords, {
        color: "#000000",
        opacity: isFocus ? 0.45 : 0.25,
        weight: isFocus ? 11 : 8,
        lineCap: "round",
      }).addTo(group);

      const line = L.polyline(route.coords, {
        color,
        weight: isFocus ? 6 : 4,
        opacity: isFocus ? 1 : 0.55,
        dashArray: isFocus ? undefined : "1 9",
        lineCap: "round",
      }).addTo(group);
      line.on("click", () => selectRef.current(route.id));
      line.bindTooltip(
        `${route.label} · ${route.score}/100 · ${route.durationMin} min`,
        { sticky: true, direction: "top" },
      );

      if (isFocus) {
        for (const sp of route.safePoints) {
          const accent = cssVar(sp.openNow ? "--color-safe" : "--color-muted-foreground");
          const icon = L.divIcon({
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: `<div style="width:22px;height:22px;border-radius:999px;display:flex;align-items:center;justify-content:center;
              background:${cssVar("--color-surface-raised")};border:1.5px solid ${accent};
              color:${accent};font:700 11px/1 Outfit,sans-serif;box-shadow:0 4px 12px -4px #000">${KIND_GLYPH[sp.kind]}</div>`,
          });
          L.marker(sp.position, { icon })
            .addTo(group)
            .bindPopup(
              `<strong>${sp.name}</strong><br/>Verified safe point · ${sp.openNow ? "Open now" : "Closed now"}`,
            );
        }
      }
    }

    const endpoint = (pos: LatLng, label: string, varName: string) => {
      const c = cssVar(varName);
      const icon = L.divIcon({
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        html: `<div style="position:relative;width:34px;height:34px">
            <span class="raahi-endpoint-dot" style="position:absolute;inset:5px;border-radius:999px;background:${c};opacity:.28"></span>
            <span style="position:absolute;inset:10px;border-radius:999px;background:${c};border:2px solid ${cssVar("--color-background")}"></span>
          </div>`,
      });
      L.marker(pos, { icon, zIndexOffset: 500 }).addTo(group).bindPopup(label);
    };

    if (origin) endpoint(origin, "Start", "--color-primary");
    if (destination) endpoint(destination, "Destination", "--color-foreground");

    if (fitKey && fitKey !== lastFit.current && routes.length) {
      lastFit.current = fitKey;
      const all = routes.flatMap((r) => r.coords);
      map.fitBounds(L.latLngBounds(all).pad(0.12), { animate: true });
    }
  }, [routes, recommendedId, activeId, origin, destination, fitKey]);

  return <div ref={holder} className="h-full w-full" aria-label="Karachi safety map" />;
}
