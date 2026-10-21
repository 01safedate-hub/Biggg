import { Shell, type NavItem } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { name, roles } = await requireRole(["super_admin", "admin", "accountant", "cashier", "delivery_agent"]);
  const nav: NavItem[] = [{ href: "/staff", label: "Home" }];
  if (roles.includes("accountant") || roles.includes("super_admin")) nav.push({ href: "/staff/expenses", label: "Record expense" });
  nav.push({ href: "/staff/spending", label: "Spending" });
  if (roles.some((r) => r !== "delivery_agent")) nav.push({ href: "/staff/count", label: "Count money" });
  if (roles.includes("super_admin")) nav.push({ href: "/admin", label: "Super admin" });
  return <Shell title="Staff" name={name} nav={nav}>{children}</Shell>;
}
