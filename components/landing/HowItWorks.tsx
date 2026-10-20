const steps = [
  { n: "01", t: "Request a pickup", d: "Share your location and see the transport fare up front. Pay it to confirm the booking." },
  { n: "02", t: "Agent arrives", d: "An agent reaches you in about 30 minutes and shows an arrival code that you enter to confirm identity." },
  { n: "03", t: "Count and confirm", d: "Items are counted with you and any stain or tear is photographed. You pay for the clothes, then confirm the count with a second code." },
  { n: "04", t: "Cleaned and returned", d: "Your order is processed at our facility. Delivery is paid before the agent leaves, and a third code confirms receipt." },
];

export function HowItWorks({ eta }: { eta: number }) {
  return (
    <section id="how-it-works" className="section">
      <div className="container-page">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">A clear process from request to delivery</h2>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="card p-6">
              <span className="text-sm font-semibold text-brand-dark">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{s.d.replace("30 minutes", `${eta} minutes`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
