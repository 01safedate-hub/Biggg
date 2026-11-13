import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { CLEANING_MONEY, CUSTOMER_LINKERS } from "@/lib/cleaning-roles";
import { HOME_KIND_LABEL, QUOTE_STATUS_LABEL, REQUEST_STATUS_LABEL, SERVICE_LABEL, VISIT_STATUS_LABEL, dateTimeLabel, dayLabel, lagosDate, minutesLabel, nairaK } from "@/lib/cleaning";
import { BookInspection, DeskPay, InspectionDone, LinkCustomer, QuoteActions, QuoteBuilder, RequestStatus } from "@/components/cleaning/StaffRequestTools";

export const metadata = { title: "Cleaning request" };
export const dynamic = "force-dynamic";

type Inv = { id: string; status: string; amount_kobo: number } | null;
type Detail = {
  request: { id: string; request_no: number; customer_id: string | null; contact_name: string | null; contact_phone: string | null; source: string; service: string; wants_plan: boolean;
    property_id: string | null; address: string | null; lat: number | null; lng: number | null; distance_km: number | null; home_kind: string | null; bedrooms: number | null; bathrooms: number | null;
    details: string | null; preferred: string | null; photos: string[]; status: string; lost_reason: string | null; created_at: string };
  customer: { id: string; name: string; phone: string | null; email: string | null; walk_in: boolean } | null;
  property: { address: string; kind: string; lat: number; lng: number; water_note: string | null; power_note: string | null; access_note: string | null; pets: string | null } | null;
  zone: string | null; assigned: string | null;
  inspections: { id: string; mode: string; scheduled_for: string | null; status: string; fee_kobo: number; fee_waived: boolean; waive_reason: string | null; fee_paid: boolean; inspector: string | null; findings: Record<string, string>; photos: string[]; invoice: Inv }[];
  quotes: { id: string; quote_no: number; version: number; kind: string; status: string; total_kobo: number; plan_name: string | null; monthly_kobo: number | null; first_deep_kobo: number | null;
    visit_price_kobo: number; crew_size: number; duration_min: number; override_kobo: number | null; override_reason: string | null; valid_until: string | null; inspection_credit_kobo: number; invoice: Inv }[];
  visits: { id: string; visit_no: number; date: string; window: string; status: string; kind: string }[];
  events: { event: string; at: string; by: string | null }[];
  rate: Parameters<typeof QuoteBuilder>[0]["rate"];
  plan_types: Parameters<typeof QuoteBuilder>[0]["planTypes"];
  inspection_fee_kobo: number;
};

export default async function CleaningRequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, roles } = await requireRole(["inspector", "scheduler", "secretary", "cashier", "admin", "super_admin"]);
  const { data, error } = await supabase.rpc("cleaning_request_detail" as never, { _id: id } as never);
  if (error || !data) notFound();
  const d = data as unknown as Detail;
  const r = d.request;
  const today = lagosDate();
  const isAdmin = roles.some((x) => x === "admin" || x === "super_admin");
  const canMoney = roles.some((x) => CLEANING_MONEY.includes(x));
  const canDesk = roles.some((x) => ["scheduler", "secretary", "cashier", "admin", "super_admin"].includes(x));
  const [{ data: board }, { data: pts }] = await Promise.all([
    supabase.rpc("cleaning_board" as never, { _from: today, _to: today } as never),
    canMoney ? supabase.from("money_points").select("id,name,kind").eq("active", true).neq("kind", "online").order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const staff = ((board as unknown as { staff?: { id: string; name: string; roles: string[] }[] } | null)?.staff ?? []);
  const inspectors = staff.filter((s) => s.roles.some((x) => ["inspector", "cleaning_lead", "scheduler", "admin", "super_admin"].includes(x)));
  const points = (pts ?? []) as { id: string; name: string }[];
  const allPhotos = [...(r.photos ?? []), ...d.inspections.flatMap((i) => i.photos ?? [])];
  const { data: signed } = allPhotos.length ? await supabase.storage.from("cleaning-photos").createSignedUrls(allPhotos, 3600) : { data: [] };
  const url = new Map<string, string>((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
  const closed = ["accepted", "lost", "cancelled"].includes(r.status);
  const openInspection = d.inspections.find((i) => ["scheduled", "awaiting_fee"].includes(i.status));
  const back = `/staff/cleaning/requests/${id}`;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/staff/cleaning" className="text-sm text-ink-soft hover:underline">← Cleaning requests</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Request #{r.request_no}</h1>
          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-dark">{REQUEST_STATUS_LABEL[r.status] ?? r.status}</span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{SERVICE_LABEL[r.service] ?? r.service}{r.wants_plan ? " · wants a monthly plan" : ""} · from {r.source} · {dateTimeLabel(r.created_at)}{d.assigned ? ` · handled by ${d.assigned}` : ""}</p>
        {r.lost_reason && <p className="text-sm text-red-700">Lost: {r.lost_reason}</p>}
      </div>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Customer and place</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-mute">Name</dt><dd>{d.customer?.name ?? r.contact_name ?? "Not given"}{d.customer?.walk_in ? " (walk-in)" : ""}</dd></div>
          <div><dt className="text-ink-mute">Phone</dt><dd>{d.customer?.phone ?? r.contact_phone ? <a className="underline" href={`tel:${d.customer?.phone ?? r.contact_phone}`}>{d.customer?.phone ?? r.contact_phone}</a> : "Not given"}</dd></div>
          <div><dt className="text-ink-mute">Address</dt><dd>{d.property?.address ?? r.address ?? "Not set"}</dd></div>
          <div><dt className="text-ink-mute">Area</dt><dd>{d.zone ?? "Not set"}{r.distance_km != null ? ` · ${Number(r.distance_km).toFixed(1)} km from the hub` : ""}</dd></div>
          <div><dt className="text-ink-mute">Place</dt><dd>{HOME_KIND_LABEL[d.property?.kind ?? r.home_kind ?? ""] ?? "Not set"}{r.bedrooms != null ? ` · ${r.bedrooms} bed` : ""}{r.bathrooms != null ? ` · ${r.bathrooms} bath` : ""}</dd></div>
          <div><dt className="text-ink-mute">Preferred time</dt><dd>{r.preferred ?? "Not given"}</dd></div>
        </dl>
        {r.details && <p className="rounded-md bg-canvas p-3 text-sm">{r.details}</p>}
        {d.property && (d.property.water_note || d.property.power_note || d.property.access_note || d.property.pets) && (
          <p className="text-sm text-ink-soft">Water: {d.property.water_note ?? "?"} · Power: {d.property.power_note ?? "?"} · Access: {d.property.access_note ?? "?"}{d.property.pets ? ` · Pets: ${d.property.pets}` : ""}</p>
        )}
        {(r.photos ?? []).length > 0 && <div className="flex flex-wrap gap-2">{r.photos.map((p) => url.get(p) ? <a key={p} href={url.get(p)} target="_blank" rel="noreferrer"><img src={url.get(p)} alt="Customer photo" className="h-20 w-20 rounded-md object-cover" /></a> : null)}</div>}
        {canDesk && !closed && (
          <details className="rounded-md border border-line p-3" open={!r.customer_id || !r.property_id}>
            <summary className="cursor-pointer text-sm font-medium">{!r.customer_id || !r.property_id ? "Link the customer and pin the address (needed for a quote)" : "Change customer or address"}</summary>
            <div className="mt-3"><LinkCustomer requestId={id} current={d.customer ? { id: d.customer.id, name: d.customer.name, phone: d.customer.phone } : null} address={d.property?.address ?? r.address ?? ""} lat={d.property?.lat ?? r.lat} lng={d.property?.lng ?? r.lng} canLink={roles.some((x) => CUSTOMER_LINKERS.includes(x))} homeKind={d.property?.kind ?? r.home_kind} /></div>
          </details>
        )}
        {canDesk && <RequestStatus requestId={id} status={r.status} />}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Inspection</h2>
        {d.inspections.length === 0 && <p className="text-sm text-ink-soft">None yet.</p>}
        {d.inspections.map((i) => (
          <div key={i.id} className="space-y-2 rounded-md border border-line p-3 text-sm">
            <p><strong>{i.mode === "remote" ? "Remote quote" : `Visit ${i.scheduled_for ? dateTimeLabel(i.scheduled_for) : ""}`}</strong> · {i.status.replace("_", " ")}{i.inspector ? ` · ${i.inspector}` : ""}</p>
            {i.mode === "onsite" && <p className="text-ink-soft">{i.fee_waived ? `Fee skipped: ${i.waive_reason ?? ""}` : i.fee_kobo > 0 ? `Fee ${nairaK(i.fee_kobo)} · ${i.fee_paid ? "paid" : "not paid yet"}` : "No fee"}</p>}
            {i.invoice?.status === "open" && canMoney && <DeskPay invoiceId={i.invoice.id} amountKobo={i.invoice.amount_kobo} points={points} back={back} />}
            {i.status === "done" && Object.keys(i.findings ?? {}).length > 0 && <p className="text-ink-soft">{Object.entries(i.findings).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>}
            {(i.photos ?? []).length > 0 && <div className="flex flex-wrap gap-2">{i.photos.map((p) => url.get(p) ? <a key={p} href={url.get(p)} target="_blank" rel="noreferrer"><img src={url.get(p)} alt="Inspection photo" className="h-20 w-20 rounded-md object-cover" /></a> : null)}</div>}
            {["scheduled", "awaiting_fee"].includes(i.status) && <InspectionDone inspectionId={i.id} requestId={id} folder={`inspections/${r.customer_id ?? "none"}/${i.id}`} />}
          </div>
        ))}
        {canDesk && !closed && (
          <details className="rounded-md border border-line p-3" open={d.inspections.length === 0}>
            <summary className="cursor-pointer text-sm font-medium">{openInspection ? "Rebook the inspection" : "Book an inspection or quote remotely"}</summary>
            <div className="mt-3"><BookInspection requestId={id} feeKobo={d.inspection_fee_kobo} inspectors={inspectors} hasCustomer={!!r.customer_id} /></div>
          </details>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Quotes</h2>
        {d.quotes.length === 0 && <p className="text-sm text-ink-soft">No quote yet.</p>}
        {d.quotes.map((q) => (
          <div key={q.id} className="space-y-1 rounded-md border border-line p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <p><strong>#{q.quote_no}</strong> v{q.version} · {q.kind === "plan" ? `${q.plan_name ?? "Plan"}: ${nairaK(q.monthly_kobo)}/month + first deep ${nairaK(q.first_deep_kobo)}` : `One-off ${nairaK(q.visit_price_kobo)}`}</p>
              <span className="font-medium">{QUOTE_STATUS_LABEL[q.status] ?? q.status}</span>
            </div>
            <p className="text-ink-soft">Crew {q.crew_size} · {minutesLabel(q.duration_min)}{q.override_kobo ? ` · price changed: ${q.override_reason ?? ""}` : ""}{q.inspection_credit_kobo ? ` · inspection credit ${nairaK(q.inspection_credit_kobo)}` : ""}{q.valid_until ? ` · valid until ${dateTimeLabel(q.valid_until)}` : ""}</p>
            {q.invoice && <p className="text-ink-soft">Booking bill {nairaK(q.invoice.amount_kobo)} · {q.invoice.status}</p>}
            {q.status === "sent" && <p className="text-xs text-ink-mute">Customer link: /cleaning/quote/{q.id}</p>}
            {q.invoice?.status === "open" && canMoney && <DeskPay invoiceId={q.invoice.id} amountKobo={q.invoice.amount_kobo} points={points} back={back} />}
            <QuoteActions quoteId={q.id} requestId={id} status={q.status} isAdmin={isAdmin} />
          </div>
        ))}
        {!closed && (
          r.customer_id && r.property_id ? (
            <details className="rounded-md border border-line p-3" open={d.quotes.length === 0 && r.status === "quoting"}>
              <summary className="cursor-pointer text-sm font-medium">{d.quotes.length ? "Build a new version" : "Build the quote"}</summary>
              <div className="mt-3"><QuoteBuilder requestId={id} rate={d.rate} planTypes={d.plan_types ?? []} isSuperAdmin={roles.includes("super_admin")}
                initial={{ service: r.service, wantsPlan: r.wants_plan, bedrooms: r.bedrooms, bathrooms: r.bathrooms }} /></div>
            </details>
          ) : <p className="text-sm text-amber-800">Link the customer and pin the address before quoting.</p>
        )}
      </section>

      {d.visits.length > 0 && (
        <section className="card space-y-2 p-5">
          <h2 className="font-semibold">Visits</h2>
          {d.visits.map((v) => <p key={v.id} className="text-sm">#{v.visit_no} · {dayLabel(v.date)} ({v.window}) · {VISIT_STATUS_LABEL[v.status] ?? v.status}</p>)}
          <Link href="/staff/cleaning/board" className="text-sm font-medium underline">Open the board</Link>
        </section>
      )}

      <section className="card space-y-1 p-5">
        <h2 className="font-semibold">History</h2>
        {d.events.map((e, i) => <p key={i} className="text-xs text-ink-soft">{dateTimeLabel(e.at)} · {e.event.replace(/_/g, " ")}{e.by ? ` · ${e.by}` : ""}</p>)}
      </section>
    </div>
  );
}
