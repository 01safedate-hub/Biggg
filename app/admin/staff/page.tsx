import { requireRole } from "@/lib/roles";
import { StaffInvite } from "@/components/admin/StaffInvite";
import { StaffRow } from "@/components/admin/StaffRow";
import type { StaffRowData } from "@/lib/staff";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const { supabase, user } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("staff_list");
  const staff = (Array.isArray(data) ? data : []) as unknown as StaffRowData[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-ink-soft">Invite people, choose what they can do, and remove access when someone leaves. Every change is recorded.</p>
      </div>
      <StaffInvite />
      <section aria-label="Team" className="space-y-3">
        <h2 className="text-lg font-semibold">Team ({staff.length})</h2>
        {error && <p role="alert" className="text-sm text-red-700">The team list could not be loaded. Please refresh.</p>}
        {staff.map((s) => <StaffRow key={s.id} s={s} isMe={s.id === user.id} />)}
      </section>
    </div>
  );
}
