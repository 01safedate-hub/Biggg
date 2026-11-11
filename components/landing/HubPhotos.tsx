import { HUB_ADDRESS, HUB_PHOTOS } from "@/lib/seo";

/** Real photos of the Ifite hub, so customers see where their clothes are washed. */
export function HubPhotos({ mapsUrl, compact = false }: { mapsUrl?: string | null; compact?: boolean }) {
  return (
    <section id="hub" className={compact ? "" : "section border-y border-line bg-canvas"} aria-labelledby="hub-title">
      <div className={compact ? "" : "container-page"}>
        {!compact && <p className="eyebrow">Our hub</p>}
        <h2 id="hub-title" className={compact ? "text-lg font-semibold" : "mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl"}>
          {compact ? "Our hub in Ifite" : "A real shop you can walk into"}
        </h2>
        <p className={compact ? "mt-1 text-sm text-ink-soft" : "mt-4 max-w-2xl text-ink-soft"}>
          {compact ? HUB_ADDRESS : <>Every order is washed and dried at our hub: {HUB_ADDRESS}. Drop in any time we are open.</>}
        </p>
        <div className={`${compact ? "mt-4 gap-3" : "mt-10 gap-6"} grid grid-cols-3`}>
          {HUB_PHOTOS.map((p) => (
            <figure key={p.src} className="overflow-hidden rounded-lg border border-line bg-white">
              <picture>
                <source srcSet={`${p.src}.webp`} type="image/webp" />
                <img src={`${p.src}.jpg`} alt={p.alt} width={1200} height={1600} loading="lazy" decoding="async" className="aspect-[3/4] h-auto w-full object-cover" />
              </picture>
              {!compact && <figcaption className="px-3 py-2 text-xs text-ink-soft sm:text-sm">{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
        {mapsUrl && <a href={mapsUrl} className="mt-4 inline-block text-sm font-medium underline" target="_blank" rel="noreferrer">Open in Google Maps</a>}
      </div>
    </section>
  );
}
