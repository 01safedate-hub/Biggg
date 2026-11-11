import { HubPhotos } from "@/components/landing/HubPhotos";
import Link from "next/link";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { AREA_PAGES, JsonLd, businessJsonLd, clock } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Areas We Cover: Laundry Pickup Across Awka and Nearby Towns",
  description: "LaundryPoint picks up and delivers laundry within 15 km of our Ifite hub: Awka, Ifite, Amawbia, Okpuno, Nibo, Nise, Mbaukwu, Isiagu, Amansea, Achalla, Ebenebe, Umuawulu and more.",
  alternates: { canonical: "/areas" },
};

export default async function AreasPage() {
  const { settings, zones } = await getSiteData();
  const b = settings.business;
  const pages = new Map<string, string>(AREA_PAGES.map((a) => [a.name.toLowerCase(), a.slug]));
  const names = Array.from(new Set(zones.map((z) => (z.name === "Ifite-Awka" ? "Ifite" : z.name)))).sort();
  return (
    <>
      <JsonLd data={businessJsonLd(settings, zones.map((z) => z.name))} />
      <Header name={b.name} />
      <main id="main" className="section">
        <div className="container-page max-w-3xl space-y-8">
          <header>
            <p className="eyebrow">Coverage</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Laundry pickup across Awka and nearby towns</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">We pick up and deliver anywhere within about 15 km of our hub in Ifite, Awka, across Awka South and Awka North. The transport fare grows with distance, and you always see it before you pay. Open {clock(b.opening_time)} to {clock(b.closing_time)}.</p>
          </header>
          <section className="card p-5">
            <h2 className="text-lg font-semibold">Towns with their own page</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{AREA_PAGES.map((a) => <li key={a.slug}><Link href={`/laundry/${a.slug}`} className="font-medium underline">Laundry in {a.name}</Link> <span className="text-sm text-ink-soft">· {a.lga}</span></li>)}</ul>
          </section>
          <section className="card p-5">
            <h2 className="text-lg font-semibold">Every area we serve</h2>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">{names.map((n) => pages.has(n.toLowerCase()) ? <Link key={n} href={`/laundry/${pages.get(n.toLowerCase())}`} className="underline">{n}</Link> : <span key={n}>{n}</span>)}</p>
            <p className="mt-4 text-sm text-ink-soft">Not listed? If your address is within about 15 km of Ifite, the booking page checks it for you. <Link href="/request" className="font-medium underline">Check my address</Link></p>
          </section>
          <div className="card p-5"><HubPhotos compact mapsUrl={settings.hub.maps_url} /></div>
        </div>
      </main>
      <Footer name={b.name} mapsUrl={settings.hub.maps_url} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
    </>
  );
}
