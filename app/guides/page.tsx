import Link from "next/link";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { JsonLd, SITE_URL } from "@/lib/seo";
import { GUIDES } from "@/lib/guides";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Laundry and Cleaning Guides for Awka: Prices, Pickup and Care",
  description: "Helpful guides from LaundryPoint: laundry and house cleaning prices in Awka, pickup and delivery, deep cleaning checklists, student laundry near Unizik and clothes care.",
  alternates: { canonical: "/guides" },
};

export default async function GuidesPage() {
  const { settings } = await getSiteData();
  const b = settings.business;
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList",
        itemListElement: GUIDES.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/guides/${g.slug}`, name: g.h1 })) }} />
      <Header name={b.name} />
      <main id="main" className="section">
        <div className="container-page max-w-3xl space-y-8">
          <header>
            <p className="eyebrow">Guides</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Laundry and cleaning guides for Awka</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">Honest answers about laundry and house cleaning prices, pickup, dry cleaning, deep cleaning and caring for your clothes, from the team at LaundryPoint in Ifite.</p>
          </header>
          <ul className="grid gap-4 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <li key={g.slug} className="card p-5">
                <h2 className="text-lg font-semibold"><Link href={`/guides/${g.slug}`} className="hover:underline">{g.h1}</Link></h2>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{g.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer name={b.name} mapsUrl={settings.hub.maps_url} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
    </>
  );
}
