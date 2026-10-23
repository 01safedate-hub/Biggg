import { Shell } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { name } = await requireRole(["super_admin"]);
  return (
    <Shell title="Super admin" name={name} nav={[
      { href: "/admin", label: "Overview" },
      { href: "/admin/money", label: "Daily money" },
      { href: "/admin/expenses", label: "Expenses" },
      { href: "/admin/costs", label: "Start-up costs" },
      { href: "/admin/staff", label: "Staff" },
      { href: "/admin/settings", label: "Settings" },
    ]}>{children}</Shell>
  );
}
