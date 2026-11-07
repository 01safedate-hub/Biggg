import { requireUser } from "@/lib/roles";
import { naira } from "@/lib/format";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { SettingsTabs } from "@/components/account/SettingsTabs";
import { PartnerInterestButton } from "@/components/account/PartnerInterestButton";

export const metadata = { title: "Partner with us" };
export const dynamic = "force-dynamic";

type Terms = { commission_pct: number; months: number; hold_hours: number; min_payout_kobo: number; min_first_order_kobo: number };
const FALLBACK: Terms = { commission_pct: 10, months: 12, hold_hours: 48, min_payout_kobo: 100000, min_first_order_kobo: 200000 };

/** Small inline illustrations, drawn in the brand colour, one per step. */
function StepIcon({ kind }: { kind: "apply" | "hub" | "sign" | "share" | "earn" }) {
  const common = { width: 40, height: 40, viewBox: "0 0 40 40", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (kind) {
    case "apply": return <svg {...common}><rect x="9" y="6" width="22" height="28" rx="3" /><path d="M14 14h12M14 20h12M14 26h7" /></svg>;
    case "hub": return <svg {...common}><path d="M6 18 20 8l14 10" /><path d="M10 16v16h20V16" /><rect x="17" y="23" width="6" height="9" /></svg>;
    case "sign": return <svg {...common}><path d="M8 30c4-6 7-6 9-2s5 4 8-2" /><path d="M26 8l6 6-12 12h-6v-6z" /></svg>;
    case "share": return <svg {...common}><circle cx="12" cy="20" r="4" /><circle cx="29" cy="11" r="4" /><circle cx="29" cy="29" r="4" /><path d="m15.5 18 10-5M15.5 22l10 5" /></svg>;
    case "earn": return <svg {...common}><circle cx="20" cy="20" r="13" /><path d="M24 15h-6a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5h-6M20 12v3M20 25v3" /></svg>;
  }
}

export default async function PartnerPage() {
  const { supabase, user } = await requireUser("/account/partner");
  const [{ data: profile }, { data: termsRow }, { data: request }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.rpc("partner_programme_terms"),
    supabase.from("partner_interest").select("status,created_at").eq("customer_id", user.id).maybeSingle(),
  ]);
  const t = { ...FALLBACK, ...((termsRow ?? {}) as Partial<Terms>) };
  const pct = Number(t.commission_pct);
  const exampleBill = 1000000; // ₦10,000 of laundry a month
  const exampleMonthly = Math.round(exampleBill * pct / 100);
  const requested = Boolean(request && ["new", "contacted", "invited"].includes(request.status));

  const steps: { kind: Parameters<typeof StepIcon>[0]["kind"]; title: string; body: string }[] = [
    { kind: "apply", title: "Tell us you're interested", body: "Tap the button below. Our team calls or WhatsApps you and sends you an invitation to set up your agent account." },
    { kind: "hub", title: "Visit the hub", body: "Bring a valid ID for a quick identity check, and we walk you through how LaundryPoint works: pickups, payments and customer care." },
    { kind: "sign", title: "Accept the agent terms", body: "Read and accept the commission agent terms in the app. Once approved, your agent account is switched on." },
    { kind: "share", title: "Bring in customers", body: "Invite people you know: neighbours, offices, hostels, shops. They sign up through your referral, so they're linked to you." },
    { kind: "earn", title: "Earn on every paid order", body: `You earn ${pct}% of what your customers pay for laundry, on every paid and delivered order for ${t.months} months after they join.` },
  ];

  return (
    <main id="main" className="min-h-screen w-full">
      <CustomerSidebar name={profile?.full_name || user.email || "Customer"} />
      <div className="container-page mx-auto max-w-3xl space-y-8 py-4 sm:py-6">
        <SettingsTabs current="/account/partner" />

        <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white sm:p-8">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full border-[28px] border-white/5" aria-hidden="true" />
          <p className="text-sm font-medium text-orange-300">Become a LaundryPoint commission agent</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Earn {pct}% on every customer you bring</h2>
          <p className="mt-3 max-w-xl text-sm text-slate-300">Introduce people to LaundryPoint and earn a share of what they spend on laundry for {t.months} months. Work in your own time, around your own schedule.</p>
          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            {[[`${pct}%`, "of their laundry bills"], [`${t.months} months`, "of earnings per customer"], ["Weekly", "payouts"]].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-white/10 p-4"><dt className="sr-only">{l}</dt><dd><span className="block text-2xl font-semibold">{v}</span><span className="text-sm text-slate-300">{l}</span></dd></div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="how-h" className="space-y-4">
          <h2 id="how-h" className="text-lg font-semibold">How it works</h2>
          <ol className="relative space-y-4 border-l-2 border-dashed border-orange-200 pl-6">
            {steps.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                <div className="card flex gap-4 p-4">
                  <span className="shrink-0 text-brand-dark"><StepIcon kind={s.kind} /></span>
                  <div><h3 className="font-semibold">{s.title}</h3><p className="mt-1 text-sm text-ink-soft">{s.body}</p></div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="example-h" className="card space-y-3 p-5">
          <h2 id="example-h" className="text-lg font-semibold">An example</h2>
          <p className="text-sm text-ink-soft">You bring in 10 customers. Each spends about {naira(exampleBill)} on laundry a month.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-canvas p-4 text-sm"><span className="block text-ink-soft">Per customer, per month</span><strong className="text-xl">{naira(exampleMonthly)}</strong></div>
            <div className="rounded-xl bg-canvas p-4 text-sm"><span className="block text-ink-soft">10 customers, per month</span><strong className="text-xl">{naira(exampleMonthly * 10)}</strong></div>
            <div className="rounded-xl bg-brand-tint p-4 text-sm"><span className="block text-brand-dark">Over {t.months} months</span><strong className="text-xl text-brand-dark">{naira(exampleMonthly * 10 * t.months)}</strong></div>
          </div>
          <p className="text-xs text-ink-mute">Illustration only. What you earn depends on what your customers actually pay.</p>
        </section>

        <section aria-labelledby="rules-h" className="card space-y-3 p-5">
          <h2 id="rules-h" className="text-lg font-semibold">Good to know</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-ink-soft">
            <li>Commission is earned when your customer&apos;s order is paid and delivered. Refunded or cancelled orders don&apos;t count.</li>
            <li>A new customer&apos;s first order must be at least {naira(t.min_first_order_kobo)} to count.</li>
            <li>Each commission is held for {t.hold_hours} hours, then paid out weekly once your balance reaches {naira(t.min_payout_kobo)}.</li>
            <li>Customers always pay LaundryPoint directly online or at the hub. Agents never collect customer money.</li>
            <li>Commission is for bringing customers, not for recruiting other agents. It is not a salary.</li>
          </ul>
        </section>

        <section aria-labelledby="join-h" className="card space-y-3 border-brand/40 p-5">
          <h2 id="join-h" className="text-lg font-semibold">Interested?</h2>
          <p className="text-sm text-ink-soft">Tell us and we&apos;ll be in touch. There&apos;s no cost to apply and no commitment until you accept the agent terms.</p>
          <PartnerInterestButton requested={requested} />
        </section>
      </div>
    </main>
  );
}
