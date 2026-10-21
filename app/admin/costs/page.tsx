import { CapitalForm } from "@/components/admin/CapitalForm";
import { DecisionButtons } from "@/components/admin/DecisionButtons";
import { ProofLinks } from "@/components/admin/ProofLinks";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { requireRole } from "@/lib/roles";
import { longDate } from "@/lib/money";
import { naira } from "@/lib/format";
import { loadProofs } from "@/lib/proofs";

export const metadata = { title: "Start-up costs" };

export default async function CostsPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data: rows } = await supabase.from("capital_entries").select("*").order("entered_on", { ascending: false }).order("created_at", { ascending: false });
  const list = rows ?? [];
  const proofs = await loadProofs(supabase, "capital_id", list.map((r) => r.id));
  const total = list.filter((r) => r.status === "approved" && r.kind === "capital").reduce((s, r) => s + r.amount_kobo, 0);
  const rent = list.filter((r) => r.status === "approved" && r.kind === "rent").reduce((s, r) => s + r.amount_kobo, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Start-up costs</h1>
        <p className="mt-1 text-sm text-ink-soft">Everything spent to start the business. Each cost needs proof, and recovery is measured against the total.</p>
        <p className="mt-3 text-lg font-semibold">Total: {naira(total)}{rent > 0 && <span className="ml-3 text-sm font-medium text-ink-soft">plus yearly rent {naira(rent)}</span>}</p>
      </div>
      <CapitalForm />
      <section aria-label="Recorded costs" className="space-y-3">
        <h2 className="text-lg font-semibold">Recorded costs</h2>
        {list.length === 0 && <p className="text-sm text-ink-mute">Nothing recorded yet.</p>}
        {list.map((r) => (
          <article key={r.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{r.label}</p>
                <p className="text-sm text-ink-mute">{r.kind === "rent" ? "Yearly rent" : "Start-up cost"} &middot; {longDate(r.entered_on)}</p>
              </div>
              <div className="text-right"><p className="font-bold">{naira(r.amount_kobo)}</p><StatusBadge status={r.status} /></div>
            </div>
            <div className="mt-3"><ProofLinks proofs={proofs.get(r.id)} /></div>
            {r.status === "voided" && <p className="mt-2 text-sm text-ink-soft">Voided: {r.void_reason}</p>}
            <DecisionButtons id={r.id} kind="capital" status={r.status} />
          </article>
        ))}
      </section>
    </div>
  );
}
