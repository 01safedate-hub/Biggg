"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { ACCEPT, MAX_FILES, checkFile, type EvidenceItem, type EvidenceKind } from "@/lib/evidence";
import { EVIDENCE_LABEL } from "@/lib/money";
import { inputCls } from "./ui";

export function EvidenceUploader({ items, onChange, onError }: {
  items: EvidenceItem[]; onChange: (next: EvidenceItem[]) => void; onError: (msg: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function add(files: FileList | null) {
    if (!files) return;
    const next = [...items];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_FILES) return onError(`You can attach up to ${MAX_FILES} files.`);
      const problem = checkFile(f);
      if (problem) return onError(problem);
      next.push({ id: crypto.randomUUID(), file: f, kind: "receipt" });
    }
    onError(null);
    onChange(next);
    if (ref.current) ref.current.value = "";
  }

  return (
    <div>
      <p className="text-sm font-medium">Proof <span className="font-normal text-ink-mute">(required: receipt, invoice or bank debit screenshot)</span></p>
      <ul className="mt-2 space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 rounded-md border border-line p-2 text-sm">
            <Paperclip className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
            <select aria-label={`Type of ${it.file.name}`} value={it.kind} className="rounded border border-line px-2 py-1 text-xs"
              onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, kind: e.target.value as EvidenceKind } : x)))}>
              {Object.entries(EVIDENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" aria-label={`Remove ${it.file.name}`} onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="rounded p-1 text-ink-mute hover:bg-canvas">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <input ref={ref} type="file" accept={ACCEPT} multiple onChange={(e) => add(e.target.files)} className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm`} aria-label="Add proof files" />
    </div>
  );
}
