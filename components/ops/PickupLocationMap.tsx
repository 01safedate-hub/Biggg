"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export function PickupLocationMap({ lat, lng, address }: { lat: number | null; lng: number | null; address: string }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let cancelled = false;
    void import("leaflet").then(({ default: L }) => {
      if (cancelled || !el.current || mapRef.current) return;
      const map = L.map(el.current, { scrollWheelZoom: false }).setView([lat, lng], 16);
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup(address || "Customer pickup location").openPopup();
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [lat, lng, address]);

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-xl border border-line bg-canvas p-5 text-center text-sm text-ink-soft">
        No saved map coordinates for this pickup. Use the address and Google Maps link above.
      </div>
    );
  }

  return <div ref={el} className="h-64 w-full overflow-hidden rounded-xl border border-line sm:h-80" role="application" aria-label="Map showing the customer's pickup location" />;
}
