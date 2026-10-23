"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { STAGES, STAGE_BY_KEY, gmaps, type MapPoint } from "@/lib/customers";

/** OpenStreetMap through Leaflet: free, no account and no key. */
export function CustomerMap({ points, height = 520, single = false }: { points: MapPoint[]; height?: number; single?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const [stages, setStages] = useState<Set<string>>(() => new Set(STAGES.map((s) => s.key)));
  const [hot, setHot] = useState(true);
  const shown = useMemo(() => points.filter((p) => stages.has(p.stage)), [points, stages]);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView([6.5244, 3.3792], 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      const bounds: [number, number][] = [];
      if (hot && !single) {
        const grid = new Map<string, { lat: number; lng: number; n: number }>();
        for (const p of shown) { const k = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`; const g = grid.get(k) ?? { lat: 0, lng: 0, n: 0 }; g.lat += p.lat; g.lng += p.lng; g.n += 1; grid.set(k, g); }
        grid.forEach((g) => { if (g.n >= 2) L.circle([g.lat / g.n, g.lng / g.n], { radius: 350 + g.n * 60, color: "#ea580c", weight: 1, fillColor: "#ea580c", fillOpacity: Math.min(0.12 + g.n * 0.04, 0.45) }).addTo(map!).bindTooltip(`${g.n} customers in this area`); });
      }
      for (const p of shown) {
        bounds.push([p.lat, p.lng]);
        const m = L.circleMarker([p.lat, p.lng], { radius: single ? 9 : 7, color: "#fff", weight: 2, fillColor: STAGE_BY_KEY[p.stage]?.color ?? "#2a78d6", fillOpacity: 0.95 }).addTo(map);
        const box = document.createElement("div");
        const name = document.createElement("strong"); name.textContent = p.name || "Customer"; box.appendChild(name);
        const info = document.createElement("div"); info.textContent = `${STAGE_BY_KEY[p.stage]?.label ?? ""} · ${p.orders} order${p.orders === 1 ? "" : "s"}`; box.appendChild(info);
        if (p.address) { const ad = document.createElement("div"); ad.textContent = p.address; box.appendChild(ad); }
        const a = document.createElement("a"); a.href = gmaps(p.lat, p.lng); a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "Open in Google Maps"; box.appendChild(a);
        m.bindPopup(box);
      }
      if (bounds.length === 1) map.setView(bounds[0], 15); else if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      map.once("focus", () => map?.scrollWheelZoom.enable());
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [shown, hot, single]);

  const toggle = (k: string) => setStages((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="space-y-3">
      {!single && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {STAGES.map((s) => <button key={s.key} type="button" aria-pressed={stages.has(s.key)} onClick={() => toggle(s.key)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${stages.has(s.key) ? "border-ink bg-white" : "border-line text-ink-mute line-through"}`}><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</button>)}
          <label className="ml-auto flex items-center gap-2"><input type="checkbox" checked={hot} onChange={(e) => setHot(e.target.checked)} /> Highlight busy areas</label>
        </div>
      )}
      <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-xl border border-line" role="application" aria-label="Map of customers" />
      {!single && <p className="text-xs text-ink-mute">{shown.length} of {points.length} customers shown. Pins use the pickup location of their latest order. Click a pin for details.</p>}
    </div>
  );
}
