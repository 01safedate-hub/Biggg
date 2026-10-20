import { Waitlist } from "./Waitlist";

export function Coverage({ areas }: { areas: { name: string }[] }) {
  return (
    <section id="coverage" className="section border-y border-line bg-canvas">
      <div className="container-page grid gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Coverage</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Where we operate</h2>
          <p className="mt-4 text-ink-soft">
            Service areas expand as we grow. Transport fares are calculated from the real round-trip distance to your address.
          </p>
          {areas.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Areas currently served">
              {areas.map((a) => (
                <li key={a.name} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium">{a.name}</li>
              ))}
            </ul>
          )}
        </div>
        <Waitlist />
      </div>
    </section>
  );
}
