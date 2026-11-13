import { requireRole } from "@/lib/roles";
import { buildStaffNav, navHrefs } from "@/lib/staff-nav";
import { chaptersFor, visibleSteps, type StaffProgress } from "@/lib/guide-content";
import { ROLE_NAME } from "@/lib/staff";

export const metadata = { title: "Staff guide progress" };
export const dynamic = "force-dynamic";

type Row = { id: string; name: string | null; phone: string | null; roles: string[] | null; progress: StaffProgress & { updated_at?: string } };

export default async function GuideProgressPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole(["admin", "super_admin"]);
  const { data, error } = await supabase.rpc("staff_guide_progress" as never);
  const rows = ((data ?? []) as unknown as Row[]).map((r) => {
    const roles = r.roles ?? [];
    // Support access is per person; count its step only where it is already in their progress.
    const hrefs = navHrefs(buildStaffNav(roles, false));
    const chapters = chaptersFor(roles).filter((c) => visibleSteps(c.steps, hrefs).length > 0);
    const done = chapters.filter((c) => r.progress.chapters?.[c.id]?.status === "done");
    const started = chapters.filter((c) => r.progress.chapters?.[c.id]?.status === "in_progress");
    return { ...r, roles, chapters, done, started, finished: chapters.length > 0 && done.length === chapters.length };
  });
  const list = sp.show === "all" ? rows : rows.filter((r) => !r.finished);
  const finished = rows.filter((r) => r.finished).length;
  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff guide progress</h1>
          <p className="mt-1 text-sm text-ink-soft">{finished} of {rows.length} active staff have finished every chapter for their job. Chapters depend on each person&apos;s roles.</p>
        </div>
        <a className="btn-secondary" href={sp.show === "all" ? "/staff/guide/progress" : "/staff/guide/progress?show=all"}>{sp.show === "all" ? "Not finished only" : "Show everyone"}</a>
      </div>
      {error && <p className="card p-4 text-sm text-red-700">Could not load progress.</p>}
      {!error && list.length === 0 && <p className="card p-5 text-sm text-ink-soft">Everyone has finished their guide.</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-mute"><th className="px-4 py-2">Staff</th><th className="px-4 py-2">Roles</th><th className="px-4 py-2">Chapters</th><th className="px-4 py-2">Still to do</th><th className="px-4 py-2">Last activity</th></tr></thead>
          <tbody>
            {list.map((r) => {
              const pct = r.chapters.length ? Math.round((r.done.length / r.chapters.length) * 100) : 0;
              const todo = r.chapters.filter((c) => !r.done.includes(c));
              return (
                <tr key={r.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3"><p className="font-medium">{r.name ?? "No name"}</p>{r.phone && <a className="text-xs text-ink-soft underline" href={`tel:${r.phone}`}>{r.phone}</a>}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{r.roles.map((x) => ROLE_NAME[x] ?? x).join(", ")}</td>
                  <td className="px-4 py-3">
                    <p className={r.finished ? "font-medium text-emerald-700" : ""}>{r.done.length} of {r.chapters.length}</p>
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{todo.length ? todo.map((c) => `${c.title}${r.started.includes(c) ? " (started)" : ""}`).join(", ") : "Nothing"}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{r.progress.updated_at ? new Date(r.progress.updated_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }) : "Never opened"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
