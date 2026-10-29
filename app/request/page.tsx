import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BookingForm } from "@/components/orders/BookingForm";
import { NoCashNotice } from "@/components/orders/NoCashNotice";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";

export const metadata = { title: "Request a pickup" };
export const dynamic = "force-dynamic";

export default async function RequestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: active } = user
    ? await supabase.from("subscriptions")
        .select("id,plan_id,status,current_period_start,current_period_end,plans(name,pieces_per_month)")
        .eq("customer_id", user.id)
        .eq("status", "active")
        .lte("current_period_start", new Date().toISOString())
        .gt("current_period_end", new Date().toISOString())
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const plan = Array.isArray(active?.plans) ? active.plans[0] : active?.plans;
  let pickupCount = 0;
  let usedPieces = 0;
  if (active?.id) {
    const { data: pickups } = await supabase.from("subscription_pickups")
      .select("pieces_counted,status")
      .eq("subscription_id", active.id)
      .gte("scheduled_for", active.current_period_start ?? new Date().toISOString())
      .lt("scheduled_for", active.current_period_end ?? new Date().toISOString())
      .not("status", "in", '("missed","skipped")');
    pickupCount = (pickups ?? []).length;
    usedPieces = (pickups ?? []).reduce((sum, pickup) => sum + Number(pickup.pieces_counted ?? 0), 0);
  }

  return (
    <main id="main" className="min-h-screen w-full">
      {user ? <CustomerSidebar /> : <Link href="/login?next=/request" className="text-sm font-medium text-ink-soft hover:text-ink">Sign in to request a pickup</Link>}
      <div className="container-page mx-auto max-w-2xl space-y-6 py-6 sm:py-8">
        <h1 className="text-3xl font-bold tracking-tight">Request a pickup</h1>
        {!user ? (
          <div className="card space-y-4 p-6">
            <p className="text-sm text-ink-soft">Sign in or create an account to request a pickup through a monthly plan.</p>
            <div className="flex gap-3"><Link href="/login?next=/request" className="btn-primary">Sign in</Link><Link href="/signup" className="btn-secondary">Create account</Link></div>
          </div>
        ) : !active ? (
          <>
            <section className="card space-y-3 p-5">
              <p className="text-sm text-ink-soft">No monthly plan is active on your account. You can pay once for transport and have your garments counted and billed separately after collection.</p>
              <h2 className="text-lg font-semibold">One-time pickup</h2>
              <p className="text-sm text-ink-soft">Pickup and delivery transport is paid online before we assign an agent. Laundry charges are calculated after the agent records your garments.</p>
              <p className="text-sm"><Link className="font-semibold text-brand-dark underline" href="/subscriptions">Compare monthly plans</Link> for plan-covered transport and garment allowance.</p>
            </section>
            <BookingForm mode="one_time" />
          </>
        ) : (
          <>
            <NoCashNotice subscription />
            <section className="card space-y-2 p-5">
              <p className="text-sm text-ink-soft">Your monthly plan</p>
              <h2 className="text-xl font-semibold">{plan?.name ?? "Active plan"}</h2>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-lg border border-line p-3"><p className="text-sm text-ink-soft">Garment allowance left</p><p className="mt-1 text-2xl font-semibold">{Math.max(0, Number(plan?.pieces_per_month ?? 0) - usedPieces)}</p></div>
                <div className="rounded-lg border border-line p-3"><p className="text-sm text-ink-soft">Pickups used</p><p className="mt-1 text-2xl font-semibold">{pickupCount} of 2</p></div>
              </div>
              <p className="text-sm text-ink-soft">Pickup and delivery for included garments are covered. The agent counts all garments at collection; any pieces above your remaining allowance are billed online separately.</p>
            </section>
            {pickupCount >= 2 ? (
              <p className="card p-5 text-sm text-ink-soft">You have used both pickup requests for this billing period. You can request another pickup when your next monthly period begins.</p>
            ) : <BookingForm />}
          </>
        )}
      </div>
    </main>
  );
}
