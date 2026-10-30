import { Shell, type NavGroup } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { enforceStaffGate } from "@/lib/staff-gate";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { supabase, name, roles } = await requireRole(["super_admin", "admin", "secretary", "cashier", "delivery_agent"]);
  const state = await enforceStaffGate(supabase, { skipOnboarding: roles.includes("super_admin") });
  const isAgentOnly = roles.includes("delivery_agent") && !roles.some((r) => ["secretary", "admin", "super_admin", "cashier"].includes(r));
  const agentVerified = !isAgentOnly || (state?.onboarding_status === "verified" && await supabase.rpc("agent_gate").then(({ data }) => data === true));
  const work: NavGroup["items"] = [{ href: "/staff", label: "Home", icon: "home", exact: true }];
  work.push({ href: "/staff/my-shifts", label: "My shifts", icon: "weekly" });
  work.push({ href: "/staff/leave", label: "Leave and swaps", icon: "weekly" });
  if (roles.includes("secretary") || roles.includes("super_admin")) work.push({ href: "/staff/expenses", label: "Record expense", icon: "record" });
  if (roles.includes("delivery_agent") && agentVerified) work.push({ href: "/staff/jobs", label: "Pickup jobs", icon: "jobs" });
  if (roles.some((r) => ["admin", "super_admin"].includes(r)) || (roles.includes("delivery_agent") && agentVerified)) work.push({ href: "/staff/clients", label: "My clients", icon: "customers" });
  if (roles.some((r) => ["secretary", "admin", "super_admin"].includes(r))) {
    work.push({ href: "/staff/dispatch", label: "Dispatch", icon: "dispatch" });
    work.push({ href: "/staff/instant", label: "Instant orders", icon: "dispatch" });
    work.push({ href: "/staff/walkin", label: "Walk-in orders", icon: "customers" });
    work.push({ href: "/staff/receiving", label: "Receiving", icon: "receiving" });
    work.push({ href: "/staff/hub", label: "Wash queue", icon: "hub" });
    work.push({ href: "/staff/issues", label: "Customer problems", icon: "reports" });
    work.push({ href: "/staff/roster", label: "Shift roster", icon: "weekly" });
  }
  if (roles.some((r) => ["admin", "super_admin"].includes(r))) work.push({ href: "/staff/speed", label: "Speed analytics", icon: "overview" });
  work.push({ href: "/staff/spending", label: "Spending", icon: "spending" });
  if (roles.some((r) => r !== "delivery_agent")) work.push({ href: "/staff/count", label: "Count money", icon: "count" });
  const groups: NavGroup[] = [{ label: "My work", items: work }, { label: "Me", items: [{ href: "/staff/onboarding", label: "My details", icon: "customers" }] }];
  if (roles.includes("super_admin")) groups.push({ label: "Manage", items: [{ href: "/admin", label: "Super admin", icon: "admin" }] });
  if (isAgentOnly && !agentVerified) {
    return <Shell title="Agent onboarding" name={name} groups={[{ label: "Application", items: [{ href: "/staff/onboarding", label: "My details", icon: "customers" }] }]}>
      <main className="container-page max-w-2xl space-y-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Complete your hub verification</h1>
        <p className="text-sm text-ink-soft">Your account is not active as a delivery agent yet. Visit the LaundryPoint hub with your NIN document. The secretary will verify your identity and complete your orientation before a super admin approves your access.</p>
        <div className="card space-y-2 p-5 text-sm">
          <p><strong>Current status:</strong> {state?.onboarding_status ?? "Application incomplete"}</p>
          <p>After your hub visit, the app will show your recorded attendance, identity check, orientation and agreement status.</p>
          <p className="text-ink-soft">You cannot add clients, accept jobs or receive payouts until final approval.</p>
        </div>
        <div className="flex flex-wrap gap-3"><a href="/staff/onboarding" className="btn-primary inline-block">Continue my details</a><a href="/staff/agent-hub" className="btn-secondary inline-block">Open hub verification</a></div>
      </main>
    </Shell>;
  }
  return <Shell title="Staff" name={name} groups={groups}>{children}</Shell>;
}