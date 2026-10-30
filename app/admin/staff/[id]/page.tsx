import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { ROLE_NAME } from "@/lib/staff";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { ProfileForm, type ProfileData } from "@/components/staff/ProfileForm";
import { PayForm } from "@/components/admin/PayForm";
import { ReviewPanel } from "@/components/admin/ReviewPanel";
import { HubVerificationPanel } from "@/components/admin/HubVerificationPanel";
import { adminSaveProfile } from "./actions";

export const metadata = { title: "Staff member" };

type Commission = { id: string; order_id: string; rate: number; amount_kobo: number; status: string; delivered_at: string | null; release_at: string | null; review_note: string | null; created_at: string };
type Detail = {
  id: string;
  person: { full_name: string; email: string | null; phone: string | null; status: string };
  roles: string[];
  pay: { job_title: string | null; base_salary_kobo: number; boosted_salary_kobo: number; monthly_target_kobo: number | null; earns_weekly_bonus: boolean; active: boolean } | null;
  profile: (ProfileData & { onboarding_status: string; photo_path: string | null; review_note: string | null; must_change_password: boolean }) | null;
  payouts: { id: string; week_start: string; units: number; target_units: number; amount_kobo: number; status: string }[];
  commissions?: Commission[];
  hub_verification: { outcome: string; person_present: boolean; nin_document_checked: boolean; nin_matches_profile: boolean; photo_matches_person: boolean; referee_checked: boolean; hub_location: string; notes: string | null; verified_at: string } | null;
};

export default async function StaffDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("admin_staff_detail", { _user: id });
  if (error || !data) notFound();
  const d = data as unknown as Detail;
  const photo = d.profile?.photo_path ? (await supabase.storage.from("staff-docs").createSignedUrl(d.profile.photo_path, 600)).data?.signedUrl ?? null : null;
  const status = d.profile?.onboarding_status ?? "incomplete";
  const commissions = d.commissions ?? [];
  const total = (s: string) => commissions.filter((c) => c.status === s).reduce((sum, c) => sum + c.amount_kobo, 0);
  const commissionOnly = d.roles.includes("commission_agent");
  const salaried = Boolean(d.pay?.active);
  const commissionRate = commissionOnly && !salaried ? 10 : !commissionOnly && salaried && d.roles.includes("delivery_agent") ? 5 : null;

  return (
    <div className="space-y-6">
      <Link href="/admin/staff" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Staff</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{d.person.full_name}</h1>
        <p className="mt-1 text-sm text-ink-soft">{d.person.email} {d.person.phone ? `· ${d.person.phone}` : ""} · {d.roles.map((r) => ROLE_NAME[r] ?? r).join(", ")}</p>
        <p className="mt-1 text-xs text-ink-mute">Details: <strong>{status}</strong>{d.profile?.must_change_password ? " · still using the password you set" : ""}</p>
        {d.profile?.review_note && <p className="mt-1 text-sm text-ink-soft">Last note: {d.profile.review_note}</p>}
      </div>
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Commission eligibility</h2>
        {commissionRate === 10 && <p className="font-medium">Commission-only agent · 10% · no active payroll</p>}
        {commissionRate === 5 && <p className="font-medium">Salaried delivery staff · 5% · active payroll</p>}
        {commissionRate === null && <p className="text-sm text-ink-soft">Not currently eligible: assign the correct delivery/commission-only role and ensure payroll status matches the staff type.</p>}
        <p className="text-sm text-ink-soft">Commission is recorded only after delivery and full eligible payment. It remains pending for 48 hours after delivery before becoming available for review, provided there is no refund or complaint hold.</p>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {(["pending", "approved", "paid", "reversed", "rejected"] as const).map((s) => <div key={s} className="rounded-md border border-line p-3"><p className="capitalize text-ink-soft">{s}</p><p className="mt-1 font-semibold">{naira(total(s))}</p></div>)}
        </div>
        {commissions.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line"><th className="py-2 pr-3">Order</th><th className="py-2 pr-3">Rate</th><th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">Status</th><th className="py-2">Release</th></tr></thead><tbody>{commissions.map((c) => <tr key={c.id} className="border-b border-line"><td className="py-2 pr-3">{c.order_id.slice(0, 8)}</td><td className="py-2 pr-3">{(Number(c.rate) * 100).toFixed(0)}%</td><td className="py-2 pr-3">{naira(c.amount_kobo)}</td><td className="py-2 pr-3 capitalize">{c.status}</td><td className="py-2">{c.release_at ? longDate(c.release_at.slice(0, 10)) : "Awaiting delivery/payment"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-ink-soft">No commission entries recorded yet.</p>}
      </section>
      <PayForm userId={id} pay={d.pay} />
      <HubVerificationPanel userId={id} record={d.hub_verification ?? null} />
      <ReviewPanel userId={id} status={status} hubVerified={Boolean(d.hub_verification?.outcome === "passed" && d.hub_verification.person_present && d.hub_verification.nin_document_checked && d.hub_verification.nin_matches_profile && d.hub_verification.photo_matches_person)} />
      <div>
        <h2 className="mb-3 text-lg font-semibold">Personal details</h2>
        <p className="mb-3 text-sm text-ink-soft">You can fill or correct everything here for someone who cannot do it themselves, including taking their photo.</p>
        <ProfileForm userId={id} initial={d.profile ?? {}} photoUrl={photo} onSave={adminSaveProfile.bind(null, id)} />
      </div>
      {d.payouts.length > 0 && <section className="card p-5"><h2 className="text-lg font-semibold">Weekly payouts</h2><ul className="mt-3 divide-y divide-line text-sm">{d.payouts.map((p) => <li key={p.id} className="flex justify-between py-2"><span>Week of {longDate(p.week_start)} · {p.units}/{p.target_units} units</span><span>{naira(p.amount_kobo)} · {p.status}</span></li>)}</ul></section>}
    </div>
  );
}
