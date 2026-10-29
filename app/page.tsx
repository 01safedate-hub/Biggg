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

export const revalidate = 300;

export default async function Home() {
  const { settings, plans, zones } = await getSiteData();
  const b = settings.business;
  const hub = settings.hub;
  const visitUrl = hub.maps_url || (hub.lat != null && hub.lng != null ? `https://www.google.com/maps?q=${hub.lat},${hub.lng}` : null);
  return (
    <>
      <Header name={b.name} />
      {visitUrl && <VisitBar url={visitUrl} />}
      <main id="main">
        <Hero eta={settings.agent.eta_minutes} open={b.opening_time} close={b.closing_time} tz={b.timezone} whatsapp={settings.whatsapp.number} />
        <HowItWorks eta={settings.agent.eta_minutes} />
        <Security />
        <Pricing plans={plans} pickupsPerMonth={settings.subscription.pickups_per_month} />
        <Coverage areas={zones} />
        <Faq />
      </main>
      <Footer name={b.name} mapsUrl={visitUrl} whatsapp={settings.whatsapp.number} phone={settings.contact.phone} />
      <FloatingContact phone={settings.contact.phone} whatsapp={settings.whatsapp.number} name={b.name} />
    </>
  );
}
