import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { AREA_PAGES, JsonLd, SITE_URL, businessJsonLd } from "@/lib/seo";
import { CLEANING_AREA_SLUGS, CLEANING_AREA_TEXT, CLEANING_GENERAL_FAQS, CLEANING_SERVICE_PAGES, getCleaningInfo } from "@/lib/cleaning-seo";
import { CallButtons, FaqList, InspectionNote, PlanTable, PriceExamples, StickyCall, crumbsJsonLd, faqJsonLd, serviceJsonLd } from "@/components/cleaning/Public";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return CLEANING_AREA_SLUGS.map((area) => ({ area }));
}

function findArea(slug: string) {
  return CLEANING_AREA_SLUGS.includes(slug) ? AREA_PAGES.find((a) => a.slug === slug) ?? null : null;
}

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const a = findArea((await params).area);
  if (!a) return {};
  return {
    title: `House Cleaning Services in ${a.name}, Awka`,
    description: `Home, office and deep cleaning in ${a.name}, Awka. Clear prices, we bring supplies, monthly plans available. Call or WhatsApp 0913 258 4627.`,
    keywords: [`house cleaning ${a.name}`, `cleaning services ${a.name}`, `cleaners in ${a.name}`, `deep cleaning ${a.name}`, `office cleaning ${a.name}`],
    alternates: { canonical: `/house-cleaning/${a.slug}` },
    openGraph: { title: `House cleaning in ${a.name}, Awka`, url: `${SITE_URL}/house-cleaning/${a.slug}` },
  };
}

export default async function HouseCleaningArea({ params }: { params: Promise<{ area: string }> }) {
  const a = findArea((await params).area);
  if (!a) notFound();
  const [{ settings, zones }, info] = await Promise.all([getSiteData(), getCleaningInfo()]);
  const b = settings.business;
  const others = CLEANING_AREA_SLUGS.filter((s) => s !== a.slug).map((s) => AREA_PAGES.find((x) => x.slug === s)).filter((x) => x != null);
  const faqs = [
    { q: `Do you clean homes in ${a.name}?`, a: `Yes. ${a.name} is in our cleaning area. Request a quote online, or call or WhatsApp 0913 258 4627.` },
    ...CLEANING_GENERAL_FAQS,
  ];
  return (
    <>
      <JsonLd data={businessJsonLd(settings, zones.map((z) => z.name))} />
      <JsonLd data={serviceJsonLd(`House cleaning in ${a.name}`, `Home, office and deep cleaning in ${a.name}, Awka.`, `/house-cleaning/${a.slug}`, [a.name])} />
      <JsonLd data={faqJsonLd(faqs)} />
      <JsonLd data={crumbsJsonLd([{ name: "Home", path: "/" }, { name: "Cleaning", path: "/cleaning" }, { name: a.name, path: `/house-cleaning/${a.slug}` }])} />
      <Header name={b.name} />
      <main id="main" className="section pb-28 sm:pb-16">
        <div className="container-page max-w-3xl space-y-10">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-soft"><Link href="/" className="underline">Home</Link> / <Link href="/cleaning" className="underline">Cleaning</Link> / {a.name}</nav>
          <header>
            <p className="eyebrow">{a.lga}, Anambra</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">House cleaning in {a.name}</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">{CLEANING_AREA_TEXT[a.slug] ?? a.note} Our crews come from our hub in Ifite with their own supplies, follow a room-by-room checklist, and you sign off before they leave.</p>
            <div className="mt-6"><CallButtons /></div>
          </header>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Guide prices in {a.name}</h2>
            <div className="mt-4"><PriceExamples info={info} /></div>
            <div className="mt-3"><InspectionNote info={info} /></div>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Cleaning services in {a.name}</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              <li><Link href="/cleaning/plans" className="card block p-4 text-sm font-medium hover:border-brand">Weekly home cleaning (monthly plans)</Link></li>
              {CLEANING_SERVICE_PAGES.map((s) => <li key={s.slug}><Link href={`/cleaning/${s.slug}`} className="card block p-4 text-sm font-medium hover:border-brand">{s.name}</Link></li>)}
            </ul>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Monthly plans</h2>
            <div className="mt-4"><PlanTable info={info} /></div>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Questions from {a.name}</h2>
            <div className="mt-4"><FaqList faqs={faqs} /></div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Also in {a.name}</h2>
            <p className="mt-2 text-sm"><Link href={`/laundry/${a.slug}`} className="underline">Laundry pickup and delivery in {a.name}</Link> · <Link href="/cleaning/home-complete" className="underline">Cleaning and laundry together</Link></p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">We also clean in</h2>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">{others.map((o) => <Link key={o.slug} href={`/house-cleaning/${o.slug}`} className="underline">{o.name}</Link>)}</p>
          </section>
          <CallButtons />
        </div>
      </main>
      <Footer name={b.name} mapsUrl={settings.hub.maps_url} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
      <StickyCall />
    </>
  );
}
