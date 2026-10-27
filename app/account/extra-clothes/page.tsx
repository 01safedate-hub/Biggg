import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";

export const metadata = { title: "Extra-clothes bills" };
export const dynamic = "force-dynamic";

export default async function ExtraClothesPage() {
  const { supabase, user } = await requireUser("/account/extra-clothes");
  const { data: pickups, error } = await supabase
    .from("subscription_pickups")
    .select("id,subscription_id,order_id,pieces_counted,overage_pieces,overage_kobo,status,scheduled_for,created_at,subscriptions!inner(customer_id)")
    .eq("subscriptions.customer_id", user.id)
    .gt("overage_pieces", 0)
    .order("created_at", { ascending: false });
  return (
    <main id="main" className="container-page max-w-3xl space-y-6 py-10">
      <Link href="/" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Home</Link>
      <CustomerSidebar />
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Extra-clothes bills</h1>
        <p className="text-sm text-ink-soft">This page lists extra pieces recorded against your monthly plan. Pay online only; never pay a pickup agent in cash.</p>
      </div>
      {error ? <p className="card p-5 text-sm text-ink-soft">We could not load your bills right now. Please refresh shortly.</p> : null}
      {!error && (pickups ?? []).length === 0 ? <p className="card p-5 text-sm text-ink-soft">You have no extra-clothes bills.</p> : null}
      {(pickups ?? []).map((p) => (
        <section key={p.id} className="card space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold">Extra clothes · {p.overage_pieces} piece{p.overage_pieces === 1 ? "" : "s"}</h2><p className="text-sm text-ink-soft">Total counted: {p.pieces_counted ?? "—"} pieces</p></div>
            <p className="text-lg font-bold">{naira(Number(p.overage_kobo ?? 0) / 100)}</p>
          </div>
          <p className="text-sm text-ink-soft">Recorded {longDate(p.created_at ?? p.scheduled_for ?? "")} · {p.status.replaceAll("_", " ")}</p>
          {p.order_id ? <Link href={`/orders/${p.order_id}`} className="text-sm font-medium text-brand-dark hover:underline">View related order</Link> : null}
          <p className="text-xs text-ink-mute">Online payment action will appear here once the overage invoice payment route is connected.</p>
        </section>
      ))}
    </main>
  );
}
