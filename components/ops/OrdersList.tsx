import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { STATUS_LABEL } from "@/lib/orders";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";

const FILTERS = ["awaiting_dispatch", "agent_assigned", "agent_arrived", "counted", "count_confirmed", "received", "in_house", "ready", "out_for_delivery", "failed_delivery", "delivered", "cancelled"];
const NONE = "00000000-0000-0000-0000-000000000000";

/** Searchable order list: order number, shelf (e.g. C4), or customer name / phone / email. */
export async function OrdersList({ supabase, basePath, status, term }: { supabase: SupabaseClient<Database>; basePath: string; status?: string; term?: string }) {
  let q = supabase.from("orders").select("id,order_no,status,source,created_at,items_total_kobo,pickup_agent_id,customer_id").order("created_at", { ascending: false }).limit(100);
  if (status && /^[a-z_]+$/.test(status)) q = q.eq("status", status as never);
  const needle = (term ?? "").trim().slice(0, 60);
  let shelfSearch: string | null = null;
  if (needle) {
    const compact = needle.replace(/\s+/g, "").toUpperCase();
    if (/^#?\d{1,9}$/.test(needle)) q = q.eq("order_no", Number(needle.replace("#", "")));
    else if (/^[A-G][1-9]$/.test(compact)) {
      shelfSearch = compact;
      const { data: on } = await supabase.from("order_shelves").select("order_id").eq("shelf", compact).is("released_at", null);
      q = q.in("id", (on ?? []).map((x) => x.order_id).concat([NONE]));
    } else {
      const safe = needle.replace(/[%,()_\\]/g, " ").trim();
      const { data: hits } = await supabase.from("profiles").select("id").or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`).limit(50);
      q = q.in("customer_id", (hits ?? []).map((h) => h.id).concat([NONE]));
    }
  }
  const { data } = await q;
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.flatMap((o) => [o.customer_id, o.pickup_agent_id].filter(Boolean) as string[])));
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const n = new Map((ppl ?? []).map((p) => [p.id, p.full_name]));
  const { data: sh } = rows.length ? await supabase.from("order_shelves").select("order_id,shelf").in("order_id", rows.map((o) => o.id)).is("released_at", null) : { data: [] };
  const shelves = new Map<string, string[]>();
  for (const s of sh ?? []) shelves.set(s.order_id, [...(shelves.get(s.order_id) ?? []), s.shelf].sort());
  const href = (f?: string) => `${basePath}${f || needle ? "?" : ""}${[f ? `status=${f}` : "", needle ? `q=${encodeURIComponent(needle)}` : ""].filter(Boolean).join("&")}`;

  return (
    <div className="space-y-4">
      <form className="flex gap-2" role="search" action={basePath}>
        <input name="q" defaultValue={needle} aria-label="Search orders" placeholder="Order number, shelf (C4), name, phone or email" className="w-full max-w-md rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" />
        {status && <input type="hidden" name="status" value={status} />}
        <button className="btn-secondary">Search</button>
        {needle && <Link href={basePath} className="self-center text-sm underline">Clear</Link>}
      </form>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={href()} className={`rounded-full border px-3 py-1 ${!status ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>All</Link>
        {FILTERS.map((f) => <Link key={f} href={href(f)} className={`rounded-full border px-3 py-1 ${status === f ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>{STATUS_LABEL[f] ?? f}</Link>)}
      </div>
      {shelfSearch && <p className="text-sm text-ink-soft">Orders on shelf {shelfSearch} now.</p>}
      <section className="card divide-y divide-line">
        {rows.map((o) => (
          <Link key={o.id} href={`/staff/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
            <div>
              <p className="font-medium">#{o.order_no} · {n.get(o.customer_id) ?? "Customer"}</p>
              <p className="text-sm text-ink-soft">{STATUS_LABEL[o.status] ?? o.status}{o.pickup_agent_id ? ` · agent ${n.get(o.pickup_agent_id) ?? ""}` : ""}{shelves.get(o.id) ? <> · <strong className="text-ink">Shelf {shelves.get(o.id)!.join(", ")}</strong></> : null}</p>
            </div>
            <div className="text-right text-sm"><p>{longDate(o.created_at ?? "")}</p>{o.items_total_kobo > 0 && <p className="text-ink-soft">{naira(o.items_total_kobo)}</p>}</div>
          </Link>
        ))}
        {rows.length === 0 && <p className="p-5 text-sm text-ink-soft">{needle ? "No orders match that search." : "No orders yet."}</p>}
      </section>
      {rows.length === 100 && <p className="text-xs text-ink-mute">Showing the latest 100. Search or filter to narrow it down.</p>}
    </div>
  );
}
