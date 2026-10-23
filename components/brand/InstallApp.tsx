"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type Evt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Offers to install this section as an app. Shows nothing if the browser has no install prompt (iPhone users use Share, then Add to Home Screen). */
export function InstallApp({ label = "Install app", className = "" }: { label?: string; className?: string }) {
  const [evt, setEvt] = useState<Evt | null>(null);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as Evt); };
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", () => setEvt(null));
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (!evt) return null;
  return (
    <button type="button" className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-canvas hover:text-ink ${className}`}
      onClick={async () => { await evt.prompt(); setEvt(null); }}>
      <Download aria-hidden className="h-4 w-4" />{label}
    </button>
  );
}
