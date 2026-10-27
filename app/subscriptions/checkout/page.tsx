import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionCheckout } from "@/components/subscriptions/SubscriptionCheckout";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";

export const metadata = { title: "Choose a monthly plan" };
export const dynamic = "force-dynamic";

export default async function SubscriptionCheckoutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main id="main" className="container-page max-w-xl space-y-4 py-10"><h1 className="text-2xl font-bold">Sign in to continue</h1><Link className="btn-primary inline-block" href="/login?next=/subscriptions/checkout">Sign in</Link></main>;
  const { data: plans } = await supabase.from("plans").select("slug,name,monthly_price_kobo,pieces_per_month,active,sort_order").eq("active", true).order("sort_order");
  return (
    <main id="main" className="container-page max-w-3xl space-y-6 py-10">
      <Link href="/subscriptions" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Monthly plans</Link>
      <CustomerSidebar />
      <div><h1 className="text-3xl font-bold tracking-tight">Choose your monthly plan</h1><p className="mt-2 text-sm text-ink-soft">Payment is verified with the payment provider before your plan is activated. Covered pickup and delivery are included in your allowance.</p></div>
      <SubscriptionCheckout plans={(plans ?? []).map(p => ({ slug: p.slug, name: p.name, priceKobo: Number(p.monthly_price_kobo), pieces: p.pieces_per_month }))} />
    </main>
  );
}
