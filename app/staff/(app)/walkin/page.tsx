import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { WalkinStart } from "@/components/ops/WalkinTools";
import { PhoneActions } from "@/components/ops/PhoneActions";

export const metadata = { title: "Walk-in orders" };
export const dynamic = "force-dynamic";

type Row = { id: string; order_no: number; status: string; customer: string; phone: string | null; total_kobo: number; created_at: string };

export default async function WalkinPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim().toLowerCase().slice(0, 40);
  const digits = term.replace(/\D/g, "");
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data } = await supabase.rpc("desk_walkin_recent");
  const all = (Array.isArray(data) ? data : []) as unknown as Row[];
  const rows = term ? all.filter((r) => r.customer.toLowerCase().includes(term) || (digits.length >= 3 && (r.phone ?? "").replace(/\D/g, "").includes(digits.replace(/^0/, ""))) || String(r.order_no) === term.replace("#", "")) : all;
  const open = rows.filter((r) => !["delivered", "closed", "cancelled"].includes(r.status));
  const done = rows.filter((r) => ["delivered", "closed", "cancelled"].includes(r.status));
  const row = (r: Row) => (
    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
      <div><Link href={`/staff/walkin/${r.id}`} className="font-medium hover:underline">Order #{r.order_no} · {r.customer}</Link><p className="text-sm text-ink-soft"><PhoneActions phone={r.phone} message={r.status === "ready" ? `Hello ${r.customer.split(" ")[0]}, your clothes (order #${r.order_no}) are ready at LaundryPoint. Please come to collect them, or tell us if you want them delivered.` : undefined} /> · {new Date(r.created_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}</p></div>
      <Link href={`/staff/walkin/${r.id}`} className="text-right text-sm"><p className="font-medium">{r.total_kobo > 0 ? naira(r.total_kobo) : ""}</p><p className="text-ink-soft">{STATUS_LABEL[r.status] ?? r.status}</p></Link>
    </div>
  );
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Walk-in orders</h1><p className="mt-1 text-sm text-ink-soft">For customers who come to the hub. Count their clothes in front of them, take payment, and the order joins the same wash queue as online orders.</p></div>
      <WalkinStart />
      <form className="flex flex-wrap items-end gap-2" role="search"><div className="min-w-0 flex-1"><label htmlFor="sq" className="mb-1 block text-sm font-medium">Find an order by phone number, name or order number</label><input id="sq" name="q" defaultValue={q} className="w-full rounded-md border border-line px-3 py-2.5 text-sm" placeholder="08012345678" inputMode="search" /></div><button className="btn-secondary">Search</button>{q && <Link href="/staff/walkin" className="pb-2 text-sm underline">Clear</Link>}</form>
      <section><h2 className="mb-2 text-lg font-semibold">Open ({open.length})</h2><div className="card divide-y divide-line">{open.map(row)}{open.length === 0 && <p className="p-5 text-sm text-ink-soft">No open walk-in orders.</p>}</div></section>
      <section><h2 className="mb-2 text-lg font-semibold">Last 3 days</h2><div className="card divide-y divide-line">{done.map(row)}{done.length === 0 && <p className="p-5 text-sm text-ink-soft">Nothing yet.</p>}</div></section>
    </div>
  );
}
