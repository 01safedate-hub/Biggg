"use client";

import { useMemo, useState } from "react";

const CATEGORIES = [
  { slug: "tops", name: "Tops" },
  { slug: "bottoms", name: "Bottoms" },
  { slug: "native-wear", name: "Native wear" },
  { slug: "suits-formal", name: "Suits and formal" },
  { slug: "bedding-home", name: "Bedding and home" },
  { slug: "underwear-sleepwear", name: "Underwear and sleepwear" },
  { slug: "uniforms-workwear", name: "Uniforms and workwear" },
  { slug: "accessories", name: "Accessories" },
  { slug: "footwear-bags", name: "Footwear and bags" },
] as const;

export function CategoryLimitsEditor({ initial = {}, inputName = "category_limits" }: {
  initial?: Record<string, number>;
  inputName?: string;
}) {
  const [limits, setLimits] = useState<Record<string, number>>(() => ({ ...initial }));
  const encoded = useMemo(() => JSON.stringify(limits), [limits]);
  return <fieldset className="space-y-3 sm:col-span-2 lg:col-span-3">
    <legend className="text-sm font-semibold">Category limits</legend>
    <p className="text-xs text-ink-soft">For each category choose: leave unchecked for no separate cap; check and enter 0 to exclude it (every piece is chargeable); enter a positive number to include up to that many pieces per billing period. Category caps are separate from the plan’s total-piece allowance.</p>
    <input type="hidden" name={inputName} value={encoded} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORIES.map((category) => {
        const enabled = Object.prototype.hasOwnProperty.call(limits, category.slug);
        return <div key={category.slug} className="rounded-lg border border-gray-200 p-3">
          <label className="flex min-h-8 items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={enabled} onChange={(event) => setLimits((current) => {
              const next = { ...current };
              if (event.target.checked) next[category.slug] = 0;
              else delete next[category.slug];
              return next;
            })} className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" />
            {category.name}
          </label>
          {enabled ? <><label className="mt-2 block text-xs text-ink-soft">Maximum included pieces (0 = not included)
            <input type="number" min="0" step="1" required value={limits[category.slug]} onChange={(event) => {
              const value = event.target.value;
              setLimits((current) => ({ ...current, [category.slug]: value === "" ? 0 : Math.max(0, Math.floor(Number(value))) }));
            }} className="mt-1.5 block min-h-10 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20" />
          </label><p className="mt-1 text-xs font-medium">{limits[category.slug] === 0 ? "Not included · charge every piece" : `Included up to ${limits[category.slug]} pieces`}</p></> : <p className="mt-2 text-xs text-ink-soft">Included; no separate category cap</p>}
        </div>;
      })}
    </div>
  </fieldset>;
}
