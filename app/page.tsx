import { getSiteData } from "@/lib/site-data";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Security } from "@/components/landing/Security";
import { Pricing } from "@/components/landing/Pricing";
import { Coverage } from "@/components/landing/Coverage";
import { Faq } from "@/components/landing/Faq";
import { VisitBar } from "@/components/landing/VisitBar";
import { FloatingContact } from "@/components/landing/FloatingContact";
import { Footer } from "@/components/landing/Footer";
import { ScrollBubbles } from "@/components/landing/ScrollBubbles";
import { faqs } from "@/components/landing/Faq";
import { JsonLd, businessJsonLd } from "@/lib/seo";

export const metadata = { alternates: { canonical: "/" } };

export const revalidate = 300;

export default async function Home() {
  const { settings, plans, zones } = await getSiteData();
  const b = settings.business;
  const hub = settings.hub;
  const visitUrl = hub.maps_url || (hub.lat != null && hub.lng != null ? `https://www.google.com/maps?q=${hub.lat},${hub.lng}` : null);
  return (
    <>
      <JsonLd data={businessJsonLd(settings, zones.map((z) => z.name))} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <Header name={b.name} />
      {visitUrl && <VisitBar url={visitUrl} />}
      <main id="main">
        <Hero eta={settings.agent.eta_minutes} open={b.opening_time} close={b.closing_time} tz={b.timezone} whatsapp={settings.whatsapp.number} />
        <HowItWorks eta={settings.agent.eta_minutes} />
        <Security />
        <Pricing plans={plans} pickupsPerMonth={2} yearlyDiscountPct={settings.subscription.yearly_discount_pct} />
        <Coverage areas={zones} />
        <Faq />
      </main>
      <Footer name={b.name} mapsUrl={visitUrl} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
      <ScrollBubbles />
      <FloatingContact phone={settings.contact.phone} whatsapp={settings.whatsapp.number} name={b.name} />
    </>
  );
}
