"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveTourProgress } from "@/lib/ui-prefs-actions";
import { CUSTOMER_STEPS, chaptersFor, visibleSteps, type GuideStep, type StaffProgress, type StepProgress } from "@/lib/guide-content";
import { GUIDE_EVENT, readActive, writeActive, type ActiveGuide, type GuideKind } from "@/lib/guide-client";

type Props = { kind: GuideKind; hrefs: string[]; roles?: string[]; initial?: Record<string, unknown> | null };
type Mode = "closed" | "offer" | "step" | "chapter-done" | "saved";

const DESKTOP = 1024;
const CARD_W = 340;

const uniq = (a: string[]) => [...new Set(a)];

export function GuideRunner({ kind, hrefs, roles = [], initial }: Props) {
  const path = usePathname();
  const [loaded, setLoaded] = useState(initial !== undefined);
  const [customer, setCustomer] = useState<StepProgress>(() => (kind === "customer" ? ((initial ?? {}) as StepProgress) : {}));
  const [staff, setStaff] = useState<StaffProgress>(() => (kind === "staff" ? ((initial ?? {}) as StaffProgress) : {}));
  const [active, setActive] = useState<ActiveGuide | null>(null);
  const [mode, setMode] = useState<Mode>("closed");
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number } | null>(null);
  const [desktop, setDesktop] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const highlighted = useRef<Element | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chapters = useMemo(() => (kind === "staff" ? chaptersFor(roles) : []), [kind, roles]);
  const steps: GuideStep[] = useMemo(() => {
    if (kind === "customer") return visibleSteps(CUSTOMER_STEPS, hrefs);
    const ch = chapters.find((c) => c.id === active?.chapter) ?? chapters[0];
    return ch ? visibleSteps(ch.steps, hrefs) : [];
  }, [kind, hrefs, chapters, active?.chapter]);
  const chapter = kind === "staff" ? chapters.find((c) => c.id === active?.chapter) ?? chapters[0] : null;
  const byId = active?.stepId ? steps.findIndex((x) => x.id === active.stepId) : -1;
  const idx = Math.min(Math.max(byId >= 0 ? byId : active?.step ?? 0, 0), Math.max(steps.length - 1, 0));
  const step = steps[idx];

  // Customers: load progress in the browser (staff progress comes from the server).
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    createClient().rpc("my_ui_prefs" as never).then(({ data }) => {
      if (!alive) return;
      const tours = ((data as unknown as { tours?: Record<string, unknown> } | null)?.tours ?? {}) as Record<string, unknown>;
      if (kind === "customer") setCustomer((tours.customer ?? {}) as StepProgress);
      else setStaff((tours.staff ?? {}) as StaffProgress);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [loaded, kind]);

  const persist = useCallback((next: StepProgress | StaffProgress) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveTourProgress(kind, next as Record<string, unknown>); }, 400);
  }, [kind]);

  // Resume a guide that was open before a page change, or one started from a guide page.
  useEffect(() => {
    const a = readActive();
    if (a && a.kind === kind) { setActive(a); setMode("step"); }
    const onStart = (e: Event) => {
      const v = (e as CustomEvent<ActiveGuide>).detail;
      if (v.kind !== kind) return;
      setActive(v); setMode("step");
    };
    window.addEventListener(GUIDE_EVENT, onStart);
    return () => window.removeEventListener(GUIDE_EVENT, onStart);
  }, [kind]);

  // First visit: customers get the guide on their dashboard; staff are offered it on their home page.
  useEffect(() => {
    if (!loaded || mode !== "closed" || readActive()) return;
    if (kind === "customer" && !customer.status && path === "/dashboard") {
      const v = { kind, chapter: null, step: 0 };
      writeActive(v); setActive(v); setMode("step");
    }
    if (kind === "staff" && !staff.welcomed && path === "/staff") setMode("offer");
  }, [loaded, kind, path, customer.status, staff.welcomed, mode]);

  useEffect(() => {
    const onResize = () => setDesktop(window.innerWidth >= DESKTOP);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Highlight the menu item for this step and place the card beside it.
  const clearHighlight = useCallback(() => {
    highlighted.current?.removeAttribute("data-guide-active");
    highlighted.current = null;
  }, []);
  const place = useCallback(() => {
    const el = highlighted.current as HTMLElement | null;
    const card = cardRef.current;
    if (!el || !card || !desktop) { setPos(null); return; }
    const r = el.getBoundingClientRect();
    const h = card.offsetHeight || 260;
    const mid = r.top + r.height / 2;
    const top = Math.max(16, Math.min(mid - h / 2, window.innerHeight - h - 16));
    setPos({ top, left: Math.min(r.right + 18, window.innerWidth - CARD_W - 16), arrow: Math.max(18, Math.min(mid - top, h - 18)) });
  }, [desktop]);

  useLayoutEffect(() => {
    clearHighlight();
    if (mode !== "step" || !step) { setPos(null); return; }
    const key = step.target ?? step.href;
    if (!key) {
      setPos(null);
      if (!desktop) window.dispatchEvent(new CustomEvent("lp-menu", { detail: false }));
      return;
    }
    let cancelled = false;
    const find = () => {
      const scope = document.querySelector(desktop ? '[data-sidebar="desktop"]' : '[data-sidebar="mobile"]');
      return scope?.querySelector(`[data-guide="${CSS.escape(key)}"]`) ?? null;
    };
    const apply = () => {
      if (cancelled) return;
      const el = find();
      if (!el) { setPos(null); return; }
      el.setAttribute("data-guide-active", "1");
      highlighted.current = el;
      (el as HTMLElement).style.scrollMarginTop = "72px";
      (el as HTMLElement).scrollIntoView({ block: desktop ? "nearest" : "start", behavior: "smooth" });
      requestAnimationFrame(place);
    };
    if (!desktop) {
      // On phones, open the menu so the item can be seen above the card.
      window.dispatchEvent(new CustomEvent("lp-menu", { detail: true }));
      const t = setTimeout(apply, 80);
      return () => { cancelled = true; clearTimeout(t); };
    }
    apply();
    return () => { cancelled = true; };
  }, [mode, step, desktop, clearHighlight, place]);

  useEffect(() => {
    if (mode !== "step") return;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    document.addEventListener("scroll", onMove, true);
    return () => { window.removeEventListener("resize", onMove); document.removeEventListener("scroll", onMove, true); };
  }, [mode, place]);

  useEffect(() => { if (mode === "step") cardRef.current?.focus({ preventScroll: true }); }, [mode, idx, active?.chapter]);
  useEffect(() => () => clearHighlight(), [clearHighlight]);

  // ---------- progress ----------
  function record(update: (p: StepProgress) => StepProgress) {
    if (kind === "customer") {
      const next = update(customer);
      setCustomer(next); persist(next);
    } else if (chapter) {
      const cur = staff.chapters?.[chapter.id] ?? {};
      const next: StaffProgress = { ...staff, welcomed: true, chapters: { ...(staff.chapters ?? {}), [chapter.id]: update(cur) } };
      setStaff(next); persist(next);
    }
  }
  function go(to: number) {
    const v = { kind, chapter: active?.chapter ?? chapter?.id ?? null, step: to };
    writeActive(v); setActive(v);
  }
  function close(next: Mode) {
    clearHighlight();
    writeActive(null);
    window.dispatchEvent(new CustomEvent("lp-menu", { detail: false }));
    setMode(next);
    if (next === "saved") setTimeout(() => setMode((m) => (m === "saved" ? "closed" : m)), 4500);
  }
  function next(skip = false) {
    if (!step) return;
    const last = idx >= steps.length - 1;
    record((p) => ({
      ...p,
      status: last ? "done" : "in_progress",
      step: last ? 0 : idx + 1,
      seen: skip ? (p.seen ?? []).filter((x) => x !== step.id) : uniq([...(p.seen ?? []), step.id]),
      skipped: skip ? uniq([...(p.skipped ?? []), step.id]) : (p.skipped ?? []).filter((x) => x !== step.id),
    }));
    if (last) close(kind === "staff" ? "chapter-done" : "closed");
    else go(idx + 1);
  }
  function later() {
    record((p) => ({ ...p, status: p.status === "done" ? "done" : "in_progress", step: idx }));
    close("saved");
  }
  function startChapter(id: string) {
    const v = { kind, chapter: id, step: 0 };
    writeActive(v); setActive(v); setMode("step");
  }

  // Escape closes the guide and keeps the place.
  const laterRef = useRef(later);
  laterRef.current = later;
  useEffect(() => {
    if (mode !== "step") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") laterRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  // ---------- rendering ----------
  const where = kind === "staff" ? "Staff guide" : "Getting started";
  const guideHref = kind === "staff" ? "/staff/guide" : "/guide";
  const shell = (children: React.ReactNode, label: string) => (
    <div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="false" aria-label={label}
      style={desktop && pos ? { top: pos.top, left: pos.left, width: CARD_W } : undefined}
      className={`guide-in fixed z-[60] rounded-xl border border-line bg-white p-4 shadow-2xl outline-none transition-[top,left] duration-300 ease-out
        ${desktop ? (pos ? "" : "bottom-6 right-6 w-[340px]") : "inset-x-3 bottom-3"}`}>
      {children}
    </div>
  );

  if (mode === "saved") {
    return (
      <div role="status" className="guide-in fixed bottom-4 left-1/2 z-[60] w-[min(92vw,360px)] -translate-x-1/2 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-xl">
        Guide saved. Continue any time from <Link href={guideHref} className="font-semibold underline">{where}</Link>.
      </div>
    );
  }

  if (mode === "offer" && kind === "staff") {
    const count = chapters.reduce((n, c) => n + visibleSteps(c.steps, hrefs).length, 0);
    return shell(
      <>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-dark">Staff guide</p>
        <h2 className="mt-1 text-lg font-bold">Welcome to the team</h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">A step-by-step tour of every page you use: {chapters.length} chapter{chapters.length === 1 ? "" : "s"}, {count} short steps. Stop whenever you like and carry on later.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => startChapter(chapters[0]?.id ?? "start")}>Start the guide</button>
          <button type="button" className="btn-secondary" onClick={() => { const n = { ...staff, welcomed: true }; setStaff(n); persist(n); close("saved"); }}>Later</button>
        </div>
      </>, "Staff guide",
    );
  }

  if (mode === "chapter-done" && kind === "staff") {
    const done = new Set(Object.entries(staff.chapters ?? {}).filter(([, v]) => v.status === "done").map(([k]) => k));
    const upNext = chapters.find((c) => !done.has(c.id));
    return shell(
      <>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Chapter finished</p>
        <h2 className="mt-1 text-lg font-bold">{chapter?.title}: done</h2>
        <p className="mt-2 text-sm text-ink-soft">{upNext ? `Next: ${upNext.title}. ${upNext.summary}` : "You have finished every chapter for your job. Well done."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {upNext && <button type="button" className="btn-primary" onClick={() => startChapter(upNext.id)}>Start next chapter</button>}
          <button type="button" className="btn-secondary" onClick={() => setMode("closed")}>{upNext ? "Later" : "Close"}</button>
        </div>
      </>, "Chapter finished",
    );
  }

  if (mode !== "step" || !step) return null;
  const onPage = step.href ? path === step.href || (step.alt ?? []).includes(path) : true;
  const pct = Math.round(((idx + 1) / steps.length) * 100);
  return shell(
    <>
      {desktop && pos && <span aria-hidden style={{ top: pos.arrow }} className="absolute -left-2 h-4 w-4 -translate-y-1/2 rotate-45 border-b border-l border-line bg-white transition-[top] duration-300" />}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-dark">{chapter ? chapter.title : where} · {idx + 1} of {steps.length}</p>
        <button type="button" onClick={later} aria-label="Close the guide and continue later" title="Finish later" className="-mr-1 -mt-1 rounded-md p-1 text-ink-mute hover:bg-canvas hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
      <div key={`${active?.chapter}-${idx}`} className="guide-in">
        <h2 className="mt-3 text-base font-bold">{step.title}</h2>
        {step.body.map((t) => <p key={t} className="mt-1.5 text-sm leading-6 text-ink-soft">{t}</p>)}
        {step.points?.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">{step.points.map((t) => <li key={t}>{t}</li>)}</ul> : null}
        {step.tip && <p className="mt-2 rounded-md bg-brand-tint px-3 py-2 text-xs leading-5 text-brand-dark">{step.tip}</p>}
        {step.href && !onPage && <Link href={step.href} className="mt-2 inline-block text-sm font-semibold text-brand-dark underline">Open this page</Link>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={() => go(idx - 1)} disabled={idx === 0} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-ink-soft hover:bg-canvas disabled:invisible"><ArrowLeft className="h-4 w-4" aria-hidden /> Back</button>
        <div className="flex items-center gap-1">
          {idx < steps.length - 1 && <button type="button" onClick={() => next(true)} className="rounded-md px-2 py-1.5 text-sm font-medium text-ink-mute hover:bg-canvas hover:text-ink">Skip</button>}
          <button type="button" onClick={() => next(false)} className="btn-primary inline-flex items-center gap-1 !px-3 !py-1.5 text-sm">{idx === steps.length - 1 ? "Finish" : "Next"} {idx < steps.length - 1 && <ArrowRight className="h-4 w-4" aria-hidden />}</button>
        </div>
      </div>
    </>, step.title,
  );
}
