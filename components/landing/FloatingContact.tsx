"use client";

import { MessageCircle, Phone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** A small floating button on the home page. Tap it to call us or chat on WhatsApp. */
export function FloatingContact({ phone, whatsapp, name }: { phone: string | null; whatsapp: string | null; name: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;
  const wa = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${name}, I have a question.`)}` : null;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("touchstart", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("touchstart", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!tel && !wa) return null;
  return (
    <div ref={box} className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 pb-[env(safe-area-inset-bottom)] print:hidden">
      {open && (
        <div role="menu" aria-label="Contact us" className="w-60 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
          <p className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">Talk to us</p>
          {tel && (
            <a role="menuitem" href={tel} className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-canvas">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-tint text-brand-dark"><Phone className="h-4 w-4" aria-hidden /></span>
              <span>Call us<span className="block text-xs font-normal text-ink-soft">{phone}</span></span>
            </a>
          )}
          {wa && (
            <a role="menuitem" href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-canvas">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700"><MessageCircle className="h-4 w-4" aria-hidden /></span>
              <span>WhatsApp<span className="block text-xs font-normal text-ink-soft">Chat with us</span></span>
            </a>
          )}
        </div>
      )}
      <button type="button" aria-expanded={open} aria-label={open ? "Close contact options" : "Call or WhatsApp us"} onClick={() => setOpen((v) => !v)}
        className="grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-lg ring-4 ring-white/80 transition hover:bg-brand-dark focus:outline-none focus-visible:ring-brand">
        {open ? <X className="h-6 w-6" aria-hidden /> : <Phone className="h-6 w-6" aria-hidden />}
      </button>
    </div>
  );
}
