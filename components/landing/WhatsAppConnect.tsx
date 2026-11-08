"use client";

import Link from "next/link";
import { useRef } from "react";
import { MessageCircle, X, Truck, PackageSearch, CalendarCheck, HelpCircle, UserPlus } from "lucide-react";

const CAN_DO = [
  { icon: Truck, title: "Book a pickup", text: "Send your location pin and pay transport securely." },
  { icon: PackageSearch, title: "Track your order", text: "Ask where your laundry is, any time." },
  { icon: CalendarCheck, title: "Plans", text: "Subscribe or renew your monthly plan." },
  { icon: HelpCircle, title: "Questions", text: "Prices and hours, or a person when you need one." },
];

/** Hero button: explains the WhatsApp assistant first, then opens WhatsApp. */
export function WhatsAppConnect({ href }: { href: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button type="button" className="btn-primary" aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        <MessageCircle className="h-4 w-4" aria-hidden />
        Connect to our AI on WhatsApp
      </button>

      <dialog
        ref={ref}
        aria-labelledby="wa-title"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:animate-[wa-in_160ms_ease-out]"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e7f8ee] text-[#128c4a]">
                <MessageCircle className="h-5 w-5" aria-hidden />
              </span>
              <h2 id="wa-title" className="mt-3 text-lg font-semibold">Your laundry, on WhatsApp</h2>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="-m-2 rounded-full p-2 text-ink-mute hover:bg-canvas hover:text-ink">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <ul className="mt-5 space-y-4">
            {CAN_DO.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-dark" aria-hidden />
                <p className="text-sm text-ink-soft"><span className="font-semibold text-ink">{title}.</span> {text}</p>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex gap-3 rounded-xl bg-brand-tint p-4">
            <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-brand-dark" aria-hidden />
            <p className="text-sm text-ink-soft">
              <span className="font-semibold text-ink">Sign up first.</span> The assistant confirms it is you with a code sent to the email on your account.
            </p>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={close} className="btn-primary justify-center">
              <MessageCircle className="h-4 w-4" aria-hidden />
              Open WhatsApp
            </a>
            <Link href="/signup" className="btn-secondary justify-center">Create account</Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
