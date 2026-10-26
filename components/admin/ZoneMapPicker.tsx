"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  onPick: (lat: number, lng: number) => void;
};

const FALLBACK: [number, number] = [6.2, 7.0];

export default function ZoneMapPicker({ lat, lng, radiusM, onPick }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  const [mapError, setMapError] = useState("");

  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    let disposed = false;
    let map: any;
    const load = async () => {
      try {
        if (!document.querySelector('link[data-leaflet-css="true"]')) {
          const css = document.createElement("link");
          css.rel = "stylesheet";
          css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          css.dataset.leafletCss = "true";
          document.head.appendChild(css);
        }
        const L = await import("leaflet");
        if (disposed || !host.current) return;
        const start: [number, number] = lat != null && lng != null ? [lat, lng] : FALLBACK;
        map = L.map(host.current).setView(start, lat != null ? 13 : 8);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        mapRef.current = map;
        const update = (a: number, b: number) => {
          onPickRef.current(a, b);
          if (layerRef.current) map.removeLayer(layerRef.current);
          if (markerRef.current) map.removeLayer(markerRef.current);
          markerRef.current = L.marker([a, b]).addTo(map);
          layerRef.current = L.circle([a, b], { radius: radiusM ?? 1000, color: "#1677c8", fillOpacity: 0.12 }).addTo(map);
        };
        if (lat != null && lng != null) update(lat, lng);
        map.on("click", (e: any) => update(e.latlng.lat, e.latlng.lng));
      } catch {
        if (!disposed) setMapError("The map could not load. You can still enter coordinates or use your device location below.");
      }
    };
    void load();
    return () => {
      disposed = true;
      if (map) map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markerRef.current = null;
    };
  // The map is initialized once; later edits are reflected in the form inputs and saved on submit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat == null || lng == null) return;
    import("leaflet").then((L) => {
      if (layerRef.current) map.removeLayer(layerRef.current);
      if (markerRef.current) map.removeLayer(markerRef.current);
      markerRef.current = L.marker([lat, lng]).addTo(map);
      layerRef.current = L.circle([lat, lng], { radius: radiusM ?? 1000, color: "#1677c8", fillOpacity: 0.12 }).addTo(map);
    });
  }, [lat, lng, radiusM]);

  return <div className="space-y-2">
    <div className="overflow-hidden rounded-md border border-line">
      <div ref={host} role="application" aria-label="Coverage zone map; click to choose the zone centre" style={{ height: 300, width: "100%", background: "#eef3f6" }} />
    </div>
    <p className="text-xs text-ink-soft">Click the map to set the zone centre. The circle shows the coverage radius. Map data © OpenStreetMap contributors.</p>
    {mapError && <p role="status" className="text-xs text-amber-700">{mapError}</p>}
  </div>;
}
