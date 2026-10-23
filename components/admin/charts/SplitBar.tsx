import { C } from "./theme";

/** Share of two parts in one bar, with a 2px gap between them and both values written out. */
export function SplitBar({ a, b, aLabel, bLabel, format, hint }: { a: number; b: number; aLabel: string; bLabel: string; format: (v: number) => string; hint?: string }) {
  const total = a + b;
  const pa = total > 0 ? (a / total) * 100 : 0;
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded" role="img" aria-label={`${aLabel} ${Math.round(pa)} percent, ${bLabel} ${Math.round(100 - pa)} percent`}>
        {total === 0 ? <div className="h-full w-full bg-canvas" /> : (<><div className="h-full" style={{ width: `${pa}%`, background: C.sales }} /><div className="h-full" style={{ width: `${100 - pa}%`, background: C.spend }} /></>)}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="flex items-center gap-2 text-ink-mute"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C.sales }} />{aLabel}</dt><dd className="mt-0.5 text-lg font-bold">{format(a)}</dd><dd className="text-xs text-ink-mute">{total ? `${Math.round(pa)}%` : "–"}</dd></div>
        <div><dt className="flex items-center gap-2 text-ink-mute"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C.spend }} />{bLabel}</dt><dd className="mt-0.5 text-lg font-bold">{format(b)}</dd><dd className="text-xs text-ink-mute">{total ? `${Math.round(100 - pa)}%` : "–"}</dd></div>
      </dl>
      {hint && <p className="mt-2 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}
