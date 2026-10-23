import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { RefundButton } from "@/components/admin/OpsForms";

export const metadata = { title: "Online payments" };

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const PURPOSE: Record<string, string> = { pickup_fare: "Transport (pickup + delivery)", delivery_fare: "Delivery fare", items: "Clothes bill", subscription: "Subscription", demurrage: "Demurrage", other: "Other" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; mode?: string }> }) {
  const { status, mode } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  let q = supabase.from("payments").select("id,order_id,customer_id,purpose,kind,mode,amount_kobo,reference,status,created_at,paid_at").in("mode", ["paystack", "flutterwave"]).order("created_at", { ascending: false }).limit(200);
  if (status && ["pending", "success", "failed"].includes(status)) q = q.eq("status", status);
  if (mode && ["paystack", "flutterwave"].includes(mode)) q = q.eq("mode", mode);
  const [{ data }, { data: refunds }] = await Promise.all([q, supabase.from("payments").select("id,order_id,customer_id,amount_kobo,reference,created_at").eq("kind", "refund").eq("status", "pending").order("created_at")]);
  const rows = data ?? [];
  const orderIds = Array.from(new Set([...rows, ...(refunds ?? [])].map((r) => r.order_id).filter(Boolean) as string[]));
  const custIds = Array.from(new Set((refunds ?? []).map((r) => r.customer_id).filter(Boolean) as string[]));
  const { data: custs } = custIds.length ? await supabase.from("profiles").select("id,full_name,phone,email").in("id", custIds) : { data: [] };
  const cust = new Map((custs ?? []).map((c) => [c.id, c]));
  const { data: ord } = orderIds.length ? await supabase.from("orders").select("id,order_no").in("id", orderIds) : { data: [] };
  const no = new Map((ord ?? []).map((o) => [o.id, o.order_no]));
  const sum = (m: string) => rows.filter((r) => r.mode === m && r.status === "success").reduce((s, r) => s + (r.kind === "refund" ? -r.amount_kobo : r.amount_kobo), 0);
  const stuck = rows.filter((r) => r.status === "pending" && Date.now() - new Date(r.created_at ?? 0).getTime() > 30 * 60 * 1000).length;
  const chip = (href: string, label: string, on: boolean) => <Link href={href} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>{label}</Link>;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Online payments</h1><p className="mt-1 text-sm text-ink-soft">Every Paystack and Flutterwave payment, with its reference so you can match it to the provider dashboard. Successful payments cannot be edited.</p></div>
      {(refunds ?? []).length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-label="Refunds to send">
          <h2 className="text-lg font-semibold text-amber-950">Refunds to send ({(refunds ?? []).length})</h2>
          <p className="text-sm text-amber-900">These customers were overcharged after a category correction. Send the money, then confirm here.</p>
          <ul className="divide-y divide-amber-200">
            {(refunds ?? []).map((r) => { const c = r.customer_id ? cust.get(r.customer_id) : null; return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-medium">{naira(r.amount_kobo)} to {c?.full_name ?? "customer"}{r.order_id && no.get(r.order_id) ? ` · order #${no.get(r.order_id)}` : ""}</p><p className="text-xs text-amber-900">{c?.phone} {c?.email}</p></div>
                <RefundButton id={r.id} />
              </li>
            ); })}
          </ul>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Paystack received</p><p className="mt-1 text-2xl font-bold">{naira(sum("paystack"))}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Flutterwave received</p><p className="mt-1 text-2xl font-bold">{naira(sum("flutterwave"))}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Pending over 30 min</p><p className={`mt-1 text-2xl font-bold ${stuck ? "text-red-700" : ""}`}>{stuck}</p><p className="text-xs text-ink-mute">{stuck ? "Check these in the provider dashboard" : "Nothing stuck"}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {chip("/admin/payments", "All", !status && !mode)}
        {["success", "pending", "failed"].map((s) => chip(`/admin/payments?status=${s}`, s, status === s))}
        {["paystack", "flutterwave"].map((m) => chip(`/admin/payments?mode=${m}`, m, mode === m))}
      </div>
      <section className="card divide-y divide-line">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div><p className="font-medium">{PURPOSE[r.purpose] ?? r.purpose}{r.order_id && no.get(r.order_id) ? ` · order #${no.get(r.order_id)}` : ""}</p><p className="font-mono text-xs text-ink-mute">{r.reference}</p></div>
            <div className="text-right"><p className="font-semibold">{naira(r.amount_kobo)} <span className="text-xs font-normal text-ink-mute">{r.mode}</span></p><p className={`text-xs ${r.status === "success" ? "text-emerald-700" : r.status === "failed" ? "text-red-700" : "text-amber-700"}`}>{r.status} · {when(r.paid_at ?? r.created_at ?? "")}</p></div>
          </div>
        ))}
        {rows.length === 0 && <p className="p-5 text-sm text-ink-soft">No online payments yet.</p>}
      </section>
    </div>
  );
}
