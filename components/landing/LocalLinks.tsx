import Link from "next/link";
import { AREA_PAGES } from "@/lib/seo";
import { GUIDES } from "@/lib/guides";

/** Plain-language summary of where we work, with links to every area page and guide. */
export function LocalLinks() {
  return (
    <section id="laundry-in-awka" className="section" aria-labelledby="local-title">
      <div className="container-page grid gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Laundry in Awka</p>
          <h2 id="local-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Laundry pickup and drop-off across Awka</h2>
          <p className="mt-4 leading-7 text-ink-soft">
            LaundryPoint is a laundry and dry cleaning service in Ifite, Awka. We pick up and deliver within about 15 km of our hub, from Unizik, Temp Site and Aroma to Amawbia, Amikwo, Okpuno, Nibo, Nise and Amansea. We wash and dry everything in our own machines, so your clothes come back fast in any season. Prices per item are clear, monthly plans make laundry cheaper, and lodges, hotels and businesses can get a custom rate.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Areas with their own page">
            {AREA_PAGES.map((a) => <li key={a.slug}><Link href={`/laundry/${a.slug}`} className="underline">Laundry in {a.name}</Link></li>)}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-semibold">Guides</h3>
          <ul className="mt-3 space-y-2">
            {GUIDES.map((g) => <li key={g.slug}><Link href={`/guides/${g.slug}`} className="font-medium underline">{g.h1}</Link></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
