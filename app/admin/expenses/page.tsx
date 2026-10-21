import Link from "next/link";
import { DecisionButtons } from "@/components/admin/DecisionButtons";
import { ExpenseForm } from "@/components/admin/ExpenseForm";
import { ProofLinks } from "@/components/admin/ProofLinks";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { requireRole } from "@/lib/roles";
import { longDate } from "@/lib/money";
import { naira } from "@/lib/format";
import { loadProofs } from "@/lib/proofs";

export const metadata = { title: "Expenses" };

const TABS = [["pending", "Awaiting approval"], ["approved", "Approved"], ["rejected", "Rejected"], ["voided", "Voided"], ["all", "All"]] as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = TABS.some(([k]) => k === raw) ? raw! : "pending";
  const { supabase } = await requireRole(["super_admin"]);

  let q = supabase.from("expenses").select("*").order("spent_on", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const [{ data: rows }, { data: cats }, { data: pts }] = await Promise.all([
    q, supabase.from("expense_categories").select("id,name").order("name"), supabase.from("money_points").select("id,name").eq("active", true).order("name"),
  ]);
  const list = rows ?? [];
  const people = list.flatMap((r) => [r.entered_by, r.decided_by]).filter((x): x is string => !!x);
  const [proofs, { data: profs }] = await Promise.all([
    loadProofs(supabase, "expense_id", list.map((r) => r.id)),
    people.length ? supabase.from("profiles").select("id,full_name").in("id", people) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const nameOf = new Map((profs ?? []).map((p) => [p.id, p.full_name || "Unnamed"]));
  const catOf = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const ptOf = new Map((pts ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
        <p className="mt-1 text-sm text-ink-soft">An expense counts only after you approve it. Every one carries its proof.</p>
      </div>
      <ExpenseForm categories={cats ?? []} points={pts ?? []} autoApproved />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/expenses?status=${k}`} aria-current={status === k ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${status === k ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      <section aria-label="Expenses" className="space-y-3">
        {list.length === 0 && <p className="text-sm text-ink-mute">Nothing here.</p>}
        {list.map((r) => (
          <article key={r.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{r.label}</p>
                <p className="text-sm text-ink-mute">
                  {catOf.get(r.category_id ?? "") ?? "No category"} &middot; from {ptOf.get(r.money_point_id ?? "") ?? "unknown"} &middot; {longDate(r.spent_on)}
                  {r.vendor ? ` · paid to ${r.vendor}` : ""}
                </p>
                <p className="text-sm text-ink-mute">Recorded by {nameOf.get(r.entered_by ?? "") ?? "unknown"}</p>
              </div>
              <div className="text-right"><p className="font-bold">{naira(r.amount_kobo)}</p><StatusBadge status={r.status} /></div>
            </div>
            <div className="mt-3"><ProofLinks proofs={proofs.get(r.id)} /></div>
            {r.decision_note && <p className="mt-2 text-sm text-ink-soft">Decision note: {r.decision_note}</p>}
            {r.status === "voided" && <p className="mt-2 text-sm text-ink-soft">Voided: {r.void_reason}</p>}
            <DecisionButtons id={r.id} kind="expense" status={r.status} />
          </article>
        ))}
      </section>
    </div>
  );
}
