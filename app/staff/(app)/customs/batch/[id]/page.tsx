import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import type { CustomView } from "@/lib/customs";
import { BatchActions, BatchEntry } from "@/components/customs/StaffCustoms";

export const metadata = { title: "Custom batch" };
export const dynamic = "force-dynamic";

export default async function CustomBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["cashier", "secretary", "admin", "super_admin"]);
  const { data: o } = await supabase.from("orders").select("id,order_no,status,custom_id,notes,created_at").eq("id", id).eq("source", "custom").maybeSingle();
  if (!o?.custom_id) notFound();
  const [{ data }, { data: rates }] = await Promise.all([
    supabase.rpc("custom_view", { _custom: o.custom_id }),
    supabase.from("custom_rates").select("category_id,unit,item_categories(name,sort_order)").eq("custom_id", o.custom_id),
  ]);
  if (!data) notFound();
  const v = data as unknown as CustomView;
  const b = v.batches.find((x) => x.order_id === id);
  if (!b) notFound();
  const cats = ((rates ?? []) as unknown as { category_id: string; unit: string; item_categories: { name: string; sort_order: number } | null }[])
    .map((r) => ({ id: r.category_id, name: r.item_categories?.name ?? "Category", unit: r.unit, sort: r.item_categories?.sort_order ?? 0 }))
    .sort((a, b2) => a.sort - b2.sort || a.name.localeCompare(b2.name));
  // Members who have lines in this batch stay listed even if they were removed from the custom later.
  const members = [...v.members.map((m) => ({ id: m.id, tag: m.tag, name: m.name }))];
  for (const l of b.lines) if (!members.some((m) => m.id === l.member_id)) members.push({ id: l.member_id, tag: l.tag, name: l.member });
  const editable = o.status === "agent_arrived";
  const confirmedMembers = new Set(b.lines.filter((l) => l.confirmed).map((l) => l.member_id));
  const withItems = new Set(b.lines.map((l) => l.member_id));

  return (
    <div className="space-y-6">
      <Link href={`/staff/customs/${o.custom_id}`} className="text-sm font-medium text-ink-soft hover:text-ink">&larr; {v.custom.name}</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Batch #{o.order_no}</h1>
        <p className="mt-1 text-sm text-ink-soft">{STATUS_LABEL[o.status] ?? o.status}{b.shelves.length ? ` · shelf ${b.shelves.join(", ")}` : ""} · <Link className="underline" href={`/staff/orders/${id}`}>order details</Link></p>
      </div>

      {o.status === "counted" && (
        <section className="card space-y-2 border-amber-300 p-5 text-sm">
          <h2 className="text-lg font-semibold">Waiting for confirmation</h2>
          <p>Charge: <strong>{naira(b.charge_kobo ?? 0)}</strong>. Balance: <strong className={(v.balance_kobo ?? 0) < (b.charge_kobo ?? 0) ? "text-red-700" : ""}>{naira(v.balance_kobo ?? 0)}</strong>.</p>
          <p>The manager ({v.custom.manager.name ?? "manager"}) can confirm the whole batch, or every member with items confirms their own: {confirmedMembers.size} of {withItems.size} confirmed.</p>
          {(v.balance_kobo ?? 0) < (b.charge_kobo ?? 0) && <p className="text-red-700">The balance does not cover this batch. <Link className="underline" href={`/staff/customs/${o.custom_id}`}>Record a deposit</Link>; it goes through by itself once everyone has confirmed.</p>}
        </section>
      )}

      <section className="card space-y-3 p-5" aria-label="Count">
        <h2 className="text-lg font-semibold">{editable ? "Count each member's clothes" : "Count"}</h2>
        {editable && <p className="text-sm text-ink-soft">Check the tag on each item ({v.members[0]?.tag ?? "TAG-01"}) and enter the number in the right box. Save as you go; send it for confirmation when done.</p>}
        <BatchEntry order={id} members={members} categories={cats} lines={b.lines.map((l) => ({ member_id: l.member_id, category_id: l.category_id, qty: l.qty }))} editable={editable} />
      </section>

      {(b.breakdown ?? []).length > 0 && (
        <section className="card p-5" aria-label="Charge">
          <h2 className="text-lg font-semibold">Charge</h2>
          <ul className="mt-2 divide-y divide-line text-sm">{(b.breakdown ?? []).map((x, i) => <li key={i} className="flex justify-between py-1.5"><span>{x.category}: {x.qty}{x.covered ? ` (${x.covered} included in the plan)` : ""}{x.charged ? ` · ${x.charged} × ${naira(x.price_kobo)}` : ""}</span><span className="tabular-nums">{naira(x.charge_kobo)}</span></li>)}</ul>
          <p className="mt-2 text-right font-semibold">{naira(b.charge_kobo ?? 0)}{b.charged ? " · taken from the balance" : ""}</p>
        </section>
      )}

      <BatchActions order={id} status={o.status} charged={b.charged} />
      {o.status === "received" || o.status === "in_house" ? <p className="text-sm text-ink-soft">Washing is tracked in the <Link className="underline" href="/staff/hub">wash queue</Link>. Mark it ready there and choose the shelf.</p> : null}
    </div>
  );
}
