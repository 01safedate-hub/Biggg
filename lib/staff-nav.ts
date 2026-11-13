// The staff menu for a set of roles. Used by the staff layout and by the staff guide,
// so the guide only talks about pages the person can actually open.
import type { NavGroup } from "@/components/admin/Sidebar";

const has = (roles: string[], list: string[]) => roles.some((r) => list.includes(r));

export function buildStaffNav(roles: string[], supportAllowed: boolean): NavGroup[] {
  const washerOnly = roles.includes("washer") && !has(roles, ["super_admin", "admin", "secretary", "cashier", "delivery_agent", "commission_agent"]);
  // Cleaning-only staff (cleaners, crew leads, inspectors, schedulers) see only the cleaning tools.
  const cleaningOnly = !has(roles, ["super_admin", "admin", "secretary", "cashier", "delivery_agent", "commission_agent", "washer"]);
  const work: NavGroup["items"] = [
    { href: "/staff", label: "Home", icon: "home", exact: true },
    { href: "/staff/my-shifts", label: "My shifts", icon: "weekly" },
    { href: "/staff/leave", label: "Leave and swaps", icon: "weekly" },
  ];
  if (washerOnly) work.push({ href: "/staff/hub", label: "Wash queue", icon: "hub" }, { href: "/staff/shelves", label: "Shelf map", icon: "hub" });
  if (has(roles, ["cashier", "secretary", "admin", "super_admin"])) work.push({ href: "/staff/orders", label: "Orders", icon: "jobs" }, { href: "/staff/shelves", label: "Shelf map", icon: "hub" }, { href: "/staff/customs", label: "Customs", icon: "customers" });
  if (has(roles, ["cashier", "secretary", "admin", "super_admin"])) work.push({ href: "/staff/subscription-pickup-calls", label: "Subscription pickup calls", icon: "weekly" });
  if (has(roles, ["secretary", "admin", "super_admin"])) work.push({ href: "/staff/student-ids", label: "Student IDs", icon: "weekly" });
  if (roles.includes("secretary") || roles.includes("super_admin")) work.push({ href: "/staff/expenses", label: "Record expense", icon: "record" });
  if (has(roles, ["secretary", "admin", "super_admin"])) work.push({ href: "/staff/agent-verification", label: "Verify agents", icon: "customers" });
  if (has(roles, ["delivery_agent", "commission_agent"])) work.push({ href: "/staff/jobs", label: "My jobs", icon: "jobs" });
  if (has(roles, ["delivery_agent", "commission_agent", "admin", "super_admin"])) work.push({ href: "/staff/referrals", label: "Referrals", icon: "customers" });
  if (has(roles, ["delivery_agent", "commission_agent"])) work.push({ href: "/staff/commissions", label: "My commissions", icon: "money" });
  if (has(roles, ["secretary", "admin", "super_admin"])) {
    work.push(
      { href: "/staff/dispatch", label: "Dispatch", icon: "dispatch" }, { href: "/staff/online", label: "Online orders", icon: "dispatch" },
      { href: "/staff/instant", label: "Instant orders", icon: "dispatch" }, { href: "/staff/walkin", label: "Walk-in orders", icon: "customers" },
      { href: "/staff/receiving", label: "Receiving", icon: "receiving" }, { href: "/staff/hub", label: "Wash queue", icon: "hub" },
      { href: "/staff/issues", label: "Customer problems", icon: "reports" }, { href: "/staff/roster", label: "Shift roster", icon: "weekly" },
    );
  }
  if (has(roles, ["admin", "super_admin"])) work.push({ href: "/staff/speed", label: "Speed analytics", icon: "overview" }, { href: "/staff/transport", label: "Free transport", icon: "dispatch" });
  const cleaning: NavGroup["items"] = [];
  if (has(roles, ["scheduler", "secretary", "cashier", "inspector", "admin", "super_admin"])) cleaning.push({ href: "/staff/cleaning", label: "Cleaning requests", icon: "record", exact: true });
  if (has(roles, ["cleaning_lead", "cleaner", "scheduler", "admin", "super_admin"])) cleaning.push({ href: "/staff/cleaning/jobs", label: "My cleaning jobs", icon: "jobs" });
  if (has(roles, ["scheduler", "secretary", "cashier", "inspector", "cleaning_lead", "admin", "super_admin"])) cleaning.push({ href: "/staff/cleaning/board", label: "Cleaning board", icon: "weekly" });
  if (has(roles, ["scheduler", "secretary", "cashier", "admin", "super_admin"])) cleaning.push({ href: "/staff/cleaning/plans", label: "Cleaning plans", icon: "customers" }, { href: "/staff/cleaning/issues", label: "Cleaning issues", icon: "reports" });
  if (has(roles, ["cashier", "secretary", "admin", "super_admin"])) cleaning.push({ href: "/staff/cleaning/invoices", label: "Cleaning bills", icon: "money" });
  if (has(roles, ["scheduler", "admin", "super_admin"])) cleaning.push({ href: "/staff/cleaning/settings", label: "Cleaning settings", icon: "settings" });
  if (has(roles, ["admin", "super_admin"])) cleaning.push({ href: "/staff/cleaning/report", label: "Cleaning report", icon: "overview" });
  if (!washerOnly && !cleaningOnly) work.push({ href: "/staff/spending", label: "Spending", icon: "spending" });
  if (!washerOnly && !cleaningOnly && roles.some((r) => r !== "delivery_agent" && r !== "commission_agent")) work.push({ href: "/staff/count", label: "Count money", icon: "count" });
  if (supportAllowed) work.push({ href: "/staff/support", label: "Customer support", icon: "support" });
  const me: NavGroup["items"] = [
    { href: "/staff/onboarding", label: "My details", icon: "customers" },
    { href: "/staff/savings", label: "My savings", icon: "money" },
    { href: "/staff/guide", label: "Staff guide", icon: "guide" },
  ];
  if (has(roles, ["admin", "super_admin"])) me.push({ href: "/staff/guide/progress", label: "Guide progress", icon: "reports" });
  const groups: NavGroup[] = [{ label: "My work", items: work }, ...(cleaning.length ? [{ label: "Cleaning", items: cleaning }] : []), { label: "Me", items: me }];
  if (roles.includes("super_admin")) groups.push({ label: "Manage", items: [{ href: "/admin", label: "Super admin", icon: "admin" }] });
  return groups;
}

export function navHrefs(groups: NavGroup[]): string[] {
  return [...new Set(groups.flatMap((g) => g.items.map((i) => i.href)))];
}
