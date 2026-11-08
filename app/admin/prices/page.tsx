import { requireRole } from "@/lib/roles";
import { AddCategory, AddItem, IronOnlyForm, ItemRow } from "@/components/admin/CatalogForms";
import { ListSearch } from "@/components/admin/ListSearch";

export const metadata = { title: "Price list" };

export default async function PricesPage() {
  const { supabase, roles } = await requireRole(["super_admin", "admin"]);
  const [{ data: cats }, { data: items }, { data: svc }, { data: ironCfg }] = await Promise.all([
    supabase.from("item_categories").select("id,name,sort_order,active").order("sort_order").order("name"),
    supabase.from("items").select("id,category_id,name,price_kobo,active,iron_only_allowed,sort_order").order("sort_order").order("name"),
    supabase.rpc("item_service_prices"),
    supabase.from("settings").select("value").eq("key", "iron_only").maybeSingle(),
  ]);
  const ironById = new Map((svc ?? []).map((r) => [r.item_id, r.iron_only_kobo == null ? null : Number(r.iron_only_kobo)]));
  const cfg = (ironCfg?.value ?? {}) as { pct_of_dry_clean?: number; min_kobo?: number };
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Price list</h1>
        <p className="mt-1 text-sm text-ink-soft">What customers see and pay per item for the full service (dry clean: wash and iron). Iron only is worked out from it. A price change applies to new orders only. Take an item off sale instead of deleting it.</p></div>
      {roles.includes("super_admin") ? <IronOnlyForm pct={Number(cfg.pct_of_dry_clean ?? 40)} minKobo={Number(cfg.min_kobo ?? 20000)} /> : <p className="card p-4 text-sm text-ink-soft">Iron only is {Number(cfg.pct_of_dry_clean ?? 40)}% of the dry clean price, with a minimum of ₦{Number(cfg.min_kobo ?? 20000) / 100}. Only the super admin can change this.</p>}
      <AddCategory kind="item" />
      <ListSearch label="Search the price list" placeholder="Search items or categories, e.g. shirt, duvet, uniforms">
      {(cats ?? []).map((c) => (
        <section key={c.id} data-search-group={c.name} className="card p-5">
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <ul className="mt-2 divide-y divide-line">
            {(items ?? []).filter((i) => i.category_id === c.id).map((i) => <ItemRow key={i.id} id={i.id} name={i.name} priceKobo={Number(i.price_kobo)} ironKobo={ironById.get(i.id) ?? null} ironAllowed={!!i.iron_only_allowed} active={!!i.active} searchText={`${i.name} ${c.name} ${(Number(i.price_kobo) / 100).toFixed(0)} ${i.active ? "" : "off sale"}`} />)}
          </ul>
          <AddItem categoryId={c.id} />
        </section>
      ))}
      </ListSearch>
    </div>
  );
}
