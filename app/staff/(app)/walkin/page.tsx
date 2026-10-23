import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { WalkinStart } from "@/components/ops/WalkinTools";

export const metadata = { title: "Walk-in orders" };
export const dynamic = "force-dynamic";

type Row = { id: string; order_no: number; status: string; customer: string; phone: string | null; total_kobo: number; created_at: string };

export default async function WalkinPage() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data } = await supabase.rpc("desk_walkin_recent");
  const rows = (Array.isArray(data) ? data : []) as unknown as Row[];
  const open = rows.filter((r) => !["delivered", "closed", "cancelled"].includes(r.status));
  const done = rows.filter((r) => ["delivered", "closed", "cancelled"].includes(r.status));
  const row = (r: Row) => (
    <Link key={r.id} href={`/staff/walkin/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
      <div><p className="font-medium">Order #{r.order_no} · {r.customer}</p><p className="text-sm text-ink-soft">{r.phone ?? "No phone"} · {new Date(r.created_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}</p></div>
      <div className="text-right text-sm"><p className="font-medium">{r.total_kobo > 0 ? naira(r.total_kobo) : ""}</p><p className="text-ink-soft">{STATUS_LABEL[r.status] ?? r.status}</p></div>
    </Link>
  );
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Walk-in orders</h1><p className="mt-1 text-sm text-ink-soft">For customers who come to the hub. Count their clothes in front of them, take payment, and the order joins the same wash queue as online orders.</p></div>
      <WalkinStart />
      <section><h2 className="mb-2 text-lg font-semibold">Open ({open.length})</h2><div className="card divide-y divide-line">{open.map(row)}{open.length === 0 && <p className="p-5 text-sm text-ink-soft">No open walk-in orders.</p>}</div></section>
      <section><h2 className="mb-2 text-lg font-semibold">Last 3 days</h2><div className="card divide-y divide-line">{done.map(row)}{done.length === 0 && <p className="p-5 text-sm text-ink-soft">Nothing yet.</p>}</div></section>
    </div>
  );
}
