"use client";

import { useEffect, useState } from "react";

function minutesNow(tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

export function HoursNotice({ open, close, tz }: { open: string; close: string; tz: string }) {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const n = minutesNow(tz);
    setIsOpen(n >= toMin(open) && n < toMin(close));
  }, [open, close, tz]);

  return (
    <div className="card flex items-start gap-3 p-4 text-sm" role="status">
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isOpen === false ? "bg-amber-500" : "bg-emerald-500"}`} />
      <div>
        <p className="font-semibold">Hours: {open} to {close}</p>
        <p className="text-ink-mute">
          {isOpen === false
            ? "We are closed now. Booking still works and pickup happens first thing next morning."
            : "Bookings made after closing are collected first thing next morning."}
        </p>
      </div>
    </div>
  );
}
