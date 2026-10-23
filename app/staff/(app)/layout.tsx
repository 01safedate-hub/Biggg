import { Shell, type NavGroup } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { enforceStaffGate } from "@/lib/staff-gate";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { supabase, name, roles } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent"]);
  await enforceStaffGate(supabase, { skipOnboarding: roles.includes("super_admin") });
  const work: NavGroup["items"] = [{ href: "/staff", label: "Home", icon: "home", exact: true }];
  if (roles.includes("secretary") || roles.includes("super_admin")) work.push({ href: "/staff/expenses", label: "Record expense", icon: "record" });
  if (roles.includes("delivery_agent")) work.push({ href: "/staff/jobs", label: "Pickup jobs", icon: "jobs" });
  if (roles.some((r) => ["secretary", "admin", "super_admin"].includes(r))) {
    work.push({ href: "/staff/dispatch", label: "Dispatch", icon: "dispatch" });
    work.push({ href: "/staff/receiving", label: "Receiving", icon: "receiving" });
    work.push({ href: "/staff/hub", label: "Wash queue", icon: "hub" });
    work.push({ href: "/staff/issues", label: "Customer problems", icon: "reports" });
    work.push({ href: "/staff/roster", label: "Shift roster", icon: "weekly" });
  }
  work.push({ href: "/staff/spending", label: "Spending", icon: "spending" });
  if (roles.some((r) => r !== "delivery_agent")) work.push({ href: "/staff/count", label: "Count money", icon: "count" });
  const groups: NavGroup[] = [{ label: "My work", items: work }, { label: "Me", items: [{ href: "/staff/onboarding", label: "My details", icon: "customers" }] }];
  if (roles.includes("super_admin")) groups.push({ label: "Manage", items: [{ href: "/admin", label: "Super admin", icon: "admin" }] });
  return <Shell title="Staff" name={name} groups={groups}>{children}</Shell>;
}
