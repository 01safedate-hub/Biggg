import { pctChange } from "@/lib/dash";

/** A stat tile with a change-vs-previous-period readout and an optional 12-point trend line. */
export function Kpi({ label, value, cur, prev, upIsGood = true, spark, hint }: {
  label: string; value: string; cur: number; prev: number; upIsGood?: boolean; spark?: number[]; hint?: string;
}) {
  const change = pctChange(cur, prev);
  const up = cur > prev, down = cur < prev;
  const good = change === 0 || change === null ? null : up === upIsGood;
  const tone = good === null ? "text-ink-mute" : good ? "text-emerald-700" : "text-red-700";
  const pts = spark && spark.length > 1 ? spark : null;
  const max = pts ? Math.max(1, ...pts) : 1;
  return (
    <div className="card p-4">
      <p className="text-sm text-ink-mute">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className={`text-xs font-medium ${tone}`}>
          {change === null ? "New this period" : change === 0 ? "No change" : `${up ? "▲" : down ? "▼" : ""} ${Math.abs(change)}%`}
          <span className="font-normal text-ink-mute"> vs previous</span>
        </p>
        {pts && (
          <svg viewBox="0 0 60 20" className="h-5 w-16" aria-hidden>
            <polyline fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={pts.map((v, k) => `${(k / (pts.length - 1)) * 58 + 1},${19 - (v / max) * 17}`).join(" ")} />
          </svg>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}
