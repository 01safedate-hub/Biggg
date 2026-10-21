const STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-red-50 text-red-800 border-red-200",
  voided: "bg-slate-100 text-slate-600 border-slate-200",
};
const LABEL: Record<string, string> = { pending: "Awaiting approval", approved: "Approved", rejected: "Rejected", voided: "Voided" };

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${STYLE[status] ?? STYLE.voided}`}>{LABEL[status] ?? status}</span>;
}
