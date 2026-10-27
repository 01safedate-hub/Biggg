"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Pickup = { id: string; order_no: number; status: string; pickup_address: string | null; pickup_lat: number | null; pickup_lng: number | null };

export function AgentPickupMap({ agentId }: { agentId: string }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markers = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const [rows, setRows] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    const refresh = async () => {
      const { data, error } = await supabase.from("orders")
        .select("id,order_no,status,pickup_address,pickup_lat,pickup_lng")
        .eq("pickup_agent_id", agentId)
        .in("status", ["agent_assigned", "agent_arrived", "counted", "count_confirmed"])
        .order("created_at", { ascending: true });
      if (stopped) return;
      if (!error) { setRows((data ?? []) as Pickup[]); setLastUpdate(new Date()); }
      setLoading(false);
    };
    void refresh();
    const channel = supabase.channel(`agent-pickup-map-${agentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { void refresh(); })
      .subscribe();
    return () => { stopped = true; void supabase.removeChannel(channel); };
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !element.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(element.current, { scrollWheelZoom: false }).setView([6.45, 7.5], 8);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(mapRef.current);
      }
      const map = mapRef.current;
      const visible = new Set<string>();
      for (const order of rows) {
        if (order.pickup_lat == null || order.pickup_lng == null) continue;
        visible.add(order.id);
        const label = `Order #${order.order_no}`;
        const address = (order.pickup_address ?? "Pickup address").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
        const popup = `<strong>${label}</strong><br/>${address}<br/>${order.status.replaceAll("_", " ")}`;
        const marker = markers.current.get(order.id);
        if (marker) marker.setLatLng([order.pickup_lat, order.pickup_lng]).setPopupContent(popup);
        else markers.current.set(order.id, L.marker([order.pickup_lat, order.pickup_lng], { title: label }).addTo(map).bindPopup(popup));
      }
      for (const [id, marker] of markers.current) {
        if (!visible.has(id)) { map.removeLayer(marker); markers.current.delete(id); }
      }
      const points = rows.filter((r) => r.pickup_lat != null && r.pickup_lng != null);
      if (points.length === 1) map.setView([points[0].pickup_lat!, points[0].pickup_lng!], 15);
      else if (points.length > 1) map.fitBounds(points.map((p) => [p.pickup_lat!, p.pickup_lng!] as [number, number]), { padding: [28, 28], maxZoom: 15 });
      setTimeout(() => map.invalidateSize(), 0);
    })();
    return () => { cancelled = true; };
  }, [rows]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; markers.current.clear(); }, []);

  const mappable = rows.filter((r) => r.pickup_lat != null && r.pickup_lng != null).length;
  return <section className="card space-y-3 p-4" aria-label="Live pickup map">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="text-lg font-semibold">Live pickup map</h2><p className="text-sm text-ink-soft">Your assigned pickup jobs update automatically while this page is open.</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">Realtime</span></div>
    <div ref={element} className="w-full overflow-hidden rounded-xl border border-line" style={{ height: 300 }} role="application" aria-label="OpenStreetMap showing assigned pickup locations" />
    <p className="text-xs text-ink-mute" role="status">{loading ? "Loading assigned pickups…" : rows.length === 0 ? "No active pickups assigned to you." : `${rows.length} active pickup job(s) · ${mappable} mapped location(s)`}{lastUpdate ? ` · synced ${lastUpdate.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</p>
    {rows.some((r) => r.pickup_lat == null || r.pickup_lng == null) && <p className="text-xs text-amber-800">Some assigned orders have no pickup coordinates yet, so they cannot be pinned.</p>}
  </section>;
}
