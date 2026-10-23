import { RAMP } from "./theme";

export type BarRow = { label: string; value: number; display: string; note?: string };

/** Horizontal bars from a single baseline, value at the tip. `ramp` shades ordered stages light to dark. */
export function BarList({ rows, color = "#2a78d6", ramp = false, empty = "Nothing in this period." }: { rows: BarRow[]; color?: string; ramp?: boolean; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <p className="text-sm text-ink-mute">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r, k) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink-soft">{r.label}</span>
            <span className="shrink-0 font-semibold">{r.display}</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-r bg-canvas" aria-hidden>
            <div className="h-full rounded-r" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: ramp ? RAMP[Math.min(k, RAMP.length - 1)] : color }} />
          </div>
          {r.note && <p className="mt-0.5 text-xs text-ink-mute">{r.note}</p>}
        </li>
      ))}
    </ul>
  );
}
