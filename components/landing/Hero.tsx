import Link from "next/link";
import { ShieldCheck, Clock, BadgeCheck } from "lucide-react";
import { AreaCheck } from "./AreaCheck";
import { HoursNotice } from "./HoursNotice";

export function Hero({ eta, open, close, tz }: { eta: number; open: string; close: string; tz: string }) {
  return (
    <section className="border-b border-line bg-canvas">
      <div className="container-page grid gap-10 py-16 sm:py-24 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7">
          <p className="eyebrow">Laundry pickup and delivery</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Clean laundry, collected and returned with full accountability.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">
            Request a pickup and an agent arrives in about {eta} minutes. Your clothes are counted in front of you, photographed
            where needed, and every handover is confirmed with a one-time code.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/request" className="btn-primary">Request pickup</Link>
            <a href="#pricing" className="btn-secondary">View monthly plans</a>
          </div>
          <p className="mt-4 text-sm text-ink-mute">Transport is paid before the agent leaves. Delivery has its own fare, set by distance.</p>
          <ul className="mt-8 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
            <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-dark" aria-hidden />Agent in about {eta} min</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-dark" aria-hidden />Three-code handover</li>
            <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-brand-dark" aria-hidden />Counted and photographed</li>
          </ul>
        </div>
        <div className="space-y-4 lg:col-span-5">
          <AreaCheck etaMinutes={eta} />
          <HoursNotice open={open} close={close} tz={tz} />
        </div>
      </div>
    </section>
  );
}
