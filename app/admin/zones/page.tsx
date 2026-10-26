import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { ServiceDepthForm, ZoneRow } from "@/components/admin/OpsForms";

export const metadata = { title: "Coverage zones" };
export const dynamic = "force-dynamic";

const rad = (d: number) => (d * Math.PI) / 180;
const km = (a: number, b: number, c: number, d: number) => {
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

export default async function ZonesPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const { q = "", show = "all" } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  const [{ data }, { data: hubRow }, { data: saRow }] = await Promise.all([
    supabase.from("zones").select("id,parent_id,kind,name,is_live,radius_m,centre_lat,centre_lng,sort_order,auto_live,coords_approx,postal_code,note,villages").order("sort_order").order("name"),
    supabase.from("settings").select("value").eq("key", "hub").maybeSingle(),
    supabase.from("settings").select("value").eq("key", "service_area").maybeSingle(),
  ]);
  const all = data ?? [];
  const hub = (hubRow?.value ?? {}) as { lat?: number; lng?: number };
  const sa = (saRow?.value ?? {}) as { reference_name?: string; reference_lat?: number; reference_lng?: number; multiplier?: number; depth_km?: number | null };
  const name = new Map(all.map((z) => [z.id, z.name]));
  const live = all.filter((z) => z.is_live).length;
  const unplaced = all.filter((z) => z.kind === "area" && z.centre_lat == null).length;
  const term = q.trim().toLowerCase();
  const distOf = (z: (typeof all)[number]) => (hub.lat != null && hub.lng != null && z.centre_lat != null && z.centre_lng != null ? km(hub.lat, hub.lng, z.centre_lat, z.centre_lng) : null);
  const rows = all
    .filter((z) => z.kind !== "state")
    .filter((z) => !term || z.name.toLowerCase().includes(term) || (z.parent_id && (name.get(z.parent_id) ?? "").toLowerCase().includes(term)) || (z.postal_code ?? "").includes(term))
    .filter((z) => show === "live" ? z.is_live : show === "placed" ? z.centre_lat != null && !z.is_live : show === "unplaced" ? z.kind === "area" && z.centre_lat == null : true)
    .sort((a, b) => Number(b.is_live) - Number(a.is_live) || (distOf(a) ?? 1e9) - (distOf(b) ?? 1e9) || a.name.localeCompare(b.name))
    .slice(0, 150);
  const tab = (key: string, label: string) => <Link key={key} href={`/admin/zones?show=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full border px-3 py-1 text-sm ${show === key ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"}`}>{label}</Link>;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Coverage zones</h1>
        <p className="mt-1 text-sm text-ink-soft">{live} switched on, {all.length} places saved from the Anambra list, {unplaced} still without a map point. A customer is served if their location is inside the circle of a zone that is on. Set the centre from Google Maps (right-click a spot, copy the numbers), then choose a radius.</p></div>
      {sa.reference_lat != null && sa.reference_lng != null && <ServiceDepthForm name={sa.reference_name ?? "Amawbia"} lat={sa.reference_lat} lng={sa.reference_lng} multiplier={sa.multiplier ?? 1} depthKm={sa.depth_km ?? null} />}
      <form className="flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="show" value={show} />
        <label className="min-w-0 flex-1 text-sm font-medium">Find a place, local government or postal code<input name="q" defaultValue={q} className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm" /></label>
        <button className="btn-secondary">Search</button>
      </form>
      <div className="flex flex-wrap gap-2">{tab("all", "All")}{tab("live", "Switched on")}{tab("placed", "Placed, off")}{tab("unplaced", "No map point")}</div>
      <section className="card divide-y divide-line">
        {rows.map((z) => <ZoneRow key={z.id} z={{ ...z, villages: z.villages ?? [] }} parent={z.parent_id ? name.get(z.parent_id) ?? null : null} km={distOf(z)} />)}
        {rows.length === 0 && <p className="p-5 text-sm text-ink-soft">Nothing matches.</p>}
      </section>
      {rows.length === 150 && <p className="text-sm text-ink-soft">Showing the first 150. Use the search to narrow the list.</p>}
    </div>
  );
}
