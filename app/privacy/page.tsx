import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { getSiteData } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how LaundryPoint collects, uses, shares and protects personal information.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPolicyPage() {
  const { settings } = await getSiteData();
  const b = settings.business;
  const hub = settings.hub;
  const mapsUrl = hub.maps_url || (hub.lat != null && hub.lng != null ? `https://www.google.com/maps?q=${hub.lat},${hub.lng}` : null);
  return (
    <>
      <Header name={b.name} />
      <main id="main" className="container-page max-w-4xl py-12 sm:py-16">
        <Link href="/" className="text-sm font-medium text-brand-dark hover:underline">← Back to home</Link>
        <p className="eyebrow mt-8">Legal</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Privacy Policy</h1>
        <p className="mt-4 text-sm text-ink-mute">Last updated: 1 November 2026</p>
        <div className="mt-8 space-y-8 text-sm leading-7 text-ink-soft">
          <section><h2 className="text-xl font-semibold text-ink">1. About this policy</h2>
            <p className="mt-2">This policy explains how {b.name} (“LaundryPoint”, “we”, “us” or “our”) handles personal information when you visit our website, create an account, book a laundry pickup or delivery, use a subscription, contact us, or receive service messages. We aim to handle personal information in accordance with applicable Nigerian data-protection law, including the Nigeria Data Protection Act 2023.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">2. Information we collect</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li><strong>Account and contact details:</strong> name, email address, phone number, account identifiers and authentication-related records.</li>
              <li><strong>Pickup and delivery details:</strong> service address, location or route information you provide or allow us to use, pickup and delivery instructions, and relevant order communications.</li>
              <li><strong>Orders and subscriptions:</strong> bookings, garment counts and item details, order status, plan usage, service history, fares, charges, refunds and payment status.</li>
              <li><strong>Communications and preferences:</strong> messages to our support team, email preferences, WhatsApp update consent and opt-out records, and service notifications.</li>
              <li><strong>Technical and security data:</strong> information needed to operate and secure the website, diagnose faults, prevent abuse and maintain audit records. Hosting or service providers may also process standard technical logs.</li>
            </ul>
            <p className="mt-2">Please do not include unnecessary sensitive or confidential information in order notes or messages.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">3. How we use information</h2>
            <p className="mt-2">We use personal information to create and maintain accounts; arrange pickups, cleaning and deliveries; calculate and collect applicable fares and charges; administer subscriptions and garment allowances; send essential order, payment, pickup and delivery updates; respond to support requests; maintain records and resolve disputes; protect our customers, staff and service; improve reliability; and meet legal obligations. We send promotional email only according to your preferences and applicable rules.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">4. Payments</h2>
            <p className="mt-2">Payments may be processed by third-party payment providers, including Flutterwave where enabled. Those providers handle payment details under their own terms and privacy notices. We may receive transaction references, amounts, payment status and related reconciliation information. We do not intend to store your full card details on LaundryPoint systems. A payment provider’s processing of your data is also subject to its own policies.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">5. WhatsApp, email and phone communications</h2>
            <p className="mt-2">We may contact you by email or phone when needed to operate your account or fulfil an order. If you opt in to WhatsApp updates, we may send service messages about your pickup, payment, order progress and delivery through WhatsApp and its service providers. You can opt out of WhatsApp updates by replying STOP where supported or by contacting us. Opting out of promotional messages does not necessarily stop essential service communications.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">6. When we share information</h2>
            <p className="mt-2">We share only information reasonably needed for the purposes described here with authorised pickup and delivery agents and staff; hosting, database, authentication, messaging, mapping and payment providers; professional advisers where necessary; and public authorities or other parties when required by law, to protect rights or safety, or to handle fraud and disputes. We do not sell personal information to advertisers. Service providers may process information on our behalf and under their applicable contractual or legal obligations.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">7. Storage, security and retention</h2>
            <p className="mt-2">We use technical and organisational safeguards intended to protect information against unauthorised access, loss, misuse or alteration. No online service can guarantee absolute security. We retain information for as long as reasonably necessary to provide the service, maintain order and financial records, resolve disputes, enforce agreements and meet legal obligations. Retention periods vary by data type and circumstance; information is deleted or de-identified when it is no longer required, where appropriate and lawful.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">8. International processing</h2>
            <p className="mt-2">Some technology or communication providers may process information in countries outside Nigeria. Where this occurs, we will seek to use applicable safeguards required by data-protection law.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">9. Your choices and rights</h2>
            <p className="mt-2">Subject to applicable law and verification of your identity, you may have the right to request access to your personal information, correction of inaccurate information, deletion or restriction of processing, object to certain processing, withdraw consent where processing relies on consent, and request a portable copy where applicable. You may also complain to the relevant data-protection authority. Some information must be retained where the law requires it or where it is needed to complete a transaction or resolve a claim.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">10. Children</h2>
            <p className="mt-2">Our account and laundry services are intended for people able to enter into the relevant service arrangements. We do not knowingly seek to collect children’s personal information without the required authorisation. If you believe a child has provided personal information improperly, contact us so we can review the matter.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">11. Links to other services</h2>
            <p className="mt-2">Our website may link to third-party services such as payment, mapping or messaging platforms. Their privacy practices are governed by their own policies, and we encourage you to review them.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">12. Changes to this policy</h2>
            <p className="mt-2">We may update this policy as our services or legal obligations change. We will publish the updated version on this page and revise the “Last updated” date. Where required, we will provide additional notice or seek consent.</p>
          </section>
          <section><h2 className="text-xl font-semibold text-ink">13. Contact us</h2>
            <p className="mt-2">For privacy questions or requests, contact LaundryPoint using the phone number or WhatsApp contact shown in the website footer. You can also visit our hub using the “Visit us on Google Maps” link when available. Please state your request clearly and do not send passwords or full payment-card details.</p>
          </section>
          <p className="rounded-xl border border-line p-4">This page is general privacy information, not legal advice. Before publication, LaundryPoint should confirm its official privacy contact, retention schedule, processor arrangements and operational practices match this policy.</p>
        </div>
      </main>
      <Footer name={b.name} mapsUrl={mapsUrl} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
    </>
  );
}
