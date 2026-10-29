import Link from "next/link";
import { ShieldCheck, Clock, BadgeCheck, MessageCircle } from "lucide-react";
import { AreaCheck } from "./AreaCheck";
import { HoursNotice } from "./HoursNotice";
import { HeroArt } from "./HeroArt";
import { ReduceHeroMotion } from "./ReduceHeroMotion";

/** The first message that is ready to send when a visitor connects to our AI on WhatsApp. */
const AI_OPENER = "Hi, I want to ask about my laundry.";

export function Hero({ eta, open, close, tz, whatsapp }: { eta: number; open: string; close: string; tz: string; whatsapp: string | null }) {
  const ai = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(AI_OPENER)}` : null;
  return (
    <section className="border-b border-line bg-canvas">
      {/* On phones the wrappers dissolve so the illustration sits right under the buttons. */}
      <div className="container-page flex flex-col py-16 sm:py-24 lg:grid lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8">
        <div className="contents lg:col-span-7 lg:block">
          <div className="order-1">
            <p className="eyebrow">Smart laundry</p>
            <h1 className="mt-4 text-balance text-[1.575rem] font-bold leading-tight tracking-tight sm:text-5xl">
              We pick up, wash and deliver back to you.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              <b className="font-semibold text-ink">Heavy duvets, blankets, shoes, suits, curtains, wedding gowns, agbada and lace</b>
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {ai && (
                <a href={ai} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  Connect to our AI on WhatsApp
                </a>
              )}
              <Link href="/request" className="btn-secondary">Request pickup</Link>
            </div>
          </div>

          <div className="order-3 mt-6 lg:mt-4">
            <p className="text-sm text-ink-mute">
              Transport is paid before the agent leaves. Delivery has its own fare, set by distance.{" "}
              <a href="#pricing" className="whitespace-nowrap font-semibold text-brand-dark underline-offset-2 hover:underline">View monthly plans</a>
            </p>
            <ul className="mt-8 grid gap-3 text-sm text-ink-soft sm:grid-cols-[repeat(3,max-content)] sm:gap-x-6">
              <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-dark" aria-hidden />Agent in about {eta} min</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-dark" aria-hidden />Three-code handover</li>
              <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-brand-dark" aria-hidden />Counted and photographed</li>
            </ul>
          </div>
        </div>

        <div className="contents lg:col-span-5 lg:block">
          <div className="order-2 mt-8 aspect-[540/412] max-w-[34rem] overflow-hidden rounded-2xl bg-[#FCEBDD] lg:mt-0 lg:max-w-none">
            <HeroArt />
            <ReduceHeroMotion />
          </div>
          <div className="order-4 mt-10 grid gap-4 lg:mt-4">
            <AreaCheck etaMinutes={eta} />
            <HoursNotice open={open} close={close} tz={tz} />
          </div>
        </div>
      </div>
    </section>
  );
}
