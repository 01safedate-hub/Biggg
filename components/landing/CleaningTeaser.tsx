import Link from "next/link";
import { CLEANING_HOTLINE, CLEANING_TEL, CLEANING_WHATSAPP } from "@/lib/cleaning";
import { CLEANING_SERVICE_PAGES } from "@/lib/cleaning-seo";

/** Home page section that introduces the cleaning service. */
export function CleaningTeaser() {
  return (
    <section id="cleaning" className="section bg-canvas" aria-labelledby="cleaning-title">
      <div className="container-page grid gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow">New: house cleaning</p>
          <h2 id="cleaning-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Cleaning services in Awka</h2>
          <p className="mt-4 leading-7 text-ink-soft">The same care we give your clothes, now for your home and office. One-off and deep cleans, cleaning after building or painting, and monthly plans with a crew on the same day every week. We bring the supplies, give you a clear price first, and you sign off before we leave.</p>
          <p className="mt-3 leading-7 text-ink-soft">Put cleaning and laundry together with <Link href="/cleaning/home-complete" className="font-medium underline">Home Complete</Link> and your laundry pickup and delivery are free.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/cleaning" className="btn-primary">See cleaning prices</Link>
            <a href={`tel:${CLEANING_TEL}`} className="btn-secondary">Call {CLEANING_HOTLINE}</a>
            <a href={CLEANING_WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-secondary">WhatsApp</a>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          <li><Link href="/cleaning/plans" className="card block p-4 font-medium hover:border-brand">Weekly home cleaning plans</Link></li>
          {CLEANING_SERVICE_PAGES.map((s) => <li key={s.slug}><Link href={`/cleaning/${s.slug}`} className="card block p-4 font-medium hover:border-brand">{s.name}</Link></li>)}
        </ul>
      </div>
    </section>
  );
}
