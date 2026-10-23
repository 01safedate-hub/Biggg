import { ExpenseForm } from "@/components/admin/ExpenseForm";
import { ProofLinks } from "@/components/admin/ProofLinks";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { requireRole } from "@/lib/roles";
import { longDate } from "@/lib/money";
import { naira } from "@/lib/format";
import { loadProofs } from "@/lib/proofs";

export const metadata = { title: "Record expense" };

export default async function StaffExpenses() {
  const { supabase, user, roles } = await requireRole(["secretary", "super_admin"]);
  const [{ data: cats }, { data: pts }, { data: mine }] = await Promise.all([
    supabase.from("expense_categories").select("id,name").order("name"),
    supabase.from("money_points").select("id,name").eq("active", true).order("name"),
    supabase.from("expenses").select("*").eq("entered_by", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const list = mine ?? [];
  const proofs = await loadProofs(supabase, "expense_id", list.map((r) => r.id));
  const catOf = new Map((cats ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Record an expense</h1>
        <p className="mt-1 text-sm text-ink-soft">Every expense needs a receipt or bank debit screenshot. It counts after the super admin approves it.</p>
      </div>
      <ExpenseForm categories={cats ?? []} points={pts ?? []} autoApproved={roles.includes("super_admin")} />
      <section aria-label="My expenses" className="space-y-3">
        <h2 className="text-lg font-semibold">What I recorded</h2>
        {list.length === 0 && <p className="text-sm text-ink-mute">Nothing yet.</p>}
        {list.map((r) => (
          <article key={r.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold">{r.label}</p><p className="text-sm text-ink-mute">{catOf.get(r.category_id ?? "") ?? "No category"} &middot; {longDate(r.spent_on)}</p></div>
              <div className="text-right"><p className="font-bold">{naira(r.amount_kobo)}</p><StatusBadge status={r.status} /></div>
            </div>
            <div className="mt-3"><ProofLinks proofs={proofs.get(r.id)} /></div>
            {r.decision_note && <p className="mt-2 text-sm text-ink-soft">Note from super admin: {r.decision_note}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
