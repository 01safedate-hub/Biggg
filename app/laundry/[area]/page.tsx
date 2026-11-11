import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { createPublicClient } from "@/lib/supabase/public";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { AREA_PAGES, JsonLd, SERVICES, SITE_URL, businessJsonLd, clock } from "@/lib/seo";
import { naira } from "@/lib/format";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return AREA_PAGES.map((a) => ({ area: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params;
  const a = AREA_PAGES.find((x) => x.slug === area);
  if (!a) return {};
  return {
    title: `Laundry and Dry Cleaning in ${a.name}, Awka: Pickup and Delivery`,
    description: `Laundry pickup and delivery in ${a.name} (${a.lga}, Anambra). Washing, drying, ironing and dry cleaning from our Ifite hub. See your fare before you book. Open 9am to 6pm.`,
    alternates: { canonical: `/laundry/${a.slug}` },
    openGraph: { title: `Laundry pickup and delivery in ${a.name}`, url: `${SITE_URL}/laundry/${a.slug}` },
  };
}

type Quote = { served?: boolean; distance_km?: number; fare_kobo?: number; delivery_fare_kobo?: number };

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  const a = AREA_PAGES.find((x) => x.slug === area);
  if (!a) notFound();
  const { settings, zones } = await getSiteData();
  let q: Quote = {};
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const { data } = await createPublicClient().rpc("quote_pickup", { _lat: a.lat, _lng: a.lng });
      q = (data ?? {}) as Quote;
    }
  } catch { /* the page still renders without a live fare */ }
  const b = settings.business;
  const hours = `${clock(b.opening_time)} to ${clock(b.closing_time)}`;
  const mapsUrl = settings.hub.maps_url;
  const near = AREA_PAGES.filter((x) => x.slug !== a.slug).slice(0, 6);
  const faqs = [
    { q: `Do you pick up laundry in ${a.name}?`, a: `Yes. ${a.name} is inside our service area${q.distance_km ? `, about ${q.distance_km.toFixed(1)} km from our Ifite hub` : ""}. Book on the website or on WhatsApp and an agent comes to you.` },
    { q: `How much is pickup in ${a.name}?`, a: q.fare_kobo ? `Pickup from central ${a.name} is about ${naira(q.fare_kobo)}, and delivery back is about ${naira(q.delivery_fare_kobo ?? q.fare_kobo)}. The exact fare depends on your address and is shown before you pay.` : "The transport fare depends on the distance from our hub to your address. You see it before you pay." },
    { q: "How fast do I get my clothes back?", a: "Speed is our focus. We wash and dry with our own machines, so clothes do not wait for sunshine. Instant service is available for selected items." },
    { q: "When are you open?", a: `${hours}, every day. You can book after hours too: the pickup is scheduled for the next morning.` },
  ];

  return (
    <>
      <JsonLd data={businessJsonLd(settings, zones.map((z) => z.name))} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Areas", item: `${SITE_URL}/areas` },
        { "@type": "ListItem", position: 3, name: a.name, item: `${SITE_URL}/laundry/${a.slug}` }] }} />
      <Header name={b.name} />
      <main id="main" className="section">
        <div className="container-page max-w-3xl space-y-10">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-soft"><Link href="/" className="underline">Home</Link> / <Link href="/areas" className="underline">Areas</Link> / {a.name}</nav>
          <header>
            <p className="eyebrow">{a.lga}, Anambra</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Laundry pickup and delivery in {a.name}</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">{a.note} We collect your clothes, count them with you, wash, dry and iron them at our hub, and bring them back. <strong className="text-ink">Get your clothes fast.</strong></p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/request" className="btn-primary">Book a pickup</Link><Link href="/services" className="btn-secondary">See services and prices</Link></div>
          </header>

          <section className="grid gap-4 sm:grid-cols-3" aria-label={`LaundryPoint in ${a.name}`}>
            <div className="card p-5"><p className="text-sm text-ink-soft">Distance from our hub</p><p className="mt-1 text-2xl font-bold">{q.distance_km ? `${q.distance_km.toFixed(1)} km` : "Within 15 km"}</p></div>
            <div className="card p-5"><p className="text-sm text-ink-soft">Pickup fare from</p><p className="mt-1 text-2xl font-bold">{q.fare_kobo ? naira(q.fare_kobo) : "Shown at booking"}</p></div>
            <div className="card p-5"><p className="text-sm text-ink-soft">Open</p><p className="mt-1 text-2xl font-bold">{hours}</p></div>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">What we clean</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">{SERVICES.map((s) => <li key={s} className="card p-4 text-sm font-medium">{s}</li>)}</ul>
            <p className="mt-4 text-sm text-ink-soft">Most laundries around Awka dry clothes on the line and wait for the weather. We wash and dry with our own machines, so your clothes come back sooner. Lodges, hostels and businesses in {a.name} can also ask for a custom rate.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-ink-soft">
              <li>Book a pickup and pay the transport fare. You see the amount first.</li>
              <li>An agent comes to your address in {a.name}. You enter your code when they arrive.</li>
              <li>We count your clothes with you and you get the bill on your phone.</li>
              <li>We clean them at our Ifite hub and deliver them back, or you collect them free.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">Questions from {a.name}</h2>
            <div className="mt-4 divide-y divide-line border-y border-line">
              {faqs.map((f) => <details key={f.q} className="py-4"><summary className="cursor-pointer font-semibold">{f.q}</summary><p className="mt-2 text-sm leading-6 text-ink-soft">{f.a}</p></details>)}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-semibold">Our hub</h2>
            <p className="mt-1 text-sm text-ink-soft">{settings.hub.address ?? "Ifite, Awka"}</p>
            {mapsUrl && <a href={mapsUrl} className="mt-2 inline-block text-sm font-medium underline" target="_blank" rel="noreferrer">Open in Google Maps</a>}
          </section>

          <section>
            <h2 className="text-lg font-semibold">We also serve</h2>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">{near.map((n) => <Link key={n.slug} href={`/laundry/${n.slug}`} className="underline">{n.name}</Link>)}<Link href="/areas" className="font-medium underline">All areas</Link></p>
          </section>
        </div>
      </main>
      <Footer name={b.name} mapsUrl={mapsUrl} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
    </>
  );
}
