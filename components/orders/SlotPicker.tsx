"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputCls, labelCls } from "@/components/admin/ui";

type Slot = { start: string; label: string; remaining: number };

function lagosDate(offset: number): string {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function dayLabel(offset: number, iso: string): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return new Date(`${iso}T12:00:00+01:00`).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

/** Lets the customer choose a one-hour window. Used when booking and when changing the time. */
export function SlotPicker({ value, onChange, days = 8 }: { value: string | null; onChange: (slot: string | null) => void; days?: number }) {
  const [offset, setOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSlots(null); setErr(null);
    createClient().rpc("available_slots", { _date: lagosDate(offset) }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setErr("We could not load the times. Please try again."); return; }
      setSlots((data as unknown as Slot[]) ?? []);
    });
    return () => { live = false; };
  }, [offset]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="slot-day" className={labelCls}>Day</label>
        <select id="slot-day" className={inputCls} value={offset} onChange={(e) => { setOffset(Number(e.target.value)); onChange(null); }}>
          {Array.from({ length: days }, (_, i) => <option key={i} value={i}>{dayLabel(i, lagosDate(i))}</option>)}
        </select>
      </div>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      {slots === null && !err && <p className="text-sm text-ink-soft">Loading times</p>}
      {slots && slots.length === 0 && <p className="text-sm text-ink-soft">No times are left on this day. Try another day.</p>}
      {slots && slots.length > 0 && (
        <div role="radiogroup" aria-label="Pickup time" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((s) => {
            const full = s.remaining <= 0;
            const on = value === s.start;
            return (
              <button key={s.start} type="button" role="radio" aria-checked={on} disabled={full} onClick={() => onChange(s.start)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${on ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"} ${full ? "cursor-not-allowed text-ink-mute line-through" : "hover:border-brand"}`}>
                {s.label}
                <span className="block text-xs font-normal text-ink-mute">{full ? "Full" : s.remaining <= 2 ? `${s.remaining} left` : "Available"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
