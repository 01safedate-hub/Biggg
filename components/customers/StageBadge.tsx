import { STAGE_BY_KEY } from "@/lib/customers";

export function StageBadge({ stage }: { stage: string }) {
  const s = STAGE_BY_KEY[stage];
  if (!s) return null;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-medium"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>;
}
