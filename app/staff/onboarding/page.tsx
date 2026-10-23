import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { enforceStaffGate } from "@/lib/staff-gate";
import { naira } from "@/lib/format";
import { ProfileForm } from "@/components/staff/ProfileForm";
import { saveMyProfile, submitMyOnboarding } from "./actions";

export const metadata = { title: "My details" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  incomplete: { label: "Not sent yet", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  rejected: { label: "Needs changes", cls: "bg-red-50 text-red-800 border-red-200" },
  submitted: { label: "Waiting for review", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  verified: { label: "Verified", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

export default async function Onboarding() {
  const { supabase, user, roles } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent"]);
  const s = await enforceStaffGate(supabase, { skipOnboarding: true });
  if (!s) redirect("/account");
  const photoPath = s.profile?.photo_path ?? null;
  let photoUrl: string | null = null;
  if (photoPath) photoUrl = (await supabase.storage.from("staff-docs").createSignedUrl(photoPath, 600)).data?.signedUrl ?? null;
  const st = STATUS[s.onboarding_status] ?? STATUS.incomplete;
  const locked = s.onboarding_status === "submitted" || s.onboarding_status === "verified";

  return (
    <main id="main" className="container-page max-w-3xl space-y-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">My details</h1>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
      </div>
      {!locked && <p className="text-sm text-ink-soft">Complete this once. Until it is sent and the super admin has it, the rest of the staff area stays closed.</p>}
      {s.onboarding_status === "rejected" && s.review_note && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">The super admin asked for a change: {s.review_note}</p>
      )}

      <section aria-label="Your pay" className="card grid gap-4 p-5 sm:grid-cols-2">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Basic salary</p>
          <p className="mt-1 text-2xl font-bold">{s.base_salary_kobo != null ? naira(s.base_salary_kobo) : "To be set"}</p>
          <p className="mt-1 text-xs text-ink-mute">Paid every month.</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Target-met salary</p>
          <p className="mt-1 text-2xl font-bold text-brand-dark">{s.target_salary_kobo != null ? naira(s.target_salary_kobo) : "To be set"}</p>
          <p className="mt-1 text-xs text-ink-mute">Paid instead of the basic salary in a month the profit target is met. It starts only once the start-up costs have been recovered.</p></div>
      </section>

      <ProfileForm userId={user.id} initial={s.profile ?? {}} photoUrl={photoUrl} locked={locked}
        onSave={saveMyProfile} onSubmit={submitMyOnboarding} submitLabel="Save and send for review" />

      {(locked || roles.includes("super_admin")) && <Link href="/staff" className="btn-secondary">Back to home</Link>}
    </main>
  );
}
