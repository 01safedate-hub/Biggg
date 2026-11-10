"use client";

import { SHELF_NUMS, SHELF_ROWS } from "@/lib/shelves";

/** Tap shelves to pick one or more (A1 to G9). `busy` maps a shelf to how many orders already sit on it. */
export function ShelfPicker({ value, onChange, busy = {} }: { value: string[]; onChange: (v: string[]) => void; busy?: Record<string, number> }) {
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s].sort());
  return (
    <div className="space-y-1" role="group" aria-label="Shelves">
      {SHELF_ROWS.map((r) => (
        <div key={r} className="flex gap-1">
          {SHELF_NUMS.map((n) => {
            const s = `${r}${n}`;
            const on = value.includes(s);
            const used = busy[s] ?? 0;
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)}
                title={used ? `${used} order${used === 1 ? "" : "s"} already here` : "Empty"}
                className={`relative h-9 w-9 rounded-md border text-xs font-semibold tabular-nums ${on ? "border-brand bg-brand text-white" : used ? "border-amber-300 bg-amber-50 text-ink" : "border-line bg-white text-ink"}`}>
                {s}
                {used > 0 && !on && <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1 text-[10px] leading-4 text-white">{used}</span>}
              </button>
            );
          })}
        </div>
      ))}
      <p className="pt-1 text-xs text-ink-mute">Tap every shelf the clothes are on. Amber shelves already hold other orders.</p>
    </div>
  );
}
