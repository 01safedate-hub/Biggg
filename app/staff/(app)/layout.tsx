import { Shell } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { enforceStaffGate } from "@/lib/staff-gate";
import { SupportNotifications } from "@/components/staff/SupportNotifications";
import { GuideRunner } from "@/components/guide/GuideRunner";
import { buildStaffNav, navHrefs } from "@/lib/staff-nav";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { supabase, name, roles } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent", "commission_agent", "washer", "inspector", "cleaning_lead", "cleaner", "scheduler"]);
  await enforceStaffGate(supabase, { skipOnboarding: roles.includes("super_admin") });
  const [{ data: supportAllowed }, { data: prefs }] = await Promise.all([
    supabase.rpc("staff_support_allowed"),
    supabase.rpc("my_ui_prefs" as never),
  ]);
  const groups = buildStaffNav(roles, supportAllowed === true);
  const p = (prefs ?? {}) as unknown as { nav?: Record<string, unknown>; tours?: Record<string, unknown> };
  return (
    <Shell title="Staff" name={name} groups={groups} customize={{ area: "staff", layout: p.nav?.staff ?? null }}
      extra={<GuideRunner kind="staff" hrefs={navHrefs(groups)} roles={roles} initial={(p.tours?.staff ?? {}) as Record<string, unknown>} />}>
      {supportAllowed === true && <SupportNotifications />}
      {children}
    </Shell>
  );
}
