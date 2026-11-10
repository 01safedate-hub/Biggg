import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { OrdersList } from "@/components/ops/OrdersList";

export const metadata = { title: "Orders" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q: term } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  const { data: rs } = await supabase.rpc("ratings_summary");
  const rating = rs as unknown as { count: number; avg: number | null; dist: Record<string, number>; low: { order_id: string; order_no: number; stars: number; comment: string | null; customer: string }[] } | null;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Orders</h1><p className="mt-1 text-sm text-ink-soft">Open any order to see who did each step and how long it took.</p></div>
      {rating && rating.count > 0 && (
        <section className="card space-y-3 p-5" aria-label="Customer ratings">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">Customer ratings</h2><p className="text-sm text-ink-soft"><strong className="text-xl text-ink">{rating.avg}</strong> / 5 from {rating.count} {rating.count === 1 ? "rating" : "ratings"}</p></div>
          <div className="space-y-1" role="img" aria-label="Number of ratings by stars">{[5, 4, 3, 2, 1].map((n) => { const c = rating.dist[String(n)] ?? 0; return <div key={n} className="flex items-center gap-2 text-xs"><span className="w-8 text-ink-soft">{n} ★</span><div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-brand" style={{ width: `${(c / rating.count) * 100}%` }} /></div><span className="w-6 text-right tabular-nums">{c}</span></div>; })}</div>
          {rating.low.length > 0 && <div><h3 className="text-sm font-semibold">Needs a call (3 stars or less)</h3><ul className="mt-1 divide-y divide-line text-sm">{rating.low.map((l) => <li key={l.order_id} className="py-2"><Link className="font-medium text-brand-dark underline" href={`/staff/orders/${l.order_id}`}>#{l.order_no}</Link> · {l.customer} · {l.stars} ★{l.comment ? ` · "${l.comment}"` : ""}</li>)}</ul></div>}
        </section>
      )}
      <OrdersList supabase={supabase} basePath="/admin/orders" status={status} term={term} />
    </div>
  );
}
