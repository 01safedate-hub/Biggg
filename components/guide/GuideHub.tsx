"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, CircleDashed, SkipForward } from "lucide-react";
import { startGuide, type GuideKind } from "@/lib/guide-client";
import { saveTourProgress } from "@/lib/ui-prefs-actions";
import type { GuideStep, StaffProgress, StepProgress } from "@/lib/guide-content";

export function StartGuideButton({ kind, chapter = null, stepId, label, variant = "primary" }: { kind: GuideKind; chapter?: string | null; stepId?: string; label: string; variant?: "primary" | "secondary" | "link" }) {
  const cls = variant === "link" ? "text-sm font-medium text-brand-dark underline" : variant === "secondary" ? "btn-secondary" : "btn-primary";
  return <button type="button" className={cls} onClick={() => startGuide(kind, chapter, 0, stepId)}>{label}</button>;
}

function StepStatus({ id, p }: { id: string; p: StepProgress }) {
  if ((p.seen ?? []).includes(id)) return <Check aria-label="Seen" className="h-4 w-4 shrink-0 text-emerald-600" />;
  if ((p.skipped ?? []).includes(id)) return <SkipForward aria-label="Skipped" className="h-4 w-4 shrink-0 text-amber-600" />;
  return <CircleDashed aria-label="Not seen yet" className="h-4 w-4 shrink-0 text-ink-mute" />;
}

// The full text of a set of steps, readable without the guide cards.
export function StepList({ kind, chapter = null, steps, progress }: { kind: GuideKind; chapter?: string | null; steps: GuideStep[]; progress: StepProgress }) {
  return (
    <ol className="divide-y divide-line">
      {steps.map((s, i) => (
        <li key={s.id}>
          <details className="group py-3">
            <summary className="flex cursor-pointer list-none items-center gap-3">
              <StepStatus id={s.id} p={progress} />
              <span className="flex-1 text-sm font-medium">{i + 1}. {s.title}</span>
              <ChevronDown aria-hidden className="h-4 w-4 text-ink-mute transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-2 pl-7 text-sm leading-6 text-ink-soft">
              {s.body.map((t) => <p key={t}>{t}</p>)}
              {s.points?.length ? <ul className="list-disc space-y-1 pl-5">{s.points.map((t) => <li key={t}>{t}</li>)}</ul> : null}
              {s.tip && <p className="rounded-md bg-brand-tint px-3 py-2 text-xs text-brand-dark">{s.tip}</p>}
              <StartGuideButton kind={kind} chapter={chapter} stepId={s.id} label="Show me in the app" variant="link" />
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}

// Start over, or mark a chapter done without going through it.
export function ProgressActions({ kind, chapter, progress, staffProgress }: { kind: GuideKind; chapter?: string; progress: StepProgress; staffProgress?: StaffProgress }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(next: StepProgress) {
    setBusy(true);
    const payload = kind === "customer" ? next : { ...(staffProgress ?? {}), welcomed: true, chapters: { ...(staffProgress?.chapters ?? {}), [chapter ?? "start"]: next } };
    await saveTourProgress(kind, payload as Record<string, unknown>);
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {progress.status !== "done" && <button type="button" disabled={busy} className="font-medium text-ink-soft underline" onClick={() => set({ ...progress, status: "done" })}>Mark as done</button>}
      {(progress.status || progress.seen?.length || progress.skipped?.length) ? <button type="button" disabled={busy} className="font-medium text-ink-soft underline" onClick={() => set({ status: "in_progress", step: 0, seen: [], skipped: [] })}>Start over</button> : null}
    </div>
  );
}
