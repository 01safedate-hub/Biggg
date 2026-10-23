import { requireRole } from "@/lib/roles";
import { CustomerMap } from "@/components/customers/CustomerMap";
import { BarList } from "@/components/admin/charts/BarList";
import type { MapPoint } from "@/lib/customers";

export const metadata = { title: "Customer map" };
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.rpc("customer_map");
  const points = (data ?? []) as unknown as MapPoint[];
  const byZone = new Map<string, number>();
  for (const p of points) byZone.set(p.zone ?? "Unknown area", (byZone.get(p.zone ?? "Unknown area") ?? 0) + 1);
  const rows = Array.from(byZone, ([label, value]) => ({ label, value, display: String(value) })).sort((a, b) => b.value - a.value).slice(0, 10);
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-soft">Where customers are, from the pickup address of their latest order. A customer who has never booked has no location yet. The map is OpenStreetMap, so it is free and needs no key.</p>
      {points.length === 0 ? <p className="card p-6 text-sm text-ink-soft">No customer locations yet. Pins appear as soon as someone books a pickup.</p> : <CustomerMap points={points} />}
      {rows.length > 0 && <section className="card space-y-3 p-5"><h2 className="text-lg font-semibold">Customers by area</h2><BarList rows={rows} /></section>}
    </div>
  );
}
