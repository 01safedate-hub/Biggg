// Starting and tracking the guide in the browser. The open guide survives page changes in this tab.
export type GuideKind = "customer" | "staff";
export type ActiveGuide = { kind: GuideKind; chapter: string | null; step: number; stepId?: string };

const KEY = "lp-guide";
export const GUIDE_EVENT = "lp-guide";

export function readActive(): ActiveGuide | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ActiveGuide;
    return v && (v.kind === "customer" || v.kind === "staff") && Number.isInteger(v.step) ? v : null;
  } catch {
    return null;
  }
}

export function writeActive(v: ActiveGuide | null) {
  try {
    if (v) sessionStorage.setItem(KEY, JSON.stringify(v));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the guide still works on this page */
  }
}

export function startGuide(kind: GuideKind, chapter: string | null = null, step = 0, stepId?: string) {
  const v: ActiveGuide = { kind, chapter, step, ...(stepId ? { stepId } : {}) };
  writeActive(v);
  window.dispatchEvent(new CustomEvent<ActiveGuide>(GUIDE_EVENT, { detail: v }));
}
