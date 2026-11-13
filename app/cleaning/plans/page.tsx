import Link from "next/link";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { JsonLd, SITE_URL } from "@/lib/seo";
import { getCleaningInfo } from "@/lib/cleaning-seo";
import { CallButtons, FaqList, PlanTable, PriceExamples, StickyCall, crumbsJsonLd, faqJsonLd, serviceJsonLd } from "@/components/cleaning/Public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Monthly House Cleaning Plans in Awka",
  description: "Weekly or fortnightly home cleaning in Awka on a monthly plan. Starts with a deep clean, same day every week, cheaper per visit, pause when you travel.",
  keywords: ["monthly cleaning Awka", "weekly house cleaning Awka", "cleaning subscription Awka", "regular cleaner Awka", "house help alternative Awka"],
  alternates: { canonical: "/cleaning/plans" },
  openGraph: { title: "Monthly house cleaning plans in Awka", url: `${SITE_URL}/cleaning/plans` },
};

const FAQS = [
  { q: "What day do you come?", a: "You choose the first visit. Regular visits are on the same weekday after that, morning or afternoon." },
  { q: "Why does the plan start with a deep clean?", a: "Regular visits keep a clean home clean. The first deep clean brings it to that standard, so every visit after is quicker and cheaper." },
  { q: "Can I pause?", a: "Yes. Pause for up to 31 days a year with 7 days notice, for example when you travel. Your paid period moves back by the paused days." },
  { q: "What if you have to cancel a visit?", a: "If we cancel, you get a free credit visit to book on any free day within 60 days." },
  { q: "Can I pay for several months?", a: "Yes. Pay 3, 6 or 12 months ahead and save more. Plans renew only when you pay; we remind you 3 days before." },
  { q: "Can I stop?", a: "Yes. End the plan in your account at any time. It stops at the end of the period you paid for." },
];

export default async function CleaningPlansPage() {
  const [{ settings }, info] = await Promise.all([getSiteData(), getCleaningInfo()]);
  const b = settings.business;
  return (
    <>
      <JsonLd data={serviceJsonLd("Monthly house cleaning plan", "Regular home cleaning in Awka on a monthly plan.", "/cleaning/plans", ["Awka"])} />
      <JsonLd data={faqJsonLd(FAQS)} />
      <JsonLd data={crumbsJsonLd([{ name: "Home", path: "/" }, { name: "Cleaning", path: "/cleaning" }, { name: "Monthly plans", path: "/cleaning/plans" }])} />
      <Header name={b.name} />
      <main id="main" className="section pb-28 sm:pb-16">
        <div className="container-page max-w-3xl space-y-10">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-soft"><Link href="/" className="underline">Home</Link> / <Link href="/cleaning" className="underline">Cleaning</Link> / Monthly plans</nav>
          <header>
            <p className="eyebrow">Cleaning plans</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Monthly house cleaning in Awka</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">The same crew standard every week, without hiring a house help. We start with a deep clean, then come back on your day. Each visit costs less than a one-off clean.</p>
            <div className="mt-6"><CallButtons quoteHref="/cleaning/request?plan=1" /></div>
          </header>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Plans</h2>
            <div className="mt-4"><PlanTable info={info} /></div>
            <p className="mt-3 text-sm text-ink-soft">Need more visits, a lodge, an office or several flats? We also build custom plans: you choose the number of visits a month and we price it for your place.</p>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">What a visit costs</h2>
            <p className="mt-2 text-sm text-ink-soft">Your monthly price is your home&apos;s standard visit price, times the visits, minus the plan saving. Guide prices for one standard visit:</p>
            <div className="mt-3"><PriceExamples info={info} /></div>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Add laundry: Home Complete</h2>
            <p className="mt-2 leading-7 text-ink-soft">Put cleaning and laundry together. The crew collects your laundry bag, our hub washes and irons it, and pickup and delivery are free while your plan is paid{info?.bundle_discount_pct ? `, with an extra ${info.bundle_discount_pct}% off the cleaning` : ""}. <Link href="/cleaning/home-complete" className="font-medium underline">How Home Complete works</Link></p>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
            <div className="mt-4"><FaqList faqs={FAQS} /></div>
          </section>
          <CallButtons quoteHref="/cleaning/request?plan=1" />
        </div>
      </main>
      <Footer name={b.name} mapsUrl={settings.hub.maps_url} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
      <StickyCall />
    </>
  );
}
