import { requireRole } from "@/lib/roles";
import { AddCategory, RenameCategory } from "@/components/admin/CatalogForms";

export const metadata = { title: "Expense categories" };

export default async function CategoriesPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.from("expense_categories").select("id,name").order("name");
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Expense categories</h1>
        <p className="mt-1 text-sm text-ink-soft">The choices the secretary sees when recording an expense. Renaming changes old records too, so keep the meaning the same.</p></div>
      <AddCategory kind="expense" />
      <section className="card divide-y divide-line">
        {(data ?? []).map((c) => <div key={c.id} className="p-4"><RenameCategory id={c.id} name={c.name} /></div>)}
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-ink-soft">No categories yet.</p>}
      </section>
    </div>
  );
}
