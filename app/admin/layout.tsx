import type { Metadata } from "next";
import { Shell, type NavGroup } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { enforceStaffGate } from "@/lib/staff-gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { manifest: "/manifest/admin", appleWebApp: { capable: true, title: "LaundryPoint Admin", statusBarStyle: "default" } };

const GROUPS: NavGroup[] = [
  { label: "Business", items: [
    { href: "/admin", label: "Overview", icon: "overview", exact: true },
    { href: "/admin/money", label: "Daily money", icon: "money" },
    { href: "/admin/expenses", label: "Expenses", icon: "expenses" },
    { href: "/admin/costs", label: "Start-up costs", icon: "costs" },
  ] },
  { label: "Operations", items: [
    { href: "/admin/attention", label: "Needs attention", icon: "admin" },
    { href: "/admin/disputes", label: "Bank disputes", icon: "money" },
    { href: "/admin/roster", label: "Roster and attendance", icon: "weekly" },
    { href: "/staff/leave", label: "Leave and shift swaps", icon: "weekly" },
    { href: "/staff/instant", label: "Instant orders", icon: "dispatch" },
    { href: "/staff/speed", label: "Speed analytics", icon: "overview" },
    { href: "/admin/orders", label: "Orders and timelines", icon: "orders" },
    { href: "/admin/agents", label: "Agent performance", icon: "jobs" },
    { href: "/staff/dispatch", label: "Dispatch", icon: "dispatch" },
    { href: "/staff/receiving", label: "Receiving", icon: "receiving" },
    { href: "/staff/hub", label: "Wash queue", icon: "hub" },
  ] },
  { label: "People", items: [
    { href: "/admin/staff", label: "Staff and station assignments", icon: "staff" },
    { href: "/admin/weekly", label: "Weekly units", icon: "weekly" },
    { href: "/admin/customers", label: "Customers and growth", icon: "customers" },
    { href: "/admin/subscriptions", label: "Subscribers", icon: "customers" },
    { href: "/admin/subscription-plans", label: "Subscription plans", icon: "prices" },
    { href: "/admin/subscription-reports", label: "Subscription reports", icon: "reports" },
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
  { label: "System", items: [
    { href: "/admin/setup", label: "Go-live check", icon: "reports" },
    { href: "/admin/pricing", label: "Fares and hours", icon: "prices" },
    { href: "/admin/zones", label: "Coverage zones", icon: "points" },
    { href: "/admin/payments", label: "Online payments", icon: "money" },
    { href: "/admin/emails", label: "Email delivery", icon: "waitlist" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, name } = await requireRole(["super_admin"]);
  await enforceStaffGate(supabase, { skipOnboarding: true });
  return <Shell title="Super admin" name={name} groups={[...GROUPS, { label: "Switch", items: [{ href: "/staff", label: "Staff view", icon: "home", exact: true }] }]}>{children}</Shell>;
}