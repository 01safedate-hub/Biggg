import Link from "next/link";
import { PRESETS } from "@/lib/dash";
import { inputCls } from "./ui";

/** One row above the charts. Every number below follows this range. */
export function RangeBar({ active, from, to, today }: { active: string; from: string; to: string; today: string }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <nav aria-label="Date range" className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <Link key={p.key} href={`/admin?range=${p.key}`} aria-current={active === p.key ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${active === p.key ? "bg-ink text-white" : "border border-line bg-white text-ink-soft hover:bg-canvas"}`}>{p.label}</Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <div><label htmlFor="from" className="block text-xs font-medium text-ink-mute">From</label><input id="from" name="from" type="date" max={today} defaultValue={from} className={inputCls} /></div>
        <div><label htmlFor="to" className="block text-xs font-medium text-ink-mute">To</label><input id="to" name="to" type="date" max={today} defaultValue={to} className={inputCls} /></div>
        <button className="btn-secondary">Apply</button>
      </form>
    </div>
  );
}
