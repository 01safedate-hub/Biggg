import { duration, type Timeline } from "@/lib/orders";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));

export function OrderTimeline({ t, showPeople }: { t: Timeline; showPeople?: boolean }) {
  const total = t.steps.length ? Math.round((new Date(t.steps[t.steps.length - 1].at).getTime() - new Date(t.booked_at).getTime()) / 1000) : null;
  return (
    <section className="card p-5" aria-label="Order timeline">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Timeline</h2>
        {total != null && <p className="text-sm text-ink-soft">Booked to received: <strong>{duration(total)}</strong></p>}
      </div>
      <ol className="mt-4 space-y-4 border-l-2 border-line pl-5">
        <li className="relative"><span aria-hidden className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-line" /><p className="text-sm font-medium">Booked</p><p className="text-xs text-ink-mute">{when(t.booked_at)}</p></li>
        {t.steps.map((s) => (
          <li key={s.key} className="relative">
            <span aria-hidden className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-brand" />
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-xs text-ink-mute">{when(s.at)}{s.seconds_from_previous != null ? ` · ${duration(s.seconds_from_previous)} after the step before` : ""}{showPeople && s.by ? ` · ${s.by}` : ""}</p>
          </li>
        ))}
      </ol>
      {showPeople && t.agent && <p className="mt-4 text-sm text-ink-soft">Pickup agent: <strong>{t.agent}</strong></p>}
    </section>
  );
}
