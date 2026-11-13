import Link from "next/link";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { JsonLd, SITE_URL, businessJsonLd } from "@/lib/seo";
import { CLEANING_AREA_SLUGS, CLEANING_GENERAL_FAQS, CLEANING_SERVICE_PAGES, getCleaningInfo } from "@/lib/cleaning-seo";
import { AREA_PAGES } from "@/lib/seo";
import { GUIDES } from "@/lib/guides";
import { CallButtons, FaqList, InspectionNote, PlanTable, PriceExamples, StickyCall, crumbsJsonLd, faqJsonLd, serviceJsonLd } from "@/components/cleaning/Public";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "House Cleaning Services in Awka: Deep Cleaning and Monthly Plans",
  description: "Professional home, office and deep cleaning in Awka, Ifite, Unizik, Temp Site, Aroma and Amawbia. Clear prices, trained crews, we bring supplies. Call or WhatsApp 0913 258 4627.",
  keywords: ["cleaning services in Awka", "house cleaning Awka", "home cleaning Awka", "cleaners in Awka", "deep cleaning Awka", "office cleaning Awka", "cleaning company Awka", "cleaning services Anambra", "monthly house cleaning Awka"],
  alternates: { canonical: "/cleaning" },
  openGraph: { title: "House cleaning services in Awka | LaundryPoint", url: `${SITE_URL}/cleaning` },
};

const STEPS = [
  ["Ask for a quote", "Online, by phone or on WhatsApp. Tell us the rooms and what you need."],
  ["We quote", "From photos for small homes, or after a short inspection. You see every line of the price."],
  ["Pick a day and pay", "Choose a free day, then pay online or at our Ifite hub. Your day is confirmed straight away."],
  ["We clean, you sign off", "The crew starts with your arrival code, follows a checklist, and finishes with your completion code."],
];

export default async function CleaningHome() {
  const [{ settings, zones }, info] = await Promise.all([getSiteData(), getCleaningInfo()]);
  const b = settings.business;
  const areas = CLEANING_AREA_SLUGS.map((s) => AREA_PAGES.find((a) => a.slug === s)).filter((a) => a != null);
  const guides = GUIDES.filter((g) => g.topic === "cleaning");
  return (
    <>
      <JsonLd data={businessJsonLd(settings, zones.map((z) => z.name))} />
      <JsonLd data={serviceJsonLd("House cleaning", "Home, office, deep and post-construction cleaning in Awka with monthly plans.", "/cleaning", areas.map((a) => a.name))} />
      <JsonLd data={faqJsonLd(CLEANING_GENERAL_FAQS)} />
      <JsonLd data={crumbsJsonLd([{ name: "Home", path: "/" }, { name: "Cleaning", path: "/cleaning" }])} />
      <Header name={b.name} />
      <main id="main" className="section pb-28 sm:pb-16">
        <div className="container-page max-w-4xl space-y-12">
          <header>
            <p className="eyebrow">Cleaning in Awka</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">House and office cleaning in Awka</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">Trained crews clean your home, office or new building, with our own supplies and a clear price before we start. One-off cleans, deep cleans, and monthly plans that keep your place clean every week. Add our laundry and get <strong className="text-ink">Home Complete</strong>.</p>
            <div className="mt-6"><CallButtons /></div>
          </header>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">Guide prices</h2>
            <div className="mt-4"><PriceExamples info={info} /></div>
            <div className="mt-3"><InspectionNote info={info} /></div>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">What we clean</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link href="/cleaning/plans" className="card p-5 hover:border-brand"><p className="font-semibold">Regular home cleaning</p><p className="mt-1 text-sm text-ink-soft">Weekly or every two weeks, on a monthly plan.</p></Link>
              {CLEANING_SERVICE_PAGES.map((s) => <Link key={s.slug} href={`/cleaning/${s.slug}`} className="card p-5 hover:border-brand"><p className="font-semibold">{s.name}</p><p className="mt-1 text-sm text-ink-soft">{s.description.split(".")[0]}.</p></Link>)}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">Monthly cleaning plans</h2>
            <p className="mt-2 leading-7 text-ink-soft">Every plan starts with a deep clean, then regular visits on the same weekday. Each visit costs less than a one-off clean. Pause when you travel.</p>
            <div className="mt-4"><PlanTable info={info} /></div>
            <p className="mt-3 text-sm"><Link href="/cleaning/plans" className="font-medium underline">How the plans work</Link> · <Link href="/cleaning/home-complete" className="font-medium underline">Home Complete: cleaning plus laundry</Link></p>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">{STEPS.map(([t, d], i) => <li key={t} className="card p-5"><p className="text-sm font-semibold text-brand-dark">Step {i + 1}</p><p className="mt-1 font-semibold">{t}</p><p className="mt-1 text-sm text-ink-soft">{d}</p></li>)}</ol>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">Why people in Awka choose us</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-soft">
              <li>A written price, room by room, before you pay. No haggling at the door.</li>
              <li>We bring the detergents, disinfectant and tools.</li>
              <li>Arrival and completion codes, so only our crew can start and finish your job.</li>
              <li>Missed something? Tell us within 24 hours and we come back free.</li>
              <li>Pay online or at our Ifite hub. Never cash to the crew.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">Cleaning near you</h2>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">{areas.map((a) => <Link key={a.slug} href={`/house-cleaning/${a.slug}`} className="underline">House cleaning in {a.name}</Link>)}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
            <div className="mt-4"><FaqList faqs={CLEANING_GENERAL_FAQS} /></div>
          </section>

          {guides.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Cleaning guides</h2>
              <ul className="mt-2 space-y-2 text-sm">{guides.map((g) => <li key={g.slug}><Link href={`/guides/${g.slug}`} className="underline">{g.h1}</Link></li>)}</ul>
            </section>
          )}
          <CallButtons />
        </div>
      </main>
      <Footer name={b.name} mapsUrl={settings.hub.maps_url} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
      <StickyCall />
    </>
  );
}
