import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/roles";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/orders";
import { KIND_LABEL, LEDGER_LABEL, periodActive, type CustomView } from "@/lib/customs";
import { ConfirmBatch } from "@/components/customs/ConfirmBatch";
import { ArrivalCodeForm } from "@/components/orders/ArrivalCodeForm";

export const metadata = { title: "My custom" };
export const dynamic = "force-dynamic";

export default async function MyCustom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser(`/my-customs/${id}`);
  const { data, error } = await supabase.rpc("custom_view", { _custom: id });
  if (error || !data) notFound();
  const v = data as unknown as CustomView;
  const c = v.custom;
  const manager = v.role === "manager" || v.role === "staff";
  const mine = new Set(v.my_member_ids);
  const card = "card space-y-3 p-5";

  return (
    <main id="main" className="min-h-screen">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-3xl space-y-6 pb-10 pt-4 sm:pt-6">
        <Link href="/my-customs" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; My customs</Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{c.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">{KIND_LABEL[c.kind]} · {c.mode === "plan" ? `${c.period === "weekly" ? "Weekly" : "Monthly"} plan` : "One-time batches"} · {c.delivery === "deliver" ? "delivered to you" : "collect from the LaundryPoint hub"}
            {manager ? " · you are the manager" : v.members[0] ? ` · your tag ${v.members.map((m) => m.tag).join(", ")}` : ""}</p>
        </div>

        {!manager && <p className="rounded-md border border-line bg-white p-3 text-sm">Write your tag on the label of every item you hand in, so your clothes always come back to you. When a batch is counted, check your items below and confirm them.</p>}

        {manager && (
          <section className={card} aria-label="Balance">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">Prepaid balance</h2><p className={`text-3xl font-bold ${(v.balance_kobo ?? 0) <= 0 ? "text-red-700" : ""}`}>{naira(v.balance_kobo ?? 0)}</p></div>
            {c.mode === "plan" && <p className="text-sm">{periodActive(c) ? <>Current period: <strong>{c.period_start} to {c.period_end}</strong> ({naira(c.period_fee_kobo)} per {c.period === "weekly" ? "week" : "month"}).</> : <span className="text-red-700">No active plan period. Top up at least {naira(c.period_fee_kobo)} at the LaundryPoint desk to start the next one.</span>}</p>}
            <p className="text-xs text-ink-mute">Top up at the desk by cash, transfer or POS. Batches are only washed when the balance covers them.</p>
          </section>
        )}

        {c.mode === "plan" && v.usage.length > 0 && (
          <section className={card} aria-label="Plan usage">
            <h2 className="text-lg font-semibold">This period</h2>
            <ul className="space-y-2 text-sm">{v.usage.map((u) => <li key={u.category_id} className="flex justify-between"><span>{u.category}</span><span>{u.used} of {u.allowance ?? 0} included{u.allowance !== null && u.used > u.allowance ? ` · ${u.used - u.allowance} extra at ${naira(u.price_kobo)}` : ""}</span></li>)}</ul>
          </section>
        )}

        <section className={card} aria-label="Batches">
          <h2 className="text-lg font-semibold">Batches</h2>
          {v.batches.length === 0 && <p className="text-sm text-ink-soft">No batches yet.</p>}
          <ul className="space-y-4">
            {v.batches.map((b) => {
              const myLines = b.lines.filter((l) => mine.has(l.member_id));
              const myOpen = myLines.some((l) => !l.confirmed);
              return (
                <li key={b.order_id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>Batch #{b.order_no}</strong><span className="text-ink-soft">{STATUS_LABEL[b.status] ?? b.status} · {longDate(b.created_at)}</span></div>
                  <ul className="mt-2 divide-y divide-line text-sm">{b.lines.map((l, i) => <li key={i} className="flex justify-between py-1.5"><span>{manager ? <><span className="font-mono text-xs">{l.tag}</span> {l.member} · </> : null}{l.category}</span><span className="tabular-nums">{l.qty}{l.confirmed ? " ✓" : ""}</span></li>)}</ul>
                  <p className="mt-2 text-sm text-ink-soft">{b.pieces} piece{b.pieces === 1 ? "" : "s"}{manager && b.charge_kobo !== null ? ` · charge ${naira(b.charge_kobo)}${b.charged ? " (paid from the balance)" : ""}` : ""}</p>
                  {b.status === "counted" && manager && <div className="mt-3"><ConfirmBatch customId={id} order={b.order_id} label={`Confirm the whole batch (${naira(b.charge_kobo ?? 0)})`} /></div>}
                  {b.status === "counted" && !manager && myOpen && <div className="mt-3"><ConfirmBatch customId={id} order={b.order_id} label="My items are correct" /></div>}
                  {b.status === "counted" && !manager && myLines.length > 0 && !myOpen && <p className="mt-2 text-sm text-emerald-700">You confirmed your items.</p>}
                  {b.status === "counted" && <p className="mt-2 text-xs text-ink-mute">Something wrong? Tell the LaundryPoint desk before confirming; they can correct the count.</p>}
                  {b.status === "ready" && <p className="mt-2 text-sm font-medium">Ready for collection at the LaundryPoint hub.</p>}
                  {b.status === "out_for_delivery" && v.role === "manager" && <div className="mt-3 space-y-2"><p className="text-sm font-medium">On its way. When the clothes arrive, type the code the delivery agent shows you.</p><ArrivalCodeForm orderId={b.order_id} step="delivery" button="Clothes received" /></div>}
                </li>
              );
            })}
          </ul>
        </section>

        {manager && (v.ledger ?? []).length > 0 && (
          <section className={card} aria-label="Money history">
            <h2 className="text-lg font-semibold">Money history</h2>
            <ul className="divide-y divide-line text-sm">{(v.ledger ?? []).map((l, i) => <li key={i} className="flex justify-between gap-3 py-2"><span>{LEDGER_LABEL[l.kind] ?? l.kind}{l.note && l.kind !== "deposit" ? ` · ${l.note}` : ""} <span className="text-ink-mute">· {longDate(l.at)}</span></span><span className={`tabular-nums ${l.amount_kobo < 0 ? "text-red-700" : "text-emerald-700"}`}>{l.amount_kobo < 0 ? "− " : "+ "}{naira(Math.abs(l.amount_kobo))}</span></li>)}</ul>
          </section>
        )}

        {manager && (
          <section className={card} aria-label="Members">
            <h2 className="text-lg font-semibold">Members ({v.members.length})</h2>
            <ul className="divide-y divide-line text-sm">{v.members.map((m) => <li key={m.id} className="py-1.5"><span className="font-mono text-xs">{m.tag}</span> {m.name}</li>)}</ul>
            <p className="text-xs text-ink-mute">To add or remove members or change rates, speak to the LaundryPoint desk.</p>
          </section>
        )}
      </div>
    </main>
  );
}
