import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { ProofLinks } from "@/components/admin/ProofLinks";
import type { Proof } from "@/lib/proofs";

export const metadata = { title: "Spending" };

type Item = {
  id: string; label: string; category: string | null; spent_on: string; status: "approved" | "voided";
  recorded_by: string; approved_by: string; amount_kobo: number | null; vendor: string | null; void_reason: string | null;
  capital_setback_pct: number | null; target_setback_pct: number | null;
  proofs: { id: string; kind: string; path: string }[];
};

export default async function Spending() {
  const { supabase } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent"]);
  const { data } = await (supabase.rpc as unknown as (fn: string, args: object) => Promise<{ data: unknown }>)("expense_feed", { _limit: 50 });
  const items = (Array.isArray(data) ? data : []) as Item[];

  const paths = items.flatMap((i) => i.proofs.map((p) => p.path));
  const { data: signed } = paths.length ? await supabase.storage.from("expense-evidence").createSignedUrls(paths, 600) : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Spending</h1>
        <p className="mt-1 text-sm text-ink-soft">Every business expense, after the super admin has approved it, with the proof. Nothing is spent without a receipt or bank record.</p>
      </div>
      {items.length === 0 ? <p className="card p-6 text-sm text-ink-soft">No approved expenses yet.</p> : (
        <ul className="space-y-3">
          {items.map((i) => {
            const proofs: Proof[] = i.proofs.map((p) => ({ id: p.id, kind: p.kind, url: urlByPath.get(p.path) ?? null }));
            const voided = i.status === "voided";
            return (
              <li key={i.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className={`font-semibold ${voided ? "line-through text-ink-mute" : ""}`}>{i.label}</p>
                    <p className="text-sm text-ink-soft">{i.category ?? "Uncategorised"} · {longDate(i.spent_on)}{i.vendor ? ` · ${i.vendor}` : ""}</p>
                  </div>
                  {i.amount_kobo !== null && <p className={`text-lg font-bold ${voided ? "text-ink-mute line-through" : ""}`}>{naira(i.amount_kobo)}</p>}
                </div>
                {voided ? (
                  <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">Cancelled: {i.void_reason ?? "no reason given"}</p>
                ) : (
                  <p className="text-sm text-ink-soft">
                    {i.target_setback_pct !== null && <>Took <strong>{i.target_setback_pct}%</strong> off this month&apos;s target. </>}
                    {i.capital_setback_pct !== null && <>Equal to <strong>{i.capital_setback_pct}%</strong> of start-up costs.</>}
                  </p>
                )}
                <ProofLinks proofs={proofs} />
                <p className="text-xs text-ink-mute">Recorded by {i.recorded_by} · Approved by {i.approved_by}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
