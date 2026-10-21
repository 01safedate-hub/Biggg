import { EVIDENCE_LABEL } from "@/lib/money";
import type { Proof } from "@/lib/proofs";

export function ProofLinks({ proofs }: { proofs: Proof[] | undefined }) {
  if (!proofs || proofs.length === 0) return <p className="text-xs text-red-700">No proof on file</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {proofs.map((p, i) => (
        <li key={p.id}>
          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-block rounded border border-line px-2 py-1 text-xs font-medium text-brand-dark hover:bg-brand-tint">
              {EVIDENCE_LABEL[p.kind] ?? "Proof"} {i + 1}
            </a>
          ) : <span className="text-xs text-ink-mute">{EVIDENCE_LABEL[p.kind] ?? "Proof"} {i + 1} (unavailable)</span>}
        </li>
      ))}
    </ul>
  );
}
