import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/orders";
import { KIND_LABEL, LEDGER_LABEL, type CustomUsage } from "@/lib/customs";

export const metadata = { title: "Laundry account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Pub = {
  name: string; kind: string; mode: string; status: string; period: string | null; period_start: string | null; period_end: string | null; period_fee_kobo: number;
  balance_kobo: number; usage: CustomUsage[]; members: number;
  batches: { order_no: number; status: string; created_at: string; pieces: number; charge_kobo: number; charged: boolean }[];
  ledger: { kind: string; amount_kobo: number; at: string }[];
};

export default async function CustomPublic({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("custom_public", { _token: token });
  if (error || !data) notFound();
  const p = data as unknown as Pub;
  const card = "card space-y-3 p-5";
  return (
    <main id="main" className="container-page mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <p className="text-sm font-semibold text-brand-dark">LaundryPoint</p>
        <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">{KIND_LABEL[p.kind]} · {p.mode === "plan" ? `${p.period === "weekly" ? "Weekly" : "Monthly"} plan, ${naira(p.period_fee_kobo)}` : "One-time batches"} · {p.members} member{p.members === 1 ? "" : "s"}{p.status !== "active" ? ` · ${p.status}` : ""}</p>
      </div>
      <section className={card}><div className="flex items-baseline justify-between"><h2 className="text-lg font-semibold">Prepaid balance</h2><p className="text-3xl font-bold">{naira(p.balance_kobo)}</p></div>
        {p.mode === "plan" && p.period_start && <p className="text-sm text-ink-soft">Plan period {p.period_start} to {p.period_end}.</p>}</section>
      {p.mode === "plan" && p.usage.length > 0 && <section className={card}><h2 className="text-lg font-semibold">Usage this period</h2><ul className="space-y-1 text-sm">{p.usage.map((u) => <li key={u.category_id} className="flex justify-between"><span>{u.category}</span><span>{u.used} of {u.allowance ?? 0}</span></li>)}</ul></section>}
      <section className={card}><h2 className="text-lg font-semibold">Batches</h2>
        <ul className="divide-y divide-line text-sm">{p.batches.map((b) => <li key={b.order_no} className="flex justify-between gap-2 py-2"><span>#{b.order_no} · {STATUS_LABEL[b.status] ?? b.status} · {longDate(b.created_at)}</span><span>{b.pieces} pcs · {naira(b.charge_kobo)}</span></li>)}
          {p.batches.length === 0 && <li className="py-2 text-ink-soft">No batches yet.</li>}</ul></section>
      <section className={card}><h2 className="text-lg font-semibold">Money history</h2>
        <ul className="divide-y divide-line text-sm">{p.ledger.map((l, i) => <li key={i} className="flex justify-between py-2"><span>{LEDGER_LABEL[l.kind] ?? l.kind} · {longDate(l.at)}</span><span className={l.amount_kobo < 0 ? "text-red-700" : "text-emerald-700"}>{l.amount_kobo < 0 ? "− " : "+ "}{naira(Math.abs(l.amount_kobo))}</span></li>)}</ul></section>
      <p className="text-xs text-ink-mute">Read-only view shared by LaundryPoint. Member names are not shown.</p>
    </main>
  );
}
