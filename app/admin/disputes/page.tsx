import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { OpenDispute } from "@/components/admin/DisputeForms";

export const metadata = { title: "Bank disputes" };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { open: "Needs your reply", evidence_sent: "Waiting for the bank", won: "Won", lost: "Lost" };
const dt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export default async function Disputes() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.from("payment_disputes").select("id,order_id,provider,amount_kobo,reason,status,due_at,created_at").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.map((r) => r.order_id)));
  const { data: ords } = ids.length ? await supabase.from("orders").select("id,order_no").in("id", ids) : { data: [] };
  const no = new Map((ords ?? []).map((o) => [o.id, o.order_no]));
  const live = rows.filter((r) => r.status === "open" || r.status === "evidence_sent");
  const old = rows.filter((r) => r.status === "won" || r.status === "lost");
  const soon = (d: string | null) => d && new Date(d).getTime() - Date.now() < 3 * 86400000;
  const row = (r: (typeof rows)[number]) => (
    <Link key={r.id} href={`/admin/disputes/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
      <div><p className="font-medium">Order #{no.get(r.order_id)} · {naira(r.amount_kobo)} · {r.provider}</p><p className="text-sm text-ink-soft">{r.reason}</p></div>
      <div className="text-right text-sm"><p className={`font-medium ${r.status === "open" ? "text-brand-dark" : ""}`}>{LABEL[r.status]}</p>{r.due_at && (r.status === "open" || r.status === "evidence_sent") && <p className={soon(r.due_at) ? "font-semibold text-red-700" : "text-ink-soft"}>Reply by {dt(r.due_at)}</p>}</div>
    </Link>
  );
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Bank disputes</h1><p className="mt-1 text-sm text-ink-soft">When a customer asks their bank to take a payment back (a chargeback). While a dispute is open the order is on hold and no delivery is assigned. Reply to the bank before the deadline with the evidence pack.</p></div>
      <section><h2 className="mb-2 text-lg font-semibold">Open ({live.length})</h2><div className="card divide-y divide-line">{live.map(row)}{live.length === 0 && <p className="p-5 text-sm text-ink-soft">No open disputes.</p>}</div></section>
      <OpenDispute />
      <section><h2 className="mb-2 text-lg font-semibold">Settled</h2><div className="card divide-y divide-line">{old.map(row)}{old.length === 0 && <p className="p-5 text-sm text-ink-soft">None yet.</p>}</div></section>
    </div>
  );
}
