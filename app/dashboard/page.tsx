import Link from "next/link";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { requireUser } from "@/lib/roles";

export const metadata = { title: "Customer dashboard" };
export const dynamic = "force-dynamic";

export default async function CustomerDashboardPage() {
  const { supabase, user } = await requireUser("/dashboard");
  const [{ count: orderCount }, { data: subscription }] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", user.id),
    supabase.from("subscriptions").select("id,status,current_period_end").eq("customer_id", user.id).in("status", ["active", "pending"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const links = [
    { href: "/orders", title: "My orders", description: "View current and past laundry orders." },
    { href: "/subscriptions", title: "Monthly plans", description: "View plans and your subscription status." },
    { href: "/request", title: "Book a pickup", description: "Arrange your next collection." },
    { href: "/account/extra-clothes", title: "Extra-clothes bills", description: "Review and pay any outstanding extra-piece bills." },
    { href: "/account", title: "My account", description: "Manage your profile and saved pickup location." },
  ];

  return (
    <main id="main" className="min-h-screen w-full">
      <CustomerSidebar name={user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Customer"} />
      <div className="container-page mx-auto w-full max-w-5xl space-y-6 py-6 sm:py-8">
        <header className="space-y-2">
          <p className="text-sm font-medium text-ink-soft">Customer dashboard</p>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back{user.user_metadata?.full_name || user.user_metadata?.name ? `, ${user.user_metadata.full_name || user.user_metadata.name}` : ""}</h1>
          <p className="text-ink-soft">Manage your laundry, monthly plan, and pickup requests from one place.</p>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="card space-y-2 p-5"><p className="text-sm text-ink-soft">Total orders</p><p className="text-3xl font-semibold">{orderCount ?? 0}</p><Link className="text-sm font-medium text-brand-dark hover:underline" href="/orders">View my orders →</Link></div>
          <div className="card space-y-2 p-5"><p className="text-sm text-ink-soft">Monthly plan</p><p className="text-xl font-semibold">{subscription?.status === "active" ? "Active" : subscription?.status === "pending" ? "Payment pending" : "No active plan"}</p>{subscription?.current_period_end && <p className="text-sm text-ink-soft">Current period ends {new Date(subscription.current_period_end).toLocaleDateString("en-NG")}</p>}<Link className="text-sm font-medium text-brand-dark hover:underline" href="/subscriptions">Manage monthly plan →</Link></div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((item) => <Link key={item.href} href={item.href} className="card block space-y-2 border border-line p-5 transition hover:border-brand/40 hover:shadow-sm"><h2 className="font-semibold">{item.title} <span aria-hidden="true">→</span></h2><p className="text-sm text-ink-soft">{item.description}</p></Link>)}
        </section>
      </div>
    </main>
  );
}
