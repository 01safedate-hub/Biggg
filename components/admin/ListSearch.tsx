"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Search box that filters server-rendered rows as you type.
 * Mark each row with data-search="text to match" and, optionally, wrap rows in a
 * data-search-group element so a whole group (for example a price category) hides when none of its rows match.
 */
export function ListSearch({ label, placeholder, children }: { label: string; placeholder: string; children: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const apply = () => {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      let visible = 0;
      root.querySelectorAll<HTMLElement>("[data-search]").forEach((el) => {
        const text = (el.dataset.search ?? "").toLowerCase();
        const match = words.every((w) => text.includes(w));
        el.hidden = !match;
        if (match) visible++;
      });
      root.querySelectorAll<HTMLElement>("[data-search-group]").forEach((g) => {
        const groupText = (g.dataset.searchGroup ?? "").toLowerCase();
        const groupMatch = words.length > 0 && words.every((w) => groupText.includes(w));
        const anyRow = Array.from(g.querySelectorAll<HTMLElement>("[data-search]")).some((el) => !el.hidden);
        if (groupMatch) g.querySelectorAll<HTMLElement>("[data-search]").forEach((el) => { el.hidden = false; });
        g.hidden = words.length > 0 && !groupMatch && !anyRow;
      });
      setShown(words.length ? root.querySelectorAll("[data-search]:not([hidden])").length : null);
      void visible;
    };
    apply();
    // Rows re-render after saves (router.refresh); keep the filter applied to whatever is on screen.
    const watch = new MutationObserver(() => { if (q) apply(); });
    watch.observe(root, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 bg-canvas/95 px-1 py-2 backdrop-blur">
        <label className="block">
          <span className="sr-only">{label}</span>
          <span className="relative block">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"><path fill="currentColor" d="M8.5 3a5.5 5.5 0 0 1 4.38 8.83l3.65 3.64-1.06 1.06-3.64-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /></svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
              className="w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
          </span>
        </label>
        {shown !== null && <p role="status" className="mt-1 text-xs text-ink-mute">{shown === 0 ? "No matches." : `${shown} match${shown === 1 ? "" : "es"}`}</p>}
      </div>
      <div ref={box} className="space-y-3">{children}</div>
    </div>
  );
}
