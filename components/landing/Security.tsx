import { KeyRound, Camera, Lock } from "lucide-react";

const codes = [
  { icon: KeyRound, t: "Arrival code", d: "The agent shows a 4-digit code when they arrive. You enter it to confirm that this is your agent." },
  { icon: Camera, t: "Count code", d: "After the count is photographed and paid for, you confirm the number of items with a second code." },
  { icon: Lock, t: "Delivery code", d: "When your order comes back, a third code confirms that you received it in full." },
];

export function Security() {
  return (
    <section id="security" className="section border-y border-line bg-canvas">
      <div className="container-page">
        <p className="eyebrow">Secure handover</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Three codes protect every order</h2>
        <p className="mt-4 max-w-2xl text-ink-soft">
          Each code is single use and locks after five wrong attempts. The count code only works once payment is received, so both
          sides have a verified record of what was handed over.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {codes.map(({ icon: Icon, t, d }) => (
            <div key={t} className="card p-6">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-brand-tint text-brand-dark"><Icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-4 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
