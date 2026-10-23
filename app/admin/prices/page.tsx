import { requireRole } from "@/lib/roles";
import { AddCategory, AddItem, ItemRow } from "@/components/admin/CatalogForms";

export const metadata = { title: "Price list" };

export default async function PricesPage() {
  const { supabase } = await requireRole(["super_admin", "admin"]);
  const [{ data: cats }, { data: items }] = await Promise.all([
    supabase.from("item_categories").select("id,name,sort_order,active").order("sort_order").order("name"),
    supabase.from("items").select("id,category_id,name,price_kobo,active,sort_order").order("sort_order").order("name"),
  ]);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Price list</h1>
        <p className="mt-1 text-sm text-ink-soft">What customers see and pay per item. A price change applies to new orders only. Take an item off sale instead of deleting it.</p></div>
      <AddCategory kind="item" />
      {(cats ?? []).map((c) => (
        <section key={c.id} className="card p-5">
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <ul className="mt-2 divide-y divide-line">
            {(items ?? []).filter((i) => i.category_id === c.id).map((i) => <ItemRow key={i.id} id={i.id} name={i.name} priceKobo={Number(i.price_kobo)} active={!!i.active} />)}
          </ul>
          <AddItem categoryId={c.id} />
        </section>
      ))}
    </div>
  );
}
