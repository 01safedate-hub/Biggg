import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { ROLE_NAME } from "@/lib/staff";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { ProfileForm, type ProfileData } from "@/components/staff/ProfileForm";
import { PayForm } from "@/components/admin/PayForm";
import { ReviewPanel } from "@/components/admin/ReviewPanel";
import { adminSaveProfile } from "./actions";

export const metadata = { title: "Staff member" };

type Detail = {
  id: string;
  person: { full_name: string; email: string | null; phone: string | null; status: string };
  roles: string[];
  pay: { job_title: string | null; base_salary_kobo: number; boosted_salary_kobo: number; monthly_target_kobo: number | null; earns_weekly_bonus: boolean; active: boolean } | null;
  profile: (ProfileData & { onboarding_status: string; photo_path: string | null; review_note: string | null; must_change_password: boolean }) | null;
  payouts: { id: string; week_start: string; units: number; target_units: number; amount_kobo: number; status: string }[];
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

  return (
    <div className="space-y-6">
      <Link href="/admin/staff" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Staff</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{d.person.full_name}</h1>
        <p className="mt-1 text-sm text-ink-soft">{d.person.email} {d.person.phone ? `· ${d.person.phone}` : ""} · {d.roles.map((r) => ROLE_NAME[r] ?? r).join(", ")}</p>
        <p className="mt-1 text-xs text-ink-mute">Details: <strong>{status}</strong>{d.profile?.must_change_password ? " · still using the password you set" : ""}</p>
        {d.profile?.review_note && <p className="mt-1 text-sm text-ink-soft">Last note: {d.profile.review_note}</p>}
      </div>
      <PayForm userId={id} pay={d.pay} />
      <ReviewPanel userId={id} status={status} />
      <div>
        <h2 className="mb-3 text-lg font-semibold">Personal details</h2>
        <p className="mb-3 text-sm text-ink-soft">You can fill or correct everything here for someone who cannot do it themselves, including taking their photo.</p>
        <ProfileForm userId={id} initial={d.profile ?? {}} photoUrl={photo} onSave={adminSaveProfile.bind(null, id)} />
      </div>
      {d.payouts.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-semibold">Weekly payouts</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {d.payouts.map((p) => <li key={p.id} className="flex justify-between py-2"><span>Week of {longDate(p.week_start)} · {p.units}/{p.target_units} units</span><span>{naira(p.amount_kobo)} · {p.status}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
