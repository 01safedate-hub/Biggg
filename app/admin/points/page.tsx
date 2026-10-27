import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { AddMoneyPoint, PointToggle } from "@/components/admin/CatalogForms";

export const metadata = { title: "Money points" };
const KIND: Record<string, string> = { cash: "Cash drawer", pos: "POS", bank: "Bank account", online: "Online" };

export default async function PointsPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.from("money_points").select("id,name,kind,bank_name,account_name,account_number,opening_balance_kobo,active").order("active", { ascending: false }).order("name");
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Money points</h1>
        <p className="mt-1 text-sm text-ink-soft">Manage money locations and online payment availability. For customer checkout, add separate Online entries named Paystack and Flutterwave; switching each entry off hides that provider button. Turn entries off instead of deleting them so their history stays.</p></div>
      <AddMoneyPoint />
      <section className="card divide-y divide-line">
        {(data ?? []).map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">{m.name} {!m.active && <span className="ml-1 text-xs text-ink-mute">(off)</span>}</p>
              <p className="text-sm text-ink-soft">{KIND[m.kind] ?? m.kind}{m.bank_name ? ` · ${m.bank_name}` : ""}{m.account_number ? ` · ${m.account_number}` : ""} · opened with {naira(m.opening_balance_kobo ?? 0)}</p></div>
            <PointToggle id={m.id} active={!!m.active} />
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-ink-soft">No money points yet.</p>}
      </section>
    </div>
  );
}
