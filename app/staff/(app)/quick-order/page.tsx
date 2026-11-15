import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { QuickOrderStart } from "@/components/ops/QuickOrder";

export const metadata = { title: "Quick order" };
export const dynamic = "force-dynamic";

export default async function QuickOrderPage() {
  const { supabase, user } = await requireRole(["delivery_agent", "commission_agent"]);
  const [{ data: allowed }, { data: bank }, { data: rows }] = await Promise.all([
    supabase.rpc("quick_order_gate"),
    supabase.rpc("pay_later_bank"),
    supabase.from("orders")
      .select("id,order_no,status,items_total_kobo,discount_kobo,instant_fee_kobo,delivery_fare_kobo,pay_later_at,payment_claim,paid_confirmed_at,created_at,profiles!orders_customer_id_fkey(full_name)")
      .eq("pickup_agent_id", user.id).eq("quick_order", true).not("status", "in", "(delivered,closed,cancelled)")
      .order("created_at", { ascending: false }).limit(50),
  ]);
  const b = (bank ?? {}) as { agent_limit?: number; customer_limit?: number };
  const list = (rows ?? []) as unknown as {
    id: string; order_no: number; status: string; items_total_kobo: number; discount_kobo: number; instant_fee_kobo: number; delivery_fare_kobo: number | null;
    pay_later_at: string | null; payment_claim: unknown; paid_confirmed_at: string | null; created_at: string; profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  }[];
  const unpaid = list.filter((o) => o.pay_later_at && !o.paid_confirmed_at).length;
  const limit = b.agent_limit ?? 5;
  const payState = (o: (typeof list)[number]) => {
    if (o.paid_confirmed_at) return { text: "Paid ✓", cls: "text-emerald-700" };
    if (!o.pay_later_at) return { text: "Counting", cls: "text-ink-soft" };
    if (o.payment_claim) return { text: "Transfer: office checking", cls: "text-brand-dark" };
    return { text: "Pay later: not paid", cls: "text-amber-700" };
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quick order</h1>
        <p className="mt-1 text-sm text-ink-soft">Take clothes from someone you meet in the field. Count them, show our bank account, and get paid on the spot. We deliver the clothes back.</p>
      </div>
      {allowed !== true ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Quick orders open once your account is verified at the hub. Ask the secretary.</p>
      ) : (
        <>
          <div className={`rounded-md border p-3 text-sm ${unpaid >= limit ? "border-red-300 bg-red-50 text-red-900" : "border-line bg-canvas"}`}>
            Unpaid quick orders: <strong>{unpaid} of {limit}</strong>.{unpaid >= limit ? " Get these paid before you take more clothes." : " Always try to get paid on the spot."}
          </div>
          <QuickOrderStart />
        </>
      )}
      <section>
        <h2 className="mb-2 text-lg font-semibold">My open quick orders ({list.length})</h2>
        <div className="card divide-y divide-line">
          {list.map((o) => {
            const p = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles;
            const total = Math.max(0, o.items_total_kobo - o.discount_kobo) + o.instant_fee_kobo + (o.delivery_fare_kobo ?? 0);
            const s = payState(o);
            return (
              <Link key={o.id} href={`/staff/jobs/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
                <div><p className="font-medium">#{o.order_no} · {p?.full_name ?? "Customer"}</p><p className="text-sm text-ink-soft">{STATUS_LABEL[o.status] ?? o.status}</p></div>
                <div className="text-right text-sm"><p className="font-medium">{total > 0 ? naira(total) : ""}</p><p className={s.cls}>{s.text}</p></div>
              </Link>
            );
          })}
          {list.length === 0 && <p className="p-5 text-sm text-ink-soft">No open quick orders.</p>}
        </div>
      </section>
    </div>
  );
}
