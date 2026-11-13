import Link from "next/link";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { JsonLd, SITE_URL } from "@/lib/seo";
import { getCleaningInfo } from "@/lib/cleaning-seo";
import { CallButtons, FaqList, PlanTable, StickyCall, crumbsJsonLd, faqJsonLd, serviceJsonLd } from "@/components/cleaning/Public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Home Complete: House Cleaning and Laundry in Awka",
  description: "One plan for a clean home and clean clothes in Awka: weekly house cleaning plus laundry with free pickup and delivery, and an extra discount.",
  keywords: ["cleaning and laundry Awka", "house cleaning and laundry service Awka", "home services Awka", "laundry and cleaning subscription Awka"],
  alternates: { canonical: "/cleaning/home-complete" },
  openGraph: { title: "Home Complete: cleaning and laundry in Awka", url: `${SITE_URL}/cleaning/home-complete` },
};

export default async function HomeCompletePage() {
  const [{ settings }, info] = await Promise.all([getSiteData(), getCleaningInfo()]);
  const b = settings.business;
  const pct = info?.bundle_discount_pct ?? 0;
  const faqs = [
    { q: "What does Home Complete include?", a: `A monthly cleaning plan, plus free pickup and delivery for your laundry for as long as the cleaning plan is paid${pct ? `, and an extra ${pct}% off the cleaning price` : ""}.` },
    { q: "Is the laundry itself free?", a: "No. Laundry is charged as usual, per item or through a laundry monthly plan. What is free is the pickup and delivery." },
    { q: "How do I send my laundry?", a: "Book a laundry pickup in your account as normal and the transport shows as free. On cleaning days you can also hand a laundry bag to the crew lead, who brings it to the hub." },
    { q: "What happens if I stop the cleaning plan?", a: "Free laundry pickup ends with the last paid day of the cleaning plan. Your laundry account and any laundry plan carry on as normal." },
  ];
  return (
    <>
      <JsonLd data={serviceJsonLd("Home Complete: cleaning and laundry", "Monthly house cleaning plus laundry with free pickup and delivery in Awka.", "/cleaning/home-complete", ["Awka"])} />
      <JsonLd data={faqJsonLd(faqs)} />
      <JsonLd data={crumbsJsonLd([{ name: "Home", path: "/" }, { name: "Cleaning", path: "/cleaning" }, { name: "Home Complete", path: "/cleaning/home-complete" }])} />
      <Header name={b.name} />
      <main id="main" className="section pb-28 sm:pb-16">
        <div className="container-page max-w-3xl space-y-10">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-soft"><Link href="/" className="underline">Home</Link> / <Link href="/cleaning" className="underline">Cleaning</Link> / Home Complete</nav>
          <header>
            <p className="eyebrow">Cleaning plus laundry</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Home Complete: a clean home and clean clothes</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">Weekly or fortnightly house cleaning from our crews, and your laundry washed, dried and ironed at our Ifite hub with free pickup and delivery. One company, one account.</p>
            <div className="mt-6"><CallButtons quoteHref="/cleaning/request?plan=1" /></div>
          </header>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">What you get</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-soft">
              <li>A cleaning plan of your choice, starting with a deep clean</li>
              <li>Free laundry pickup and delivery while the cleaning plan is paid</li>
              {pct > 0 && <li>An extra {pct}% off the cleaning price</li>}
              <li>One account for bookings, bills and arrival codes</li>
            </ul>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Cleaning plans to choose from</h2>
            <div className="mt-4"><PlanTable info={info} /></div>
            <p className="mt-3 text-sm"><Link href="/cleaning/plans" className="underline">How cleaning plans work</Link> · <Link href="/subscriptions" className="underline">Laundry monthly plans</Link></p>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
            <div className="mt-4"><FaqList faqs={faqs} /></div>
          </section>
          <CallButtons quoteHref="/cleaning/request?plan=1" />
        </div>
      </main>
      <Footer name={b.name} mapsUrl={settings.hub.maps_url} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
      <StickyCall />
    </>
  );
}
