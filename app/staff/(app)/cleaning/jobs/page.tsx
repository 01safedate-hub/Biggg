import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { CLEANING_CREW } from "@/lib/cleaning-roles";
import { dayLabel, lagosDate } from "@/lib/cleaning";
import { CrewJob, type Job } from "@/components/cleaning/CrewJob";

export const metadata = { title: "My cleaning jobs" };
export const dynamic = "force-dynamic";

export default async function CrewJobs({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole(CLEANING_CREW);
  const today = lagosDate();
  const day = sp.day === "tomorrow" ? lagosDate(1) : today;
  const [{ data, error }, { data: info }] = await Promise.all([
    supabase.rpc("my_cleaning_jobs" as never, { _date: day } as never),
    supabase.rpc("cleaning_public_info" as never),
  ]);
  const jobs = (data ?? []) as unknown as Job[];
  const addons = ((info as unknown as { addons?: { code: string; label: string; price_kobo: number }[] } | null)?.addons ?? []);
  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My cleaning jobs</h1>
          <p className="mt-1 text-sm text-ink-soft">{dayLabel(day)}. Arrive on time, be polite, take before and after photos, and never ask the customer for cash.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link className={`btn-secondary ${day === today ? "!border-brand" : ""}`} href="/staff/cleaning/jobs">Today</Link>
          <Link className={`btn-secondary ${day !== today ? "!border-brand" : ""}`} href="/staff/cleaning/jobs?day=tomorrow">Tomorrow</Link>
        </div>
      </div>
      {error && <p className="card p-4 text-sm text-red-700">Could not load your jobs.</p>}
      {!error && jobs.length === 0 && <p className="card p-5 text-sm text-ink-soft">No jobs assigned to you for this day.</p>}
      {jobs.map((j) => <CrewJob key={j.id} job={j} addons={addons} />)}
    </div>
  );
}
