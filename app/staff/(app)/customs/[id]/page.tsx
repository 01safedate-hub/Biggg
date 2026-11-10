import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/orders";
import { KIND_LABEL, LEDGER_LABEL, MODE_LABEL, periodActive, type CustomView } from "@/lib/customs";
import { AdjustForm, DepositForm, MembersEditor, NewBatchButton, PeriodButton, RateCardEditor, SettingsCard, WatchersEditor } from "@/components/customs/StaffCustoms";

export const metadata = { title: "Custom" };
export const dynamic = "force-dynamic";

const SITE = (process.env.SITE_URL ?? "https://laundrypoint.app").replace(/\/$/, "");

export default async function CustomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, roles } = await requireRole(["cashier", "secretary", "admin", "super_admin"]);
  const { data, error } = await supabase.rpc("custom_view", { _custom: id });
  if (error || !data) notFound();
  const v = data as unknown as CustomView;
  const c = v.custom;
  const [{ data: cats }, { data: rates }, { data: points }] = await Promise.all([
    supabase.from("item_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("custom_rates").select("category_id,unit,price_kobo,allowance").eq("custom_id", id),
    supabase.from("money_points").select("id,name,kind").eq("active", true).neq("kind", "online").order("name"),
  ]);
  const balance = v.balance_kobo ?? 0;
  const active = c.mode === "one_time" || periodActive(c);
  const ready = (rates ?? []).length > 0 && v.members.length > 0;
  const open = v.batches.filter((b) => !["delivered", "closed", "cancelled"].includes(b.status));
  const card = "card space-y-3 p-5";

  return (
    <div className="space-y-6">
      <Link href="/staff/customs" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Customs</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{c.name} <span className="text-base font-normal text-ink-mute">{c.code}</span></h1>
        <p className="mt-1 text-sm text-ink-soft">{KIND_LABEL[c.kind]} · {MODE_LABEL[c.mode]}{c.period ? `, ${c.period} ${naira(c.period_fee_kobo)}` : ""} · {c.delivery === "deliver" ? `we deliver to ${c.address ?? "their address"}` : "they collect"} · manager {c.manager.name ?? "—"}{c.manager.phone ? ` (${c.manager.phone})` : ""}{c.status !== "active" ? ` · ${c.status.toUpperCase()}` : ""}</p>
      </div>

      <section className={card} aria-label="Balance">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Prepaid balance</h2>
          <p className={`text-3xl font-bold tracking-tight ${balance <= 0 ? "text-red-700" : ""}`}>{naira(balance)}</p>
        </div>
        {c.mode === "plan" && <p className="text-sm">{periodActive(c) ? <>Current period: <strong>{c.period_start} to {c.period_end}</strong></> : <span className="text-red-700">No active period. Start one before taking clothes in.</span>}</p>}
        {c.mode === "plan" && !periodActive(c) && c.status === "active" && <PeriodButton id={id} feeKobo={c.period_fee_kobo} balanceKobo={balance} />}
        <details><summary className="cursor-pointer text-sm font-medium">Record a deposit</summary><div className="mt-3"><DepositForm id={id} points={points ?? []} /></div></details>
        {roles.includes("super_admin") && <details><summary className="cursor-pointer text-sm font-medium">Adjust the balance (super admin)</summary><div className="mt-3"><AdjustForm id={id} /></div></details>}
      </section>

      <section className={card} aria-label="Batches">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Batches</h2>
          {c.status === "active" && ready && active && <NewBatchButton id={id} label={c.mode === "one_time" && v.batches.length ? "Repeat: new batch" : "New batch"} />}
        </div>
        {!ready && <p className="text-sm text-amber-800">Set the rate card and add at least one member before the first batch.</p>}
        <ul className="divide-y divide-line text-sm">
          {v.batches.map((b) => (
            <li key={b.order_id}><Link href={`/staff/customs/batch/${b.order_id}`} className="flex flex-wrap justify-between gap-2 py-2 hover:bg-canvas">
              <span><strong>#{b.order_no}</strong> · {STATUS_LABEL[b.status] ?? b.status}{b.status === "counted" ? (b.charged ? "" : " · waiting for confirmation") : ""}{b.shelves.length ? ` · shelf ${b.shelves.join(", ")}` : ""}</span>
              <span className="text-ink-soft">{b.pieces} pcs · {naira(b.charge_kobo ?? 0)} · {longDate(b.created_at)}</span>
            </Link></li>
          ))}
          {v.batches.length === 0 && <li className="py-2 text-ink-soft">No batches yet.</li>}
        </ul>
        {open.length > 0 && <p className="text-xs text-ink-mute">{open.length} batch{open.length === 1 ? "" : "es"} still in progress.</p>}
      </section>

      {c.mode === "plan" && v.usage.length > 0 && (
        <section className={card} aria-label="Plan usage">
          <h2 className="text-lg font-semibold">Usage this period</h2>
          <ul className="space-y-2 text-sm">{v.usage.map((u) => {
            const pct = u.allowance ? Math.min(100, Math.round((u.used / u.allowance) * 100)) : 100;
            return <li key={u.category_id}><div className="flex justify-between"><span>{u.category}</span><span className={u.allowance !== null && u.used > u.allowance ? "font-semibold text-amber-700" : ""}>{u.used} of {u.allowance ?? 0} {u.unit}{u.unit === "piece" ? "s" : ""}</span></div><div className="mt-1 h-2 rounded bg-slate-100"><div className={`h-2 rounded ${u.allowance !== null && u.used > u.allowance ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${pct}%` }} /></div></li>;
          })}</ul>
        </section>
      )}

      <section className={card} aria-label="Rate card">
        <h2 className="text-lg font-semibold">Rate card</h2>
        <p className="text-sm text-ink-soft">{c.mode === "plan" ? "For each category: how many are included per period, and the price for each extra one." : "For each category: the unit and the agreed price."} Changes apply to batches not yet confirmed.</p>
        <RateCardEditor id={id} mode={c.mode} categories={cats ?? []} rates={rates ?? []} />
      </section>

      <section className={card} aria-label="Members">
        <h2 className="text-lg font-semibold">Members ({v.members.length})</h2>
        <MembersEditor id={id} members={v.members} />
      </section>

      <section className={card} aria-label="Third parties">
        <h2 className="text-lg font-semibold">Send the view link to others</h2>
        <p className="text-sm text-ink-soft">For example a bursar or the business owner. They see the balance, usage and batches, but no member names.</p>
        <WatchersEditor id={id} watchers={v.watchers ?? []} link={c.share_token ? `${SITE}/customs/view/${c.share_token}` : null} />
      </section>

      <section className={card} aria-label="Money history">
        <h2 className="text-lg font-semibold">Money history</h2>
        <ul className="divide-y divide-line text-sm">
          {(v.ledger ?? []).map((l, i) => <li key={i} className="flex justify-between gap-3 py-2"><span>{LEDGER_LABEL[l.kind] ?? l.kind}{l.note ? ` · ${l.note}` : ""} <span className="text-ink-mute">· {longDate(l.at)}</span></span><span className={`tabular-nums ${l.amount_kobo < 0 ? "text-red-700" : "text-emerald-700"}`}>{l.amount_kobo < 0 ? "− " : "+ "}{naira(Math.abs(l.amount_kobo))}</span></li>)}
          {(v.ledger ?? []).length === 0 && <li className="py-2 text-ink-soft">No money yet.</li>}
        </ul>
      </section>

      <section className={card} aria-label="Settings">
        <h2 className="text-lg font-semibold">Settings</h2>
        <SettingsCard id={id} status={c.status} delivery={c.delivery} address={c.address} notes={c.notes} mode={c.mode} feeKobo={c.period_fee_kobo} />
      </section>
    </div>
  );
}
