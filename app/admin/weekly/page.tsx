import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { MarkPaid, TeamTargetForm } from "@/components/admin/WeeklyControls";

export const metadata = { title: "Weekly team target" };
export const dynamic = "force-dynamic";

type Bank = { bank_name: string | null; account_number: string | null; account_name: string | null };
type Member = Bank & { staff_id: string; name: string; job_title: string | null };
type Payout = Bank & { id: string; staff_id: string; name: string; gross_kobo: number; fee_kobo: number; net_kobo: number; status: string; paid_at: string | null };
type Board = {
  week_start: string; counts_from?: string; week_end: string; this_week: string; is_owner: boolean; fee_pct: number; units: number; pct: number | null;
  target: { units: number; pool_kobo: number; status: "open" | "hit"; hit_at: string | null; hit_units: number | null; set_at: string; updated_at: string } | null;
  share: { members: number; gross_kobo: number; fee_kobo: number; net_kobo: number };
  members: Member[]; payouts: Payout[];
};

const shift = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const bankLine = (b: Bank) => b.account_number ? `${b.bank_name ?? "Bank"} · ${b.account_number} · ${b.account_name ?? ""}` : null;

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("weekly_board", week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? { _week_start: week } : {});
  const b = data as unknown as Board | null;
  if (error || !b) return <p role="alert" className="text-sm text-red-700">The weekly board could not be loaded. Please refresh.</p>;

  const t = b.target;
  const editable = b.is_owner && (b.week_start === b.this_week || b.week_start === shift(b.this_week, 7)) && t?.status !== "hit";
  const isNext = b.week_start === shift(b.this_week, 7);
  const missingBank = b.members.filter((m) => !m.account_number);
  const unpaid = b.payouts.filter((p) => p.status !== "paid");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Weekly team target</h1>
        <p className="mt-1 text-sm text-ink-soft">
          One target for the whole team. Weeks run Monday to Saturday (Sundays never count); a target set mid-week counts from the day it is set. Every item that enters the wash queue counts automatically. When the team reaches it, the pool is shared
          equally by everyone on the weekly target, with {b.fee_pct}% of each share kept for running costs.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{longDate(b.counts_from ?? b.week_start)} to {longDate(b.week_end)}{b.week_start === b.this_week ? " · this week" : isNext ? " · next week" : ""}</h2>
        <div className="flex gap-2 text-sm">
          <Link className="btn-secondary !px-3 !py-1.5" href={`/admin/weekly?week=${shift(b.week_start, -7)}`}>Previous</Link>
          {b.week_start !== b.this_week && <Link className="btn-secondary !px-3 !py-1.5" href="/admin/weekly">This week</Link>}
          <Link className="btn-secondary !px-3 !py-1.5" href={`/admin/weekly?week=${shift(b.week_start, 7)}`}>Next</Link>
        </div>
      </div>

      <section className="card p-5" aria-label="Team progress">
        {t ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-3xl font-bold tabular-nums">{b.units.toLocaleString("en-NG")} <span className="text-base font-medium text-ink-mute">of {t.units.toLocaleString("en-NG")} clothes</span></p>
              {t.status === "hit"
                ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">Hit {t.hit_at ? new Date(t.hit_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : ""}</span>
                : <span className="text-sm text-ink-mute">{Math.max(0, t.units - b.units).toLocaleString("en-NG")} to go</span>}
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-label="Team progress" aria-valuenow={b.pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${t.status === "hit" ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${b.pct ?? 0}%` }} />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-mute">Pool</dt><dd className="font-semibold">{naira(t.pool_kobo)}</dd></div>
              <div><dt className="text-ink-mute">Shared by</dt><dd className="font-semibold">{t.status === "hit" ? b.payouts.length : b.share.members} people</dd></div>
              <div><dt className="text-ink-mute">Each receives</dt><dd className="font-semibold">{naira(t.status === "hit" ? (b.payouts[0]?.net_kobo ?? 0) : b.share.net_kobo)} <span className="font-normal text-ink-mute">after {b.fee_pct}%</span></dd></div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-ink-soft">No target set for this week. {b.units.toLocaleString("en-NG")} clothes have entered the wash queue so far.</p>
        )}
      </section>

      {editable && (
        <section className="card p-5" aria-label="Set the target">
          <h2 className="text-lg font-semibold">{t ? "Change the target" : "Set the target"}</h2>
          <p className="mb-3 mt-1 text-sm text-ink-soft">Only your account can do this. Everyone on the weekly target gets an email right away with the target, their share and tips to hit it.</p>
          <TeamTargetForm weekStart={b.week_start} label={`the week of ${longDate(b.week_start)}`} units={t?.units ?? null} poolKobo={t?.pool_kobo ?? null}
            members={b.share.members} feePct={b.fee_pct} editing={!!t} />
        </section>
      )}
      {!b.is_owner && <p className="text-sm text-ink-mute">Only the owner account can set the weekly team target.</p>}

      {b.payouts.length > 0 && (
        <section className="card p-5" aria-label="Payouts">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Shares to pay</h2>
            <p className="text-sm text-ink-mute">{unpaid.length ? `${unpaid.length} to pay · ${naira(unpaid.reduce((n, p) => n + p.net_kobo, 0))}` : "All paid"}</p>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {b.payouts.map((p) => (
              <li key={p.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className={`text-sm ${bankLine(p) ? "text-ink-soft" : "text-amber-700"}`}>{bankLine(p) ?? "No bank details yet. Ask them to add them in My details."}</p>
                  <p className="text-xs text-ink-mute">{naira(p.gross_kobo)} less {naira(p.fee_kobo)} running costs</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{naira(p.net_kobo)}</span>
                  {p.status === "paid" ? <span className="text-sm font-medium text-emerald-700">Paid</span> : <MarkPaid id={p.id} name={p.name} amount={p.net_kobo} />}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5" aria-label="Team members">
        <h2 className="text-lg font-semibold">On the weekly target ({b.members.length})</h2>
        <p className="mt-1 text-sm text-ink-soft">Switch someone on or off in their pay terms on the Staff page.</p>
        {missingBank.length > 0 && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No bank details yet: {missingBank.map((m) => m.name).join(", ")}.</p>}
        <ul className="mt-3 divide-y divide-line text-sm">
          {b.members.map((m) => (
            <li key={m.staff_id} className="py-2">
              <span className="font-medium">{m.name}</span>{m.job_title ? <span className="text-ink-mute"> · {m.job_title}</span> : null}
              <span className="block text-ink-soft">{bankLine(m) ?? "No bank details"}</span>
            </li>
          ))}
          {b.members.length === 0 && <li className="py-2 text-ink-soft">Nobody yet.</li>}
        </ul>
      </section>
    </div>
  );
}
