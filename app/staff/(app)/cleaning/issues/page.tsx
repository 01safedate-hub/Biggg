import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { CLEANING_DESK, CLEANING_MANAGER } from "@/lib/cleaning-roles";
import { dateTimeLabel, dayLabel, nairaK } from "@/lib/cleaning";
import { IssueResolve } from "@/components/cleaning/AdminTools";

export const metadata = { title: "Cleaning issues" };
export const dynamic = "force-dynamic";

type Issue = { id: string; kind: string; description: string; photos: string[]; status: string; outcome: string | null; payout_kobo: number; created_at: string; raised_by: string | null;
  visit_id: string; visit_no: number; date: string; customer: string; phone: string | null; address: string; before: string[]; after: string[] };
const KIND: Record<string, string> = { complaint: "Customer complaint", damage: "Damage", unsafe: "Unsafe, job stopped", other: "Other" };

export default async function CleaningIssues({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const sp = await searchParams;
  const { supabase, roles } = await requireRole(CLEANING_DESK);
  const manager = roles.some((r) => CLEANING_MANAGER.includes(r));
  const [{ data, error }, { data: cfg }] = await Promise.all([
    supabase.rpc("cleaning_issues_list" as never, { _open: sp.all !== "1" } as never),
    manager ? supabase.rpc("cleaning_admin_config" as never) : Promise.resolve({ data: null }),
  ]);
  const issues = ((data ?? []) as unknown as Issue[]).slice(0, 100);
  const cap = Number((cfg as unknown as { settings?: { damage_cap_kobo?: number } } | null)?.settings?.damage_cap_kobo ?? 5000000);
  const paths = issues.flatMap((i) => [...(i.photos ?? []), ...(i.before ?? []).slice(0, 4), ...(i.after ?? []).slice(0, 4)]);
  const { data: signed } = paths.length ? await supabase.storage.from("cleaning-photos").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map<string, string>((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
  const thumbs = (list: string[], label: string) => list.length ? (
    <div className="space-y-1"><p className="text-xs text-ink-mute">{label}</p><div className="flex flex-wrap gap-2">{list.map((p) => url.get(p) ? <a key={p} href={url.get(p)} target="_blank" rel="noreferrer"><img src={url.get(p)} alt={label} className="h-16 w-16 rounded-md object-cover" /></a> : null)}</div></div>
  ) : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cleaning issues</h1>
          <p className="mt-1 text-sm text-ink-soft">Call the customer the same day. Compare before and after photos. Re-cleans are free and get half the original time.</p>
        </div>
        <Link className="btn-secondary" href={sp.all === "1" ? "/staff/cleaning/issues" : "/staff/cleaning/issues?all=1"}>{sp.all === "1" ? "Open only" : "Show closed too"}</Link>
      </div>
      {error && <p className="card p-4 text-sm text-red-700">Could not load issues.</p>}
      {!error && issues.length === 0 && <p className="card p-5 text-sm text-ink-soft">No open issues.</p>}
      {issues.map((i) => (
        <div key={i.id} className="card space-y-2 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-semibold">{KIND[i.kind] ?? i.kind} · visit #{i.visit_no} on {dayLabel(i.date)}</p>
            <span className="text-sm">{i.status.replace("_", " ")}</span>
          </div>
          <p className="text-sm">{i.customer} {i.phone ? <a className="underline" href={`tel:${i.phone}`}>{i.phone}</a> : null} · {i.address}</p>
          <p className="rounded-md bg-canvas p-3 text-sm">{i.description}</p>
          <p className="text-xs text-ink-mute">{dateTimeLabel(i.created_at)}{i.raised_by ? ` · by ${i.raised_by}` : ""}</p>
          {thumbs(i.photos ?? [], "Photos sent")}
          {thumbs((i.before ?? []).slice(0, 4), "Before")}
          {thumbs((i.after ?? []).slice(0, 4), "After")}
          {i.outcome && <p className="text-sm"><strong>Outcome:</strong> {i.outcome}{i.payout_kobo ? ` · paid ${nairaK(i.payout_kobo)}` : ""}</p>}
          {manager && i.status === "open" && <IssueResolve issueId={i.id} capKobo={cap} superAdmin={roles.includes("super_admin")} />}
        </div>
      ))}
    </div>
  );
}
