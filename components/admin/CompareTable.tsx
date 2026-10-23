import { pctChange } from "@/lib/dash";

export type CompareRow = { label: string; cur: number; prev: number; fmt: (n: number) => string; upIsGood?: boolean };

export function CompareTable({ rows, curLabel, prevLabel }: { rows: CompareRow[]; curLabel: string; prevLabel: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead><tr className="border-b border-line text-ink-mute"><th className="py-2 pr-4 font-medium">Measure</th><th className="py-2 pr-4 font-medium">{curLabel}</th><th className="py-2 pr-4 font-medium">{prevLabel}</th><th className="py-2 font-medium">Change</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const ch = pctChange(r.cur, r.prev);
            const up = r.cur > r.prev;
            const good = ch === null || ch === 0 ? null : up === (r.upIsGood ?? true);
            return (
              <tr key={r.label} className="border-b border-line last:border-0">
                <th scope="row" className="py-2.5 pr-4 font-medium text-ink-soft">{r.label}</th>
                <td className="py-2.5 pr-4 font-semibold">{r.fmt(r.cur)}</td>
                <td className="py-2.5 pr-4">{r.fmt(r.prev)}</td>
                <td className={`py-2.5 font-medium ${good === null ? "text-ink-mute" : good ? "text-emerald-700" : "text-red-700"}`}>
                  {ch === null ? "New" : ch === 0 ? "No change" : `${up ? "▲" : "▼"} ${Math.abs(ch)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
