import { requireRole } from "@/lib/roles";
import { ZoneRow } from "@/components/admin/OpsForms";

export const metadata = { title: "Coverage zones" };

export default async function ZonesPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.from("zones").select("id,parent_id,kind,name,is_live,radius_m,centre_lat,centre_lng,sort_order").order("sort_order").order("name");
  const name = new Map((data ?? []).map((z) => [z.id, z.name]));
  const live = (data ?? []).filter((z) => z.is_live).length;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Coverage zones</h1>
        <p className="mt-1 text-sm text-ink-soft">{live} zone{live === 1 ? "" : "s"} switched on. A customer is served if their location is inside the circle of a zone that is on. Set the centre from Google Maps (right-click a spot, copy the numbers), then choose a radius.</p></div>
      <section className="card divide-y divide-line">
        {(data ?? []).map((z) => <ZoneRow key={z.id} z={z} parent={z.parent_id ? name.get(z.parent_id) ?? null : null} />)}
        {(data ?? []).length === 0 && <p className="p-5 text-sm text-ink-soft">No zones yet.</p>}
      </section>
    </div>
  );
}
