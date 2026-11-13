import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { AREA_PAGES, JsonLd, SITE_URL, businessJsonLd } from "@/lib/seo";
import { CLEANING_AREA_SLUGS, CLEANING_GENERAL_FAQS, CLEANING_SERVICE_PAGES, getCleaningInfo } from "@/lib/cleaning-seo";
import { nairaK } from "@/lib/cleaning";
import { CallButtons, FaqList, InspectionNote, StickyCall, crumbsJsonLd, faqJsonLd, serviceJsonLd } from "@/components/cleaning/Public";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return CLEANING_SERVICE_PAGES.map((s) => ({ service: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ service: string }> }): Promise<Metadata> {
  const { service } = await params;
  const s = CLEANING_SERVICE_PAGES.find((x) => x.slug === service);
  if (!s) return {};
  return { title: s.title, description: s.description, keywords: s.keywords, alternates: { canonical: `/cleaning/${s.slug}` }, openGraph: { title: `${s.title} | LaundryPoint`, url: `${SITE_URL}/cleaning/${s.slug}` } };
}

export default async function CleaningServicePage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params;
  const s = CLEANING_SERVICE_PAGES.find((x) => x.slug === service);
  if (!s) notFound();
  const [{ settings, zones }, info] = await Promise.all([getSiteData(), getCleaningInfo()]);
  const b = settings.business;
  const areas = CLEANING_AREA_SLUGS.map((x) => AREA_PAGES.find((a) => a.slug === x)).filter((a) => a != null);
  const faqs = [...s.faqs, ...CLEANING_GENERAL_FAQS.slice(0, 4)];
  const deepFrom = s.service === "deep" ? info?.examples?.find((e) => e.label.startsWith("2 bedroom"))?.deep_kobo : null;
  const others = CLEANING_SERVICE_PAGES.filter((x) => x.slug !== s.slug);
  return (
    <>
      <JsonLd data={businessJsonLd(settings, zones.map((z) => z.name))} />
      <JsonLd data={serviceJsonLd(s.name, s.description, `/cleaning/${s.slug}`, areas.map((a) => a.name))} />
      <JsonLd data={faqJsonLd(faqs)} />
      <JsonLd data={crumbsJsonLd([{ name: "Home", path: "/" }, { name: "Cleaning", path: "/cleaning" }, { name: s.name, path: `/cleaning/${s.slug}` }])} />
      <Header name={b.name} />
      <main id="main" className="section pb-28 sm:pb-16">
        <div className="container-page max-w-3xl space-y-10">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-soft"><Link href="/" className="underline">Home</Link> / <Link href="/cleaning" className="underline">Cleaning</Link> / {s.name}</nav>
          <header>
            <p className="eyebrow">Cleaning in Awka</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{s.h1}</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">{s.intro}</p>
            {deepFrom ? <p className="mt-3 font-medium">A 2-bedroom flat deep clean starts from {nairaK(deepFrom)}.</p> : null}
            <div className="mt-6"><CallButtons quoteHref={`/cleaning/request?service=${s.service}`} /></div>
          </header>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">What is included</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-soft">{s.includes.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="mt-3 text-sm text-ink-soft">We bring the supplies and tools. Add-ons such as inside the fridge or oven, sofa and mattress cleaning are listed with their price on your quote.</p>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Good for</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-soft">{s.goodFor.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Price</h2>
            <p className="mt-3 leading-7 text-ink-soft">Every job is priced from the rooms, the type of clean and the condition, plus crew transport from our Ifite hub. You see each line before you pay.</p>
            <div className="mt-2"><InspectionNote info={info} /></div>
            <p className="mt-2 text-sm"><Link href="/cleaning" className="underline">See guide prices</Link></p>
          </section>
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
            <div className="mt-4"><FaqList faqs={faqs} /></div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Where we clean</h2>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">{areas.map((a) => <Link key={a.slug} href={`/house-cleaning/${a.slug}`} className="underline">{a.name}</Link>)}</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Other cleaning services</h2>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">{others.map((o) => <Link key={o.slug} href={`/cleaning/${o.slug}`} className="underline">{o.name}</Link>)}<Link href="/cleaning/plans" className="underline">Monthly plans</Link></p>
          </section>
          <CallButtons quoteHref={`/cleaning/request?service=${s.service}`} />
        </div>
      </main>
      <Footer name={b.name} mapsUrl={settings.hub.maps_url} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
      <StickyCall />
    </>
  );
}
