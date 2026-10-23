import { Shell, type NavGroup } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { enforceStaffGate } from "@/lib/staff-gate";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { supabase, name, roles } = await requireRole(["super_admin", "admin", "accountant", "cashier", "delivery_agent"]);
  await enforceStaffGate(supabase, { skipOnboarding: roles.includes("super_admin") });
  const work: NavGroup["items"] = [{ href: "/staff", label: "Home", icon: "home", exact: true }];
  if (roles.includes("accountant") || roles.includes("super_admin")) work.push({ href: "/staff/expenses", label: "Record expense", icon: "record" });
  work.push({ href: "/staff/spending", label: "Spending", icon: "spending" });
  if (roles.some((r) => r !== "delivery_agent")) work.push({ href: "/staff/count", label: "Count money", icon: "count" });
  const groups: NavGroup[] = [{ label: "My work", items: work }, { label: "Me", items: [{ href: "/staff/onboarding", label: "My details", icon: "customers" }] }];
  if (roles.includes("super_admin")) groups.push({ label: "Manage", items: [{ href: "/admin", label: "Super admin", icon: "admin" }] });
  return <Shell title="Staff" name={name} groups={groups}>{children}</Shell>;
}
