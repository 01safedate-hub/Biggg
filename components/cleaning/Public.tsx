import Link from "next/link";
import { CLEANING_HOTLINE, CLEANING_TEL, CLEANING_WHATSAPP, nairaK } from "@/lib/cleaning";
import type { CleaningInfo } from "@/lib/cleaning-seo";
import { SITE_URL } from "@/lib/seo";

export function CallButtons({ quoteHref = "/cleaning/request" }: { quoteHref?: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href={quoteHref} className="btn-primary">Get a cleaning quote</Link>
      <a href={`tel:${CLEANING_TEL}`} className="btn-secondary">Call {CLEANING_HOTLINE}</a>
      <a href={CLEANING_WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-secondary">WhatsApp us</a>
    </div>
  );
}

// Always-visible call and WhatsApp bar on phones.
export function StickyCall() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-line bg-white/95 p-3 backdrop-blur sm:hidden">
      <a href={`tel:${CLEANING_TEL}`} className="btn-primary text-center">Call {CLEANING_HOTLINE}</a>
      <a href={CLEANING_WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-secondary text-center">WhatsApp</a>
    </div>
  );
}

export function PriceExamples({ info }: { info: CleaningInfo | null }) {
  if (!info?.examples?.length) return <p className="text-sm text-ink-soft">Call or WhatsApp {CLEANING_HOTLINE} for a price.</p>;
  return (
    <div className="space-y-2">
      <table className="w-full overflow-hidden rounded-lg border border-line text-sm">
        <thead className="bg-canvas text-left"><tr><th scope="col" className="px-4 py-2 font-semibold">Home</th><th scope="col" className="px-4 py-2 text-right font-semibold">Standard clean</th><th scope="col" className="px-4 py-2 text-right font-semibold">Deep clean</th></tr></thead>
        <tbody className="divide-y divide-line">{info.examples.map((e) => <tr key={e.label}><td className="px-4 py-2">{e.label}</td><td className="px-4 py-2 text-right tabular-nums">from {nairaK(e.standard_kobo)}</td><td className="px-4 py-2 text-right tabular-nums">from {nairaK(e.deep_kobo)}</td></tr>)}</tbody>
      </table>
      <p className="text-xs text-ink-mute">Guide prices for a home in normal condition, before crew transport. Your quote depends on the rooms, condition and add-ons. Minimum job {nairaK(info.min_job_kobo)}.</p>
    </div>
  );
}

export function InspectionNote({ info }: { info: CleaningInfo | null }) {
  const bands = info?.inspection_fee_bands ?? [];
  const lo = bands.length ? Math.min(...bands.map((b) => b.fee_kobo)) : 0;
  const hi = bands.length ? Math.max(...bands.map((b) => b.fee_kobo)) : 0;
  return <p className="text-sm leading-6 text-ink-soft">Small homes can be quoted free from photos or a short WhatsApp video call. For bigger or unusual jobs we visit to inspect{bands.length ? `, for ${lo === hi ? nairaK(lo) : `${nairaK(lo)} to ${nairaK(hi)}`} depending on distance` : ""}. The inspection fee is taken off your clean when you book.</p>;
}

export function PlanTable({ info }: { info: CleaningInfo | null }) {
  const plans = (info?.plans ?? []).filter((p) => !p.custom);
  if (!plans.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {plans.map((p) => (
        <div key={p.slug} className="card space-y-2 p-5">
          <p className="text-lg font-semibold">{p.name}</p>
          <p className="text-sm text-ink-soft">{p.blurb}</p>
          <p className="text-sm"><strong>{p.visits_per_month}</strong> visits a month{p.deep_every_months ? `, deep clean every ${p.deep_every_months} months` : ""}</p>
          {p.discount_pct > 0 && <p className="text-sm font-medium text-emerald-700">Save {p.discount_pct}% on every visit</p>}
        </div>
      ))}
    </div>
  );
}

export function FaqList({ faqs }: { faqs: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {faqs.map((f) => <details key={f.q} className="py-4"><summary className="cursor-pointer font-semibold">{f.q}</summary><p className="mt-2 text-sm leading-6 text-ink-soft">{f.a}</p></details>)}
    </div>
  );
}

export function serviceJsonLd(name: string, description: string, path: string, areas: string[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    serviceType: name,
    description,
    url: `${SITE_URL}${path}`,
    provider: { "@id": `${SITE_URL}/#business` },
    areaServed: areas.map((a) => ({ "@type": "Place", name: `${a}, Anambra` })),
    availableChannel: { "@type": "ServiceChannel", servicePhone: { "@type": "ContactPoint", telephone: CLEANING_TEL, contactType: "customer service" }, serviceUrl: `${SITE_URL}/cleaning/request` },
  };
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}

export function crumbsJsonLd(items: { name: string; path: string }[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, item: `${SITE_URL}${x.path}` })) };
}
