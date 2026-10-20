const faqs = [
  { q: "What do I pay, and when?", a: "You pay the transport fare first to confirm a pickup. After the agent counts your clothes you pay for the cleaning. Delivery has its own fare, paid before the agent leaves with your order. Subscription orders are covered by your plan." },
  { q: "How is the transport fare calculated?", a: "From the real round-trip distance between our hub and your address, multiplied by a per-kilometre rate, with a minimum fare. You see the amount before you pay." },
  { q: "What if I book after closing time?", a: "Booking still works. We will tell you we are closed and pickup happens first thing the next morning." },
  { q: "What if I am unavailable at delivery?", a: "We call you first. If delivery cannot be completed, your order is held for a grace period of 48 hours. After that, a storage fee applies. You will receive an email before the grace period ends." },
  { q: "How do monthly plans work?", a: "Plans include a monthly allowance of pieces and a weekly pickup. Pieces beyond the allowance are billed per piece. Choosing yearly billing gives a discount." },
  { q: "What happens if my area is not covered?", a: "Join the waitlist with your email address and we will notify you when service starts in your area." },
];

export function Faq() {
  return (
    <section id="faq" className="section">
      <div className="container-page max-w-3xl">
        <p className="eyebrow">FAQ</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Common questions</h2>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <span aria-hidden className="text-xl leading-none text-ink-mute transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
