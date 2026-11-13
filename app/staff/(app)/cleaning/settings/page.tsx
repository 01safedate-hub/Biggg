import { requireRole } from "@/lib/roles";
import { CLEANING_MANAGER } from "@/lib/cleaning-roles";
import { dateTimeLabel, lagosDate } from "@/lib/cleaning";
import { PlanTypeEditor, RateCardEditor, SettingsEditor, ZoneDays } from "@/components/cleaning/AdminTools";
import { TemplateEditor } from "@/components/ops/RosterTools";

export const metadata = { title: "Cleaning settings" };
export const dynamic = "force-dynamic";

type Cfg = {
  settings: Record<string, unknown>;
  rate: { id: string; version: number; data: Parameters<typeof RateCardEditor>[0]["data"]; created_at: string } | null;
  rate_history: { version: number; note: string | null; by: string | null; at: string }[] | null;
  plan_types: Parameters<typeof PlanTypeEditor>[0]["plan"][] | null;
  zones: { id: string; name: string; days: number[] }[] | null;
};

export default async function CleaningSettings() {
  const { supabase, roles } = await requireRole(CLEANING_MANAGER);
  const isAdmin = roles.some((r) => r === "admin" || r === "super_admin");
  const today = lagosDate();
  const [{ data, error }, { data: board }, { data: tpls }] = await Promise.all([
    supabase.rpc("cleaning_admin_config" as never),
    supabase.rpc("cleaning_board" as never, { _from: today, _to: today } as never),
    isAdmin ? supabase.from("shift_templates").select("staff_id,weekday,starts_at,ends_at,active") : Promise.resolve({ data: [] as { staff_id: string; weekday: number; starts_at: string; ends_at: string; active: boolean }[] }),
  ]);
  if (error || !data) return <p className="card p-5 text-sm text-red-700">Could not load cleaning settings.</p>;
  const c = data as unknown as Cfg;
  const crew = ((board as unknown as { staff?: { id: string; name: string; roles: string[] }[] } | null)?.staff ?? []).filter((s) => s.roles.some((r) => r === "cleaner" || r === "cleaning_lead"));
  const tplBy = (id: string) => (tpls ?? []).filter((t) => t.staff_id === id);
  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cleaning settings</h1>
        <p className="mt-1 text-sm text-ink-soft">Prices, plans, booking rules and crew working days. Changes apply to new quotes and bookings; quotes already sent keep their price.</p>
      </div>

      <section id="crew" className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Crew working days</h2>
        <p className="text-sm text-ink-soft">Booking capacity comes from these weekly hours (minus approved leave). Add cleaners and crew leads in Staff with the Cleaner or Crew lead role first.</p>
        {!isAdmin ? <p className="text-sm text-ink-mute">An admin or the secretary sets working days.</p> : crew.length === 0 ? <p className="text-sm text-amber-800">No cleaners yet. Until there are, capacity uses the two default numbers in Booking rules below.</p>
          : <div className="space-y-2">{crew.map((s) => <TemplateEditor key={s.id} staffId={s.id} name={`${s.name} (${s.roles.includes("cleaning_lead") ? "crew lead" : "cleaner"})`} templates={tplBy(s.id)} />)}</div>}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Best days per area</h2>
        <p className="text-sm text-ink-soft">Customers see these days first, so crews stay in one area per day. Leave an area empty to offer every day.</p>
        <div className="space-y-2">{(c.zones ?? []).map((z) => <ZoneDays key={z.id} zoneId={z.id} name={z.name} days={z.days ?? []} />)}</div>
      </section>

      {isAdmin ? (
        <>
          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-semibold">Rate card {c.rate ? `(version ${c.rate.version})` : ""}</h2>
            {c.rate && <RateCardEditor data={c.rate.data} />}
            {(c.rate_history ?? []).length > 0 && (
              <details className="text-sm"><summary className="cursor-pointer">History</summary>
                {(c.rate_history ?? []).map((h) => <p key={h.version} className="text-xs text-ink-soft">v{h.version} · {dateTimeLabel(h.at)}{h.by ? ` · ${h.by}` : ""}{h.note ? ` · ${h.note}` : ""}</p>)}
              </details>
            )}
          </section>
          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-semibold">Monthly plans</h2>
            <div className="space-y-2">{(c.plan_types ?? []).map((p) => <PlanTypeEditor key={p.slug} plan={p} />)}</div>
          </section>
          <section className="card space-y-3 p-5">
            <h2 className="text-lg font-semibold">Booking rules</h2>
            <SettingsEditor settings={c.settings} />
          </section>
        </>
      ) : <p className="text-sm text-ink-mute">Prices and booking rules are changed by an admin.</p>}
    </div>
  );
}
