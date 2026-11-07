import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import Link from "next/link";
import { StudentIdDecision } from "@/components/ops/StudentIdReview";

export const metadata = { title: "Student IDs" };
export const dynamic = "force-dynamic";

type Row = { id: string; customer_id: string; storage_path: string; school_name: string; status: string; created_at: string; reject_reason: string | null };

export default async function StudentIdsPage() {
  const { supabase, roles } = await requireRole(["secretary", "admin", "super_admin"]);
  const isAdmin = roles.some((r) => r === "admin" || r === "super_admin");
  const { data: pendingRows } = await supabase.from("student_verifications")
    .select("id,customer_id,storage_path,school_name,status,created_at,reject_reason").eq("status", "pending").order("created_at");
  const { data: recentRows } = await supabase.from("student_verifications")
    .select("id,customer_id,storage_path,school_name,status,created_at,reject_reason").neq("status", "pending").order("reviewed_at", { ascending: false }).limit(15);
  const pending = (pendingRows ?? []) as Row[];
  const recent = (recentRows ?? []) as Row[];
  const ids = Array.from(new Set([...pending, ...recent].map((r) => r.customer_id)));
  const [{ data: people }, { data: waiting }, { data: refunds }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id,full_name,phone,email").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("subscriptions").select("customer_id,term_amount_kobo,billing_period,plans(name)").eq("status", "pending_review").in("customer_id", ids) : Promise.resolve({ data: [] }),
    isAdmin ? supabase.from("payments").select("id,customer_id,amount_kobo,mode,note,created_at").eq("kind", "refund").eq("status", "pending").like("reference", "LP-REFUND-%").order("created_at") : Promise.resolve({ data: [] }),
  ]);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const plan = new Map((waiting ?? []).map((s) => [s.customer_id, s]));
  const refundPeopleIds = (refunds ?? []).map((r) => r.customer_id).filter((x): x is string => !!x && !person.has(x));
  if (refundPeopleIds.length) {
    const { data: more } = await supabase.from("profiles").select("id,full_name,phone,email").in("id", refundPeopleIds);
    for (const p of more ?? []) person.set(p.id, p);
  }
  const links = new Map<string, string>();
  await Promise.all(pending.map(async (r) => {
    const { data } = await supabase.storage.from("student-ids").createSignedUrl(r.storage_path, 60 * 30);
    if (data?.signedUrl) links.set(r.id, data.signedUrl);
  }));
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Student IDs</h1>
        <p className="mt-1 text-sm text-ink-soft">Students pay first, then their plan waits here. Approving starts the plan today. Rejecting cancels it and lists a full refund for an admin to pay back.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Waiting for review ({pending.length})</h2>
        {pending.length === 0 && <p className="card p-5 text-sm text-ink-soft">Nothing to review.</p>}
        {pending.map((r) => {
          const p = person.get(r.customer_id);
          const s = plan.get(r.customer_id);
          const sPlan = s ? (Array.isArray(s.plans) ? s.plans[0] : s.plans) : null;
          const link = links.get(r.id);
          const isPdf = /\.pdf$/i.test(r.storage_path);
          return (
            <article key={r.id} className="card grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-1 text-sm">
                <p className="text-base font-semibold">{p?.full_name ?? "Customer"}</p>
                <p className="text-ink-soft">{p?.phone ?? "No phone"}{p?.email ? ` · ${p.email}` : ""}</p>
                <p><strong>School:</strong> {r.school_name}</p>
                <p><strong>Uploaded:</strong> {when(r.created_at)}</p>
                <p><strong>Plan:</strong> {sPlan?.name ? `${sPlan.name}, paid ${naira(Number(s?.term_amount_kobo ?? 0))}` : "Not paid yet (ID uploaded at checkout)"}</p>
                <div className="pt-3"><StudentIdDecision id={r.id} /></div>
              </div>
              <div>
                {link ? (isPdf
                  ? <a href={link} target="_blank" rel="noreferrer" className="btn-secondary inline-block">Open the ID (PDF)</a>
                  : <a href={link} target="_blank" rel="noreferrer"><img src={link} alt={`Student ID for ${p?.full_name ?? "customer"}`} className="max-h-80 w-full rounded-lg border border-line object-contain" /></a>)
                  : <p className="text-sm text-red-700">The file could not be loaded.</p>}
              </div>
            </article>
          );
        })}
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Student refunds to send ({(refunds ?? []).length})</h2>
          {(refunds ?? []).length === 0 ? <p className="card p-5 text-sm text-ink-soft">No refunds waiting.</p> : (
            <div className="card divide-y divide-line">
              {(refunds ?? []).map((f) => {
                const p = f.customer_id ? person.get(f.customer_id) : undefined;
                return (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div><p className="font-medium">{p?.full_name ?? "Customer"} · {naira(Number(f.amount_kobo))}</p><p className="text-ink-soft">{p?.phone ?? ""} · paid by {f.mode} · {f.note}</p></div>
                    <Link href="/admin/payments" className="btn-secondary">Pay in Payments</Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recently reviewed</h2>
        <div className="card divide-y divide-line">
          {recent.length === 0 && <p className="p-5 text-sm text-ink-soft">None yet.</p>}
          {recent.map((r) => <div key={r.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm"><span>{person.get(r.customer_id)?.full_name ?? "Customer"} · {r.school_name}</span><span className={r.status === "approved" ? "text-emerald-700" : "text-red-700"}>{r.status === "approved" ? "Approved" : `Rejected: ${r.reject_reason ?? ""}`}</span></div>)}
        </div>
      </section>
    </div>
  );
}
