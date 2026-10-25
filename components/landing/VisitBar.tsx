"use client";

import { MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "lp_visitbar_closed";

/** Slim bar under the header that opens the saved hub location in Google Maps. */
export function VisitBar({ url }: { url: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    try { if (sessionStorage.getItem(KEY) === "1") setShown(false); } catch { /* storage unavailable: keep showing */ }
  }, []);
  if (!shown) return null;
  return (
    <div className="border-b border-brand/15 bg-brand-tint/60">
      <div className="container-page flex items-center gap-3 py-2.5 text-sm">
        <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-ink-soft">Visit us in person</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-brand-dark hover:underline">Visit Our Store <span aria-hidden>→</span></a>
        <button type="button" aria-label="Close this bar" className="shrink-0 rounded p-1 text-ink-soft hover:bg-white" onClick={() => { setShown(false); try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ } }}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
