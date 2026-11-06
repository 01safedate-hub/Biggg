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
  type Usage = { plan_name: string; pieces_per_month: number; pieces_left: number; per_pickup_limit: number; included_pickups: number; included_pickups_used: number; cycle_end: string };
  const usage = user ? ((await supabase.rpc("subscription_usage")).data as unknown as Usage | null) : null;
  const active = usage;
  const { data: underReview } = user && !usage
    ? await supabase.from("subscriptions").select("id").eq("customer_id", user.id).eq("status", "pending_review").limit(1).maybeSingle()
    : { data: null };
  const freeLeft = usage ? Math.max(0, usage.included_pickups - usage.included_pickups_used) : 0;
  const cycleEnds = usage ? new Date(new Date(usage.cycle_end).getTime() - 60_000).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" }) : "";

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
        ) : underReview ? (
          <section className="card space-y-2 p-5">
            <h2 className="text-lg font-semibold">Your student plan is being checked</h2>
            <p className="text-sm text-ink-soft">We are checking your student ID. Your plan starts the day it is approved, and we will email you. You can book or drop off clothes after that.</p>
          </section>
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
              <h2 className="text-xl font-semibold">{usage?.plan_name ?? "Active plan"}</h2>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-lg border border-line p-3"><p className="text-sm text-ink-soft">Pieces left</p><p className="mt-1 text-2xl font-semibold">{usage?.pieces_left ?? 0}</p><p className="text-xs text-ink-mute">Until {cycleEnds}</p></div>
                <div className="rounded-lg border border-line p-3"><p className="text-sm text-ink-soft">Free pickups</p><p className="mt-1 text-2xl font-semibold">{usage && usage.included_pickups > 0 ? `${usage.included_pickups_used} of ${usage.included_pickups} used` : "Not included"}</p><p className="text-xs text-ink-mute">{usage && usage.included_pickups > 0 ? "Use them any time this month" : "Drop off at the hub, or pay for transport"}</p></div>
              </div>
              <p className="text-sm text-ink-soft">Up to {usage?.per_pickup_limit ?? 0} pieces are covered per pickup, within the pieces left this month. Pieces above that, and items your plan does not cover, are billed at their normal price after counting. Unused pieces do not carry over.</p>
            </section>
            {freeLeft > 0 ? <BookingForm /> : (
              <>
                <section className="card space-y-1 p-5 text-sm text-ink-soft">
                  <p className="font-semibold text-ink">{usage && usage.included_pickups > 0 ? "You have used this month's free pickups" : "Your plan does not include free pickups"}</p>
                  <p>You can bring your clothes to the hub at no charge, or book a pickup below and pay for pickup and delivery transport. Either way, your clothes count against your plan.</p>
                </section>
                <BookingForm mode="subscription_paid" />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
