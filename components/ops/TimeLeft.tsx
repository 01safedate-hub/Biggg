"use client";

import { useEffect, useState } from "react";

function fmt(mins: number) {
  const m = Math.abs(mins);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Counts down to an instant order's target. Turns amber under 60 minutes and red once missed. */
export function TimeLeft({ targetAt, promiseAt, label = true }: { targetAt: string; promiseAt?: string | null; label?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const left = Math.floor((new Date(targetAt).getTime() - now) / 60000);
  const large = promiseAt && new Date(promiseAt).getTime() > new Date(targetAt).getTime();
  const cls = left < 0 ? "bg-red-100 text-red-800" : left < 60 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`} title={`Target ${new Date(targetAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" })}`}>
      {label && <span>Instant</span>}
      <span>{left < 0 ? `${fmt(left)} over` : `${fmt(left)} left`}</span>
      {large && <span className="font-normal">· large load</span>}
    </span>
  );
}
