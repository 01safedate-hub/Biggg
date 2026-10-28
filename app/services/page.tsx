import Link from "next/link";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { FloatingContact } from "@/components/landing/FloatingContact";
import { getSiteData } from "@/lib/site-data";

export const metadata = {
  title: "Laundry services",
  description: "Explore LaundryPoint laundry care, scheduled pickup, delivery, and monthly subscription plans.",
};

export const revalidate = 300;

const services = [
  {
    number: "01",
    title: "Laundry care",
    description: "Your clothes are counted at collection, checked again at our hub, and processed as part of your order so every item can be tracked through the service.",
  },
  {
    number: "02",
    title: "Pickup and collection",
    description: "Request a collection from your address, review any applicable fare before confirming, and use the secure handover code when the agent arrives.",
  },
  {
    number: "03",
    title: "Delivery back to you",
    description: "When your order is ready, arrange its return and confirm receipt with the delivery handover code. Monthly subscription orders use the pickup and delivery coverage defined by the plan.",
  },
  {
    number: "04",
    title: "Monthly laundry plans",
    description: "Pay once per month for a set number of garment pieces. The allowance counts all garment types together and is shared across two pickups during the billing period. Pieces above the remaining allowance are billed separately online.",
  },
];

export default async function ServicesPage() {
  const { settings } = await getSiteData();
  const b = settings.business;
  const hub = settings.hub;
  const visitUrl = hub.maps_url || (hub.lat != null && hub.lng != null ? `https://www.google.com/maps?q=${hub.lat},${hub.lng}` : null);

  return (
    <>
      <Header name={b.name} />
      <main id="main" className="container-page max-w-5xl space-y-10 py-12">
        <div className="max-w-3xl space-y-4">
          <p className="eyebrow">Our services</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Laundry care, made easier.</h1>
          <p className="text-lg leading-7 text-ink-soft">From collection to return, LaundryPoint gives you a clear process for handing over, tracking, and receiving your clothes—with online payment and secure handover codes.</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/subscriptions" className="btn-primary">View monthly plans</Link>
            <Link href="/request" className="btn-secondary">Request a pickup</Link>
          </div>
        </div>

        <section aria-label="LaundryPoint services" className="grid gap-4 sm:grid-cols-2">
          {services.map((service) => (
            <article key={service.number} className="card space-y-3 p-6">
              <p className="text-sm font-semibold text-brand-dark">{service.number}</p>
              <h2 className="text-xl font-semibold">{service.title}</h2>
              <p className="text-sm leading-6 text-ink-soft">{service.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-line bg-canvas p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight">Choose a plan after you know what is included</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">Monthly plans show the price and garment allowance before you pay. One allowance covers the total pieces counted across the month; if a pickup exceeds the remaining allowance, the extra-clothes bill is sent for online payment. Agents do not collect cash.</p>
          <Link href="/subscriptions" className="btn-primary mt-5 inline-block">Compare monthly plans</Link>
        </section>
      </main>
      <Footer name={b.name} mapsUrl={visitUrl} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
      <FloatingContact phone={settings.contact.phone} whatsapp={settings.whatsapp.number} name={b.name} />
    </>
  );
}
