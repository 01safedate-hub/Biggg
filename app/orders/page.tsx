import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/orders";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";

export const metadata = { title: "My orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { supabase, user } = await requireUser("/orders");
  const { data } = await supabase.from("orders").select("id,order_no,status,created_at,items_total_kobo,pickup_fare_kobo").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(50);
  return (
    <main id="main" className="container-page max-w-2xl space-y-6 py-10">
      <div className="flex items-center justify-between"><Link href="/" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Home</Link><Link href="/request" className="btn-primary">Book a pickup</Link></div>
      <h1 className="text-3xl font-bold tracking-tight">My orders</h1>
      <section className="card divide-y divide-line">
        {(data ?? []).map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
            <div><p className="font-medium">Order #{o.order_no}</p><p className="text-sm text-ink-soft">{STATUS_LABEL[o.status] ?? o.status}</p></div>
            <div className="text-right text-sm"><p>{longDate(o.created_at ?? "")}</p>{o.items_total_kobo > 0 && <p className="text-ink-soft">{naira(o.items_total_kobo)}</p>}</div>
          </Link>
        ))}
        {(data ?? []).length === 0 && <p className="p-5 text-sm text-ink-soft">You have no orders yet.</p>}
      </section>
    </main>
  );
}
