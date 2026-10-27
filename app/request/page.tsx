import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookingForm } from "@/components/orders/BookingForm";
import { NoCashNotice } from "@/components/orders/NoCashNotice";

export const metadata = { title: "Request a pickup" };
export const dynamic = "force-dynamic";

export default async function RequestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    // Avoid creating duplicate pickups while an existing order is still active.
    const { data: activeOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("customer_id", user.id)
      .in("status", ["awaiting_fare_payment", "awaiting_dispatch", "agent_assigned", "agent_arrived", "counted", "count_confirmed", "received", "in_house", "ready", "out_for_delivery", "failed_delivery"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeOrder) redirect("/orders");
  }
  return (
    <main id="main" className="container-page max-w-2xl space-y-6 py-10">
      <Link href="/" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Home</Link>
      <h1 className="text-3xl font-bold tracking-tight">Request a pickup</h1>
      <NoCashNotice />
      {user ? <BookingForm /> : (
        <div className="card space-y-4 p-6">
          <p className="text-sm text-ink-soft">Sign in or create an account to book. It takes a minute, and you will track everything on your phone.</p>
          <div className="flex gap-3"><Link href="/login?next=/request" className="btn-primary">Sign in</Link><Link href="/signup" className="btn-secondary">Create account</Link></div>
        </div>
      )}
    </main>
  );
}
