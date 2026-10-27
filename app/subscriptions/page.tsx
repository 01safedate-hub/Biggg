import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Monthly laundry plans" };
export const dynamic = "force-dynamic";

const naira = (amount: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0,
}).format(amount);

const PLANS = [
  { key: "starter", name: "Starter", price: 30000, pieces: 75 },
  { key: "pro", name: "Pro", price: 65000, pieces: 150 },
  { key: "family_bond", name: "Family Bond", price: 170000, pieces: 250 },
  { key: "family_max", name: "Family Max", price: 350000, pieces: 300 },
];

export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main id="main" className="container-page max-w-4xl space-y-6 py-10">
      <Link href="/" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Home</Link>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Monthly laundry plans</h1>
        <p className="max-w-2xl text-sm text-ink-soft">One monthly payment covers pickup, laundry and delivery for clothes included in your plan. Your allowance is counted by total pieces, whatever the clothing type, across two pickups during the month.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <section key={plan.key} className="card space-y-3 p-5">
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="text-2xl font-bold">{naira(plan.price)}<span className="ml-1 text-sm font-normal text-ink-soft">/ month</span></p>
            <p className="text-sm">{plan.pieces} clothes per month</p>
            <p className="text-sm text-ink-soft">Use your allowance over two pickups. Clothes above your remaining allowance will be counted and billed separately online before processing.</p>
            {user ? <Link href="/subscriptions/checkout" className="btn-primary inline-block">Choose plan</Link> : <Link href="/login?next=/subscriptions" className="btn-primary inline-block">Sign in to choose</Link>}
          </section>
        ))}
      </div>
      <p className="text-xs text-ink-mute">Plan activation and checkout must use verified online payment. Never pay an agent in cash.</p>
    </main>
  );
}
