import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/orders";
import { MoveShelves } from "@/components/ops/MoveShelves";
import { SHELF_NUMS, SHELF_ROWS } from "@/lib/shelves";

export const metadata = { title: "Shelf map" };
export const dynamic = "force-dynamic";

type Row = { shelf: string; order_id: string; order_no: number; status: string; since: string; customer: string | null; pieces: number };

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
};

export default async function ShelvesPage() {
  const { supabase, roles } = await requireRole(["secretary", "admin", "super_admin", "cashier", "washer"]);
  const desk = roles.some((r) => ["secretary", "admin", "super_admin", "cashier"].includes(r));
  const { data } = await supabase.rpc("shelf_board");
  const rows = (data ?? []) as unknown as Row[];
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(r.shelf, [...(by.get(r.shelf) ?? []), r]);
  const use: Record<string, number> = {};
  by.forEach((v, k) => { use[k] = v.length; });
  const orders = new Set(rows.map((r) => r.order_id)).size;
  const old = (iso: string) => Date.now() - new Date(iso).getTime() > 2 * 86400000;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shelf map</h1>
        <p className="mt-1 text-sm text-ink-soft">{orders} order{orders === 1 ? "" : "s"} on {by.size} of 63 shelves. A shelf is freed by itself when its order is delivered or collected. Red means it has been there over 2 days.</p>
      </div>

      <section className="card overflow-x-auto p-4" aria-label="All shelves">
        <div className="inline-block space-y-1">
          {SHELF_ROWS.map((r) => (
            <div key={r} className="flex gap-1">
              {SHELF_NUMS.map((n) => {
                const s = `${r}${n}`;
                const list = by.get(s) ?? [];
                const stale = list.some((x) => old(x.since));
                return (
                  <a key={s} href={list.length ? `#shelf-${s}` : undefined} aria-label={`${s}: ${list.length ? `${list.length} order${list.length === 1 ? "" : "s"}` : "empty"}`}
                    className={`flex h-11 w-11 flex-col items-center justify-center rounded-md border text-xs font-semibold tabular-nums ${!list.length ? "border-line bg-white text-ink-mute" : stale ? "border-red-300 bg-red-50 text-red-800" : "border-brand bg-brand-tint text-brand-dark"}`}>
                    {s}{list.length > 0 && <span className="text-[10px] font-normal">{list.length} ord</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {Array.from(by.entries()).map(([s, list]) => (
          <div key={s} id={`shelf-${s}`} className="card scroll-mt-20 p-4">
            <h2 className="text-lg font-semibold">Shelf {s}</h2>
            <ul className="mt-2 divide-y divide-line">
              {list.map((o) => (
                <li key={o.order_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium">{desk ? <Link className="underline" href={`/staff/orders/${o.order_id}`}>#{o.order_no}</Link> : `#${o.order_no}`}{o.customer ? ` · ${o.customer}` : ""}</p>
                    <p className={old(o.since) ? "text-red-700" : "text-ink-soft"}>{o.pieces} pieces · {STATUS_LABEL[o.status] ?? o.status} · here {ago(o.since)}</p>
                  </div>
                  <MoveShelves orderId={o.order_id} current={rows.filter((x) => x.order_id === o.order_id).map((x) => x.shelf)} use={use} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {rows.length === 0 && <p className="card p-5 text-sm text-ink-soft">All shelves are empty.</p>}
      </section>
    </div>
  );
}
