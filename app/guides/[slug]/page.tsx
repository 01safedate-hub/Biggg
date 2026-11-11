import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSiteData } from "@/lib/site-data";
import { createPublicClient } from "@/lib/supabase/public";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { HubPhotos } from "@/components/landing/HubPhotos";
import { AREA_PAGES, JsonLd, SITE_URL, businessJsonLd } from "@/lib/seo";
import { GUIDES, findGuide } from "@/lib/guides";
import { naira } from "@/lib/format";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = findGuide((await params).slug);
  if (!g) return {};
  return {
    title: g.title,
    description: g.description,
    keywords: g.keywords,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { type: "article", title: g.h1, description: g.description, url: `${SITE_URL}/guides/${g.slug}` },
  };
}

async function livePrices(names: string[]) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
    const { data } = await createPublicClient().from("items").select("name,price_kobo").eq("active", true).in("name", names);
    const rows = (data ?? []) as { name: string; price_kobo: number }[];
    return names.flatMap((n) => rows.filter((r) => r.name === n).slice(0, 1));
  } catch { return []; }
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = findGuide((await params).slug);
  if (!g) notFound();
  const { settings, plans, zones } = await getSiteData();
  const b = settings.business;
  const priceBlocks = await Promise.all(g.sections.map((s) => (s.live?.startsWith("prices:") ? livePrices(s.live.slice(7).split("|")) : Promise.resolve(null))));
  const areas = g.areas.map((s) => AREA_PAGES.find((a) => a.slug === s)).filter((a) => a != null);
  const others = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 4);
  const url = `${SITE_URL}/guides/${g.slug}`;

  return (
    <>
      <JsonLd data={businessJsonLd(settings, zones.map((z) => z.name))} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", headline: g.h1, description: g.description, datePublished: g.published, dateModified: g.published, mainEntityOfPage: url,
        author: { "@type": "Organization", name: b.name, url: SITE_URL }, publisher: { "@id": `${SITE_URL}/#business` }, image: `${SITE_URL}/hub/front-desk.jpg` }} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
        { "@type": "ListItem", position: 3, name: g.h1, item: url }] }} />
      <Header name={b.name} />
      <main id="main" className="section">
        <article className="container-page max-w-3xl space-y-10">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-soft"><Link href="/" className="underline">Home</Link> / <Link href="/guides" className="underline">Guides</Link></nav>
          <header>
            <p className="eyebrow">LaundryPoint guide</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{g.h1}</h1>
            <p className="mt-4 text-lg leading-8 text-ink-soft">{g.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/request" className="btn-primary">Book a pickup</Link><Link href="/areas" className="btn-secondary">Check your area</Link></div>
          </header>

          {g.sections.map((s, i) => {
            const prices = priceBlocks[i];
            return (
              <section key={s.h2}>
                <h2 className="text-2xl font-bold tracking-tight">{s.h2}</h2>
                {s.p?.map((t) => <p key={t} className="mt-3 leading-7 text-ink-soft">{t}</p>)}
                {s.list && <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-soft">{s.list.map((t) => <li key={t}>{t}</li>)}</ul>}
                {prices && prices.length > 0 && (
                  <table className="mt-4 w-full overflow-hidden rounded-lg border border-line text-sm">
                    <thead className="bg-canvas text-left"><tr><th scope="col" className="px-4 py-2 font-semibold">Item</th><th scope="col" className="px-4 py-2 text-right font-semibold">Price</th></tr></thead>
                    <tbody className="divide-y divide-line">{prices.map((r) => <tr key={r.name}><td className="px-4 py-2">{r.name}</td><td className="px-4 py-2 text-right tabular-nums">{naira(r.price_kobo)}</td></tr>)}</tbody>
                  </table>
                )}
                {s.live === "plans" && plans.length > 0 && (
                  <table className="mt-4 w-full overflow-hidden rounded-lg border border-line text-sm">
                    <thead className="bg-canvas text-left"><tr><th scope="col" className="px-4 py-2 font-semibold">Plan</th><th scope="col" className="px-4 py-2 text-right font-semibold">Per month</th><th scope="col" className="px-4 py-2 text-right font-semibold">Pieces</th><th scope="col" className="px-4 py-2 text-right font-semibold">Per piece</th></tr></thead>
                    <tbody className="divide-y divide-line">{plans.map((p) => (
                      <tr key={p.id}><td className="px-4 py-2">{p.name}</td><td className="px-4 py-2 text-right tabular-nums">{naira(p.monthly_price_kobo)}</td><td className="px-4 py-2 text-right tabular-nums">{p.pieces_per_month}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{p.pieces_per_month > 0 ? naira(Math.round(p.monthly_price_kobo / p.pieces_per_month)) : "–"}</td></tr>
                    ))}</tbody>
                  </table>
                )}
                {s.live === "plans" && <p className="mt-2 text-sm"><Link href="/subscriptions" className="font-medium underline">See what each plan includes</Link></p>}
              </section>
            );
          })}

          <section>
            <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
            <div className="mt-4 divide-y divide-line border-y border-line">
              {g.faqs.map((f) => <details key={f.q} className="py-4"><summary className="cursor-pointer font-semibold">{f.q}</summary><p className="mt-2 text-sm leading-6 text-ink-soft">{f.a}</p></details>)}
            </div>
          </section>

          <div className="card p-5"><HubPhotos compact mapsUrl={settings.hub.maps_url} /></div>

          <section>
            <h2 className="text-lg font-semibold">Laundry pickup near you</h2>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">{areas.map((a) => <Link key={a.slug} href={`/laundry/${a.slug}`} className="underline">Laundry in {a.name}</Link>)}<Link href="/areas" className="font-medium underline">All areas</Link></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">More guides</h2>
            <ul className="mt-2 space-y-2 text-sm">{others.map((o) => <li key={o.slug}><Link href={`/guides/${o.slug}`} className="underline">{o.h1}</Link></li>)}</ul>
          </section>
        </article>
      </main>
      <Footer name={b.name} mapsUrl={settings.hub.maps_url} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
    </>
  );
}
