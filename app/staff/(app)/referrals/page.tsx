import { requireRole } from "@/lib/roles";
import { AddClient } from "@/components/ops/AddClient";
import { ResendClientInviteButton } from "@/components/ops/AgentTools";
import { naira } from "@/lib/format";
import { AddAgentReferral } from "@/components/ops/AddAgentReferral";

export const metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

type Client = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  since: string | null;
  orders: number;
  last_order: string | null;
};
type Invite = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  expires_at: string;
  resend_count: number;
  created_at: string;
  signed_up_at: string | null;
};
type Commission = { amount_kobo: number; status: string };
type AgentApplication = { id: string; full_name: string; email: string; phone: string; status: string; created_at: string };

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Lagos",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "—";

const money = (value: number) => naira(Number(value) || 0);

function statusLabel(status: string) {
  if (status === "invited") return "Invitation sent";
  if (status === "signed_up") return "Joined";
  if (status === "expired") return "Expired";
  if (status === "cancelled") return "Cancelled";
  return status.replaceAll("_", " ");
}

export default async function ReferralsPage() {
  const { supabase, user, roles } = await requireRole([
    "delivery_agent",
    "commission_agent",
    "admin",
    "super_admin",
  ]);

  const [{ data: clientsData }, { data: invitesData }, { data: commissionsData }, { data: agentReferralsData }] =
    await Promise.all([
      supabase.rpc("my_clients"),
      (supabase as any)
        .from("client_invites")
        .select("id,name,email,phone,status,expires_at,resend_count,created_at,signed_up_at")
        .eq("agent_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("commissions")
        .select("amount_kobo,status")
        .eq("agent_id", user.id)
        .limit(500),
    ]);

  const clients = (Array.isArray(clientsData) ? clientsData : []) as unknown as Client[];
  const invites = (invitesData ?? []) as unknown as Invite[];
  const commissions = (commissionsData ?? []) as Commission[];\n  const agentReferrals = (agentReferralsData ?? []) as AgentApplication[];
  const joined = clients.length;
  const pending = invites.filter((invite) => invite.status === "invited").length;
  const totalEarned = commissions
    .filter((item) => ["pending", "approved", "paid"].includes(item.status))
    .reduce((sum, item) => sum + Number(item.amount_kobo || 0), 0);
  const paid = commissions
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + Number(item.amount_kobo || 0), 0);
  const awaiting = commissions
    .filter((item) => ["pending", "approved"].includes(item.status))
    .reduce((sum, item) => sum + Number(item.amount_kobo || 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Customer referrals</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Invite customers to LaundryPoint and follow each invitation through to signup and their orders.
        </p>
      </header>

      <AddClient />\n\n      <section className="space-y-3">\n        <div>\n          <h2 className="text-xl font-semibold">Agent referrals</h2>\n          <p className="mt-1 text-sm text-ink-soft">Refer prospective commission agents. There are no recruitment rewards; this is separate from customer commissions.</p>\n        </div>\n        {roles.some((role) => role === "delivery_agent" || role === "commission_agent") && <AddAgentReferral />}\n        <div className="card overflow-hidden">\n          <div className="border-b border-line p-4"><h3 className="font-semibold">People you have referred</h3><p className="mt-1 text-sm text-ink-soft">A referral is not an active staff account. Application, hub/NIN verification by a secretary, and super-admin approval are required.</p></div>\n          <div className="divide-y divide-line">\n            {agentReferrals.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><p className="font-medium">{item.full_name}</p><p className="break-all text-ink-soft">{item.email} · {item.phone}</p><p className="mt-1 text-xs text-ink-soft">Referred {date(item.created_at)}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">{item.status.replaceAll("_", " ")}</span></div>)}\n            {agentReferrals.length === 0 && <p className="p-5 text-sm text-ink-soft">No agent referrals recorded yet.</p>}\n          </div>\n        </div>\n      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Customers joined", joined],
          ["Invitations awaiting signup", pending],
          ["Referral earnings", money(totalEarned)],
          ["Paid referral earnings", money(paid)],
        ].map(([label, value]) => (
          <div className="card p-4" key={String(label)}>
            <p className="text-sm text-ink-soft">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line p-4">
          <h2 className="font-semibold">Invitation activity</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Invitations expire after seven days. You can see whether the customer has completed signup.
          </p>
        </div>
        <div className="divide-y divide-line">
          {invites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{invite.name}</p>
                <p className="break-all text-ink-soft">{invite.email} · {invite.phone}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Invited {date(invite.created_at)}
                  {invite.status === "invited" ? ` · Expires ${date(invite.expires_at)} · ${invite.resend_count}/2 resends used` : ""}
                </p>
              </div>
              <div className="flex flex-col items-start gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${invite.status === "signed_up" ? "bg-emerald-50 text-emerald-800" : invite.status === "invited" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {statusLabel(invite.status)}
              </span>{invite.status === "invited" && <ResendClientInviteButton inviteId={invite.id} resendCount={invite.resend_count} />}</div>
            </div>
          ))}
          {invites.length === 0 && (
            <p className="p-5 text-sm text-ink-soft">No invitations yet. Add a customer above to start your referral list.</p>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line p-4">
          <h2 className="font-semibold">Customers who joined</h2>
          <p className="mt-1 text-sm text-ink-soft">
            These are customers linked to your agent profile after completing signup.
          </p>
        </div>
        <div className="divide-y divide-line">
          {clients.map((client) => (
            <div key={client.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{client.name || "Customer"}</p>
                <p className="break-all text-ink-soft">{client.phone || "No phone"} · {client.email || "No email"}</p>
              </div>
              <p className="text-ink-soft">
                Joined {date(client.since)} · {client.orders} order{client.orders === 1 ? "" : "s"}
                {client.last_order ? ` · Last order ${date(client.last_order)}` : ""}
              </p>
            </div>
          ))}
          {clients.length === 0 && (
            <p className="p-5 text-sm text-ink-soft">Customers will appear here after they complete an invitation signup.</p>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">Referral earnings summary</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Earnings are calculated by LaundryPoint’s existing commission rules after eligible customer payments. This page does not create recruitment bonuses.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm text-ink-soft">Awaiting approval / payment</p>
            <p className="mt-1 text-xl font-semibold">{money(awaiting)}</p>
          </div>
          <div>
            <p className="text-sm text-ink-soft">Already paid</p>
            <p className="mt-1 text-xl font-semibold">{money(paid)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
