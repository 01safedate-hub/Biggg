"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Loc = { live: boolean; lat?: number; lng?: number; updated_at?: string; target_lat?: number; target_lng?: number; distance_km?: number; eta_min?: number };

/** Shows where the agent is while they are on the way. Asks for a fresh position every 10 seconds. */
export function TrackMap({ orderId, agentName }: { orderId: string; agentName?: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markers = useRef<{ agent?: import("leaflet").Marker; me?: import("leaflet").CircleMarker }>({});
  const fitted = useRef(false);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    let stop = false;
    const supabase = createClient();
    async function poll() {
      const { data } = await supabase.rpc("order_agent_location", { _order: orderId });
      if (!stop && data) setLoc(data as unknown as Loc);
    }
    poll();
    const t = setInterval(poll, 10000);
    return () => { stop = true; clearInterval(t); };
  }, [orderId]);

  useEffect(() => {
    const t = setInterval(() => setAgo(loc?.updated_at ? Math.max(0, Math.round((Date.now() - new Date(loc.updated_at).getTime()) / 1000)) : 0), 1000);
    return () => clearInterval(t);
  }, [loc?.updated_at]);

  useEffect(() => {
    if (!loc?.live || loc.lat == null || loc.lng == null) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(el.current, { scrollWheelZoom: false }).setView([loc.lat!, loc.lng!], 14);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(mapRef.current);
      }
      const map = mapRef.current;
      const icon = L.divIcon({ className: "", html: '<div style="background:#ea580c;color:#fff;border:2px solid #fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.4)">&#9992;</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
      if (markers.current.agent) markers.current.agent.setLatLng([loc.lat!, loc.lng!]); else markers.current.agent = L.marker([loc.lat!, loc.lng!], { icon, title: "Your agent" }).addTo(map);
      if (loc.target_lat != null && loc.target_lng != null && !markers.current.me) markers.current.me = L.circleMarker([loc.target_lat, loc.target_lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#2a78d6", fillOpacity: 1 }).addTo(map).bindTooltip("You");
      if (!fitted.current && loc.target_lat != null && loc.target_lng != null) { map.fitBounds([[loc.lat!, loc.lng!], [loc.target_lat, loc.target_lng]], { padding: [40, 40], maxZoom: 16 }); fitted.current = true; }
    })();
    return () => { cancelled = true; };
  }, [loc]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; markers.current = {}; fitted.current = false; }, []);

  if (!loc) return null;
  if (!loc.live) return <p className="text-sm text-ink-soft">{agentName ?? "Your agent"}&apos;s live position will show here once they set off with their location switched on.</p>;
  return (
    <div className="space-y-2">
      <div ref={el} style={{ height: 260 }} className="w-full overflow-hidden rounded-xl border border-line" role="application" aria-label="Map showing your agent's position" />
      <p className="text-sm" role="status">
        {loc.distance_km != null && <strong>{loc.distance_km} km away{loc.eta_min != null ? `, about ${loc.eta_min} min` : ""}</strong>}
        <span className="text-ink-mute"> · updated {ago < 5 ? "just now" : `${ago}s ago`}</span>
      </p>
    </div>
  );
}
