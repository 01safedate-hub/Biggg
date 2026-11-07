import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { SettingsTabs } from "@/components/account/SettingsTabs";

export const metadata = { title: "History" };
export const dynamic = "force-dynamic";

const PURPOSE: Record<string, string> = {
  pickup_fare: "Transport (pickup and return)", delivery_fare: "Delivery fare", items: "Clothes bill",
  subscription: "Monthly plan", demurrage: "Storage fee", extra_clothes: "Extra clothes",
};
const PAY_STATUS: Record<string, string> = { success: "Paid", pending: "Not completed", failed: "Failed", refunded: "Refunded" };
const SOURCE: Record<string, string> = { one_time: "Online booking", online: "Online booking", walk_in: "Walk-in", subscription: "Monthly plan" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" });

export default async function HistoryPage() {
  const { supabase, user } = await requireUser("/account/history");
  const [{ data: profile }, { data: orders }, { data: payments }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("orders").select("id,order_no,status,source,created_at,items_total_kobo").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("payments").select("id,order_id,purpose,kind,status,amount_kobo,created_at").eq("customer_id", user.id).in("status", ["success", "refunded"]).order("created_at", { ascending: false }).limit(50),
  ]);
  const orderNo = new Map((orders ?? []).map((o) => [o.id, o.order_no]));
  const paidTotal = (payments ?? []).reduce((sum, p) => sum + (p.status === "success" ? (p.kind === "refund" ? -1 : 1) * Number(p.amount_kobo) : 0), 0);

  return (
    <main id="main" className="min-h-screen w-full">
      <CustomerSidebar name={profile?.full_name || user.email || "Customer"} />
      <div className="container-page mx-auto max-w-3xl space-y-8 py-4 sm:py-6">
        <SettingsTabs current="/account/history" />

        <section className="space-y-3" aria-labelledby="orders-h">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="orders-h" className="text-lg font-semibold">Orders</h2>
            <Link href="/orders" className="text-sm font-medium text-brand-dark hover:underline">Track current orders &rarr;</Link>
          </div>
          {(orders ?? []).length === 0 ? (
            <p className="card p-5 text-sm text-ink-soft">No orders yet. <Link href="/request" className="font-medium text-brand-dark hover:underline">Book your first pickup</Link>.</p>
          ) : (
            <ul className="card divide-y divide-line">
              {(orders ?? []).map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm hover:bg-canvas">
                    <span><strong>Order #{o.order_no}</strong> <span className="text-ink-soft">· {day(o.created_at)} · {SOURCE[o.source] ?? o.source}</span></span>
                    <span className="text-ink-soft">{STATUS_LABEL[o.status] ?? o.status}{Number(o.items_total_kobo ?? 0) > 0 ? ` · ${naira(Number(o.items_total_kobo))}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="payments-h">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="payments-h" className="text-lg font-semibold">Payments</h2>
            {(payments ?? []).length > 0 && <p className="text-sm text-ink-soft">Total paid: <strong className="text-ink">{naira(paidTotal)}</strong></p>}
          </div>
          {(payments ?? []).length === 0 ? (
            <p className="card p-5 text-sm text-ink-soft">No payments yet.</p>
          ) : (
            <ul className="card divide-y divide-line">
              {(payments ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm">
                  <span>
                    <strong>{p.kind === "refund" ? "Refund: " : ""}{PURPOSE[p.purpose] ?? p.purpose}</strong>
                    <span className="text-ink-soft"> · {day(p.created_at)}{p.order_id && orderNo.get(p.order_id) ? ` · Order #${orderNo.get(p.order_id)}` : ""}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={p.kind === "refund" ? "text-emerald-700" : ""}>{p.kind === "refund" ? "+" : ""}{naira(Number(p.amount_kobo))} · {PAY_STATUS[p.status] ?? p.status}</span>
                    {p.order_id && p.kind !== "refund" && <Link href={`/orders/${p.order_id}/receipt`} className="font-medium text-brand-dark hover:underline">Receipt</Link>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
