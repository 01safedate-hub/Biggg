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

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Customer";
  const actions = [
    { number: "01", title: "My orders", description: "Track laundry in progress and revisit previous orders.", href: "/orders", label: "View orders" },
    { number: "02", title: "Book a pickup", description: "Schedule a collection that fits your day.", href: "/request", label: "Schedule pickup" },
    { number: "03", title: "Monthly plans", description: "Review your allowance and manage your plan.", href: "/subscriptions", label: "Manage plan" },
    { number: "04", title: "Extra-clothes bills", description: "See additional pieces and pay outstanding bills online.", href: "/account/extra-clothes", label: "View bills" },
    { number: "05", title: "My account", description: "Update your profile and collection address.", href: "/account", label: "Account settings" },
  ];

  return (
    <main id="main" className="min-h-screen w-full bg-canvas">
      <CustomerSidebar name={displayName} />
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <section aria-label="Account overview" className="grid gap-4 md:grid-cols-2">
          <article className="relative overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-medium text-ink-soft">All orders</p><p className="mt-3 text-4xl font-semibold tracking-tight text-ink">{orderCount ?? 0}</p><p className="mt-2 text-sm text-ink-soft">Your laundry order history</p></div>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-xl text-brand-dark" aria-hidden="true">↗</span>
            </div>
            <Link href="/orders" className="mt-6 inline-flex items-center gap-2 border-t border-line pt-4 text-sm font-semibold text-brand-dark hover:underline">Explore orders <span aria-hidden="true">→</span></Link>
          </article>
          <article className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-sm sm:p-7">
            <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full border-[28px] border-white/5" aria-hidden="true" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-300">Monthly subscription</p>
                <p className="mt-3 text-2xl font-semibold">{subscription?.status === "active" ? "Your plan is active" : subscription?.status === "pending" ? "Awaiting payment" : "Choose a plan"}</p>
                <p className="mt-2 text-sm text-slate-300">{subscription?.current_period_end ? `Current period ends ${new Date(subscription.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : subscription?.status === "active" ? "Your monthly laundry allowance is ready." : "Find the right monthly allowance for you."}</p>
              </div>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl text-orange-300" aria-hidden="true">✦</span>
            </div>
            <Link href="/subscriptions" className="relative mt-6 inline-flex items-center gap-2 border-t border-white/15 pt-4 text-sm font-semibold text-orange-300 hover:underline">{subscription?.status === "active" ? "View subscription" : "Explore monthly plans"} <span aria-hidden="true">→</span></Link>
          </article>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">QUICK ACCESS</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Manage your account</h2></div></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {actions.map((item) => <Link key={item.href} href={item.href} className="group flex min-h-44 flex-col rounded-2xl border border-line bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md sm:p-6">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold tracking-[0.15em] text-ink-mute">{item.number}</span><span className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft transition group-hover:border-brand/30 group-hover:bg-orange-50 group-hover:text-brand-dark" aria-hidden="true">↗</span></div>
              <h3 className="mt-5 text-lg font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-ink-soft">{item.description}</p>
              <span className="mt-4 text-sm font-semibold text-brand-dark">{item.label} <span aria-hidden="true">→</span></span>
            </Link>)}
          </div>
        </section>
      </div>
    </main>
  );
}
