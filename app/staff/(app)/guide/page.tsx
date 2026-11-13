import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { buildStaffNav, navHrefs } from "@/lib/staff-nav";
import { chaptersFor, visibleSteps, type StaffProgress } from "@/lib/guide-content";
import { ProgressActions, StartGuideButton, StepList } from "@/components/guide/GuideHub";

export const metadata = { title: "Staff guide" };
export const dynamic = "force-dynamic";

export default async function StaffGuidePage() {
  const { supabase, roles } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent", "commission_agent", "washer", "inspector", "cleaning_lead", "cleaner", "scheduler"]);
  const [{ data: supportAllowed }, { data: prefs }] = await Promise.all([supabase.rpc("staff_support_allowed"), supabase.rpc("my_ui_prefs" as never)]);
  const hrefs = navHrefs(buildStaffNav(roles, supportAllowed === true));
  const progress = (((prefs as unknown as { tours?: Record<string, unknown> } | null)?.tours?.staff) ?? {}) as StaffProgress;
  const chapters = chaptersFor(roles).map((c) => ({ ...c, steps: visibleSteps(c.steps, hrefs) })).filter((c) => c.steps.length > 0);
  const done = chapters.filter((c) => progress.chapters?.[c.id]?.status === "done").length;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff guide</h1>
        <p className="mt-1 text-sm text-ink-soft">Everything you need for your job, one chapter at a time. Each step points at a page in your menu. Skip what you know, close it any time, and carry on later from here. You can also read every chapter below as text.</p>
      </div>
      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">{done} of {chapters.length} chapters finished</p>
          {done < chapters.length && (() => {
            const next = chapters.find((c) => progress.chapters?.[c.id]?.status !== "done")!;
            const p = progress.chapters?.[next.id];
            return <StartGuideButton kind="staff" chapter={next.id} label={p?.status === "in_progress" ? `Continue: ${next.title}` : `Start: ${next.title}`}
              stepId={p?.status === "in_progress" ? next.steps[Math.min(p.step ?? 0, next.steps.length - 1)]?.id : undefined} />;
          })()}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((done / Math.max(chapters.length, 1)) * 100)}%` }} /></div>
        <p className="text-xs text-ink-mute">Tip: use Arrange menu at the top of the menu to pin the pages you use most.</p>
      </section>
      {chapters.map((c, n) => {
        const p = progress.chapters?.[c.id] ?? {};
        const seen = c.steps.filter((s) => (p.seen ?? []).includes(s.id)).length;
        return (
          <section key={c.id} id={c.id} className="card space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-mute">Chapter {n + 1}</p>
                <h2 className="text-lg font-semibold">{c.title}</h2>
                <p className="text-sm text-ink-soft">{c.summary}</p>
                <p className={`mt-1 text-xs font-medium ${p.status === "done" ? "text-emerald-700" : "text-ink-mute"}`}>{p.status === "done" ? "Finished" : p.status === "in_progress" ? `In progress · ${seen} of ${c.steps.length} seen` : `${c.steps.length} steps`}</p>
              </div>
              <StartGuideButton kind="staff" chapter={c.id} variant={p.status === "done" ? "secondary" : "primary"}
                label={p.status === "done" ? "Go through again" : p.status === "in_progress" ? "Continue" : "Start"}
                stepId={p.status === "in_progress" ? c.steps[Math.min(p.step ?? 0, c.steps.length - 1)]?.id : undefined} />
            </div>
            <StepList kind="staff" chapter={c.id} steps={c.steps} progress={p} />
            <ProgressActions kind="staff" chapter={c.id} progress={p} staffProgress={progress} />
          </section>
        );
      })}
      {roles.some((r) => r === "admin" || r === "super_admin") && <p className="text-sm"><Link href="/staff/guide/progress" className="font-medium underline">See which staff have finished their guide</Link></p>}
    </div>
  );
}
