import { Shell, type NavGroup } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { enforceStaffGate } from "@/lib/staff-gate";

export const dynamic = "force-dynamic";

const GROUPS: NavGroup[] = [
  { label: "Business", items: [
    { href: "/admin", label: "Overview", icon: "overview", exact: true },
    { href: "/admin/money", label: "Daily money", icon: "money" },
    { href: "/admin/expenses", label: "Expenses", icon: "expenses" },
    { href: "/admin/costs", label: "Start-up costs", icon: "costs" },
  ] },
  { label: "Operations", items: [
    { href: "/admin/orders", label: "Orders and timelines", icon: "orders" },
    { href: "/staff/dispatch", label: "Dispatch", icon: "dispatch" },
    { href: "/staff/receiving", label: "Receiving", icon: "receiving" },
  ] },
  { label: "People", items: [
    { href: "/admin/staff", label: "Staff", icon: "staff" },
    { href: "/admin/weekly", label: "Weekly units", icon: "weekly" },
    { href: "/admin/customers", label: "Customers", icon: "customers" },
  ] },
  { label: "Catalogue", items: [
    { href: "/admin/prices", label: "Price list", icon: "prices" },
    { href: "/admin/categories", label: "Expense categories", icon: "categories" },
    { href: "/admin/points", label: "Money points", icon: "points" },
  ] },
  { label: "Records", items: [
    { href: "/admin/audit", label: "Audit log", icon: "audit" },
    { href: "/admin/waitlist", label: "Waitlist", icon: "waitlist" },
  ] },
  { label: "System", items: [{ href: "/admin/settings", label: "Settings", icon: "settings" }] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, name } = await requireRole(["super_admin"]);
  await enforceStaffGate(supabase, { skipOnboarding: true });
  return <Shell title="Super admin" name={name} groups={[...GROUPS, { label: "Switch", items: [{ href: "/staff", label: "Staff view", icon: "home", exact: true }] }]}>{children}</Shell>;
}
