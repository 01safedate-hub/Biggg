import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { REQUEST_STATUS_LABEL, QUOTE_STATUS_LABEL, SERVICE_LABEL, dateTimeLabel, nairaK } from "@/lib/cleaning";

export const metadata = { title: "Cleaning requests" };
export const dynamic = "force-dynamic";

type Row = { id: string; request_no: number; service: string; wants_plan: boolean; status: string; source: string; customer: string | null; phone: string | null;
  address: string | null; zone: string | null; assigned: string | null; created_at: string; next_inspection: string | null; latest_quote: { id: string; status: string; total_kobo: number } | null };

const FILTERS: [string, string][] = [["", "Open"], ["new", "New"], ["contacted", "Contacted"], ["inspection_booked", "Inspection booked"], ["quoting", "Preparing quote"], ["quoted", "Quote sent"], ["accepted", "Booked"], ["lost", "Lost"], ["all", "All"]];

export default async function CleaningRequests({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase, roles } = await requireRole(["inspector", "scheduler", "secretary", "cashier", "admin", "super_admin"]);
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status || null : null;
  const { data, error } = await supabase.rpc("cleaning_requests_list" as never, { _status: status, _q: (sp.q ?? "").slice(0, 60) || null } as never);
  const rows = (data ?? []) as unknown as Row[];
  const canCreate = roles.some((r) => ["scheduler", "secretary", "cashier", "admin", "super_admin"].includes(r));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cleaning requests</h1>
          <p className="mt-1 text-sm text-ink-soft">Call each new request within the hour. Book an inspection (or quote from photos), build the quote, send it. The customer picks a day and pays online, or pays at the desk.</p>
        </div>
        {canCreate && <Link href="/staff/cleaning/new" className="btn-primary">New request (phone or walk-in)</Link>}
      </div>
      <form className="flex flex-wrap gap-2" method="get">
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-line px-3 py-2 text-sm">{FILTERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, phone, address or number" className="min-w-[14rem] flex-1 rounded-md border border-line px-3 py-2 text-sm" />
        <button className="btn-secondary">Filter</button>
      </form>
      {error && <p className="card p-4 text-sm text-red-700">Could not load requests.</p>}
      {!error && rows.length === 0 && <p className="card p-5 text-sm text-ink-soft">No requests here.</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <Link key={r.id} href={`/staff/cleaning/requests/${r.id}`} className="card block space-y-1 p-4 hover:border-brand">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">#{r.request_no} · {r.customer ?? "No name"} {r.phone ? <span className="font-normal text-ink-soft">· {r.phone}</span> : null}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "new" ? "bg-red-50 text-red-800" : "bg-brand-tint text-brand-dark"}`}>{REQUEST_STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
            <p className="text-sm text-ink-soft">{SERVICE_LABEL[r.service] ?? r.service}{r.wants_plan ? " · wants a plan" : ""} · {r.source} · {r.zone ?? "area not set"}{r.address ? ` · ${r.address}` : ""}</p>
            <p className="text-xs text-ink-mute">
              {dateTimeLabel(r.created_at)}{r.assigned ? ` · handled by ${r.assigned}` : ""}
              {r.next_inspection ? ` · inspection ${dateTimeLabel(r.next_inspection)}` : ""}
              {r.latest_quote ? ` · quote ${nairaK(r.latest_quote.total_kobo)} (${(QUOTE_STATUS_LABEL[r.latest_quote.status] ?? r.latest_quote.status).toLowerCase()})` : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
