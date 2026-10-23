import Link from "next/link";
import { requireRole } from "@/lib/roles";

export const metadata = { title: "Go-live check" };
export const dynamic = "force-dynamic";

type Check = { ok: boolean; text: string; href?: string; hint?: string };

export default async function SetupPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const cnt = { count: "exact", head: true } as const;
  const [settings, zones, items, cats, roles, profs, points, failedMail, review, refunds, failedDel, unassigned, stuckPay, readyLong] = await Promise.all([
    supabase.from("settings").select("key,value").in("key", ["hub", "contact", "whatsapp", "fare_pickup", "fare_delivery", "targets"]),
    supabase.from("zones").select("id", cnt).eq("is_live", true),
    supabase.from("items").select("id", cnt).eq("active", true),
    supabase.from("item_categories").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("user_roles").select("user_id,role"),
    supabase.from("profiles").select("id,status"),
    supabase.from("money_points").select("kind,active"),
    supabase.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("order_events").select("id", { count: "exact", head: true }).eq("event", "payment_needs_review"),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("kind", "refund").eq("status", "pending"),
    supabase.from("orders").select("id", cnt).eq("status", "failed_delivery"),
    supabase.from("orders").select("id", cnt).eq("status", "awaiting_dispatch").lt("updated_at", ago(20)),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending").eq("kind", "payment").in("mode", ["paystack", "flutterwave"]).lt("created_at", ago(30)),
    supabase.from("orders").select("id", cnt).eq("status", "ready").lt("ready_at", ago(60 * 48)),
  ]);
  const s = Object.fromEntries((settings.data ?? []).map((x) => [x.key, (x.value ?? {}) as Record<string, unknown>]));
  const active = new Set((profs.data ?? []).filter((p) => p.status === "active").map((p) => p.id));
  const withRole = (r: string) => (roles.data ?? []).filter((x) => x.role === r && active.has(x.user_id)).length;
  const mp = (k: string) => (points.data ?? []).some((p) => p.kind === k && p.active);

  const launch: Check[] = [
    { ok: s.hub?.lat != null && s.hub?.lng != null, text: "Store location is set", href: "/admin/settings", hint: "Fares are measured from here. Without it nobody can book." },
    { ok: (zones.count ?? 0) > 0, text: `At least one coverage zone is switched on (${zones.count ?? 0} now)`, href: "/admin/zones" },
    { ok: Number(s.fare_pickup?.min_fare_kobo ?? 0) > 0 && Number(s.fare_delivery?.min_fare_kobo ?? 0) > 0, text: "Pickup and delivery fares are set", href: "/admin/pricing" },
    { ok: (items.count ?? 0) > 0 && (cats.count ?? 0) > 0, text: `Price list has items (${items.count ?? 0} items in ${cats.count ?? 0} categories)`, href: "/admin/prices" },
    { ok: Boolean(s.contact?.phone), text: "Contact phone number is set", href: "/admin/settings" },
    { ok: Boolean(s.whatsapp?.number), text: "WhatsApp number is set", href: "/admin/settings" },
    { ok: withRole("delivery_agent") > 0, text: `At least one active delivery agent (${withRole("delivery_agent")})`, href: "/admin/staff" },
    { ok: withRole("secretary") > 0, text: `At least one active secretary (${withRole("secretary")})`, href: "/admin/staff" },
    { ok: withRole("cashier") > 0, text: `At least one active cashier (${withRole("cashier")})`, href: "/admin/staff" },
    { ok: mp("online") && mp("cash"), text: "Online and cash money points exist", href: "/admin/points" },
    { ok: Number(s.targets?.monthly_net_kobo ?? 0) > 0, text: "Monthly profit target is set", href: "/admin/settings" },
  ];
  const attention: Check[] = [
    { ok: (review.count ?? 0) === 0, text: `${review.count ?? 0} online payment${review.count === 1 ? "" : "s"} arrived at the wrong moment and need a look`, href: "/admin/orders", hint: "The money is safe in the payments list. Match it to the order and sort it out with the customer." },
    { ok: (refunds.count ?? 0) === 0, text: `${refunds.count ?? 0} refund${refunds.count === 1 ? "" : "s"} waiting to be sent`, href: "/admin/payments" },
    { ok: (stuckPay.count ?? 0) === 0, text: `${stuckPay.count ?? 0} online payment${stuckPay.count === 1 ? "" : "s"} pending for over 30 minutes`, href: "/admin/payments?status=pending" },
    { ok: (unassigned.count ?? 0) === 0, text: `${unassigned.count ?? 0} paid pickup${unassigned.count === 1 ? "" : "s"} without an agent for over 20 minutes`, href: "/staff/dispatch" },
    { ok: (failedDel.count ?? 0) === 0, text: `${failedDel.count ?? 0} failed deliver${failedDel.count === 1 ? "y" : "ies"} to follow up`, href: "/staff/dispatch" },
    { ok: (readyLong.count ?? 0) === 0, text: `${readyLong.count ?? 0} order${readyLong.count === 1 ? "" : "s"} ready for over 2 days and not yet paid for delivery`, href: "/staff/hub", hint: "Call these customers before storage charges apply." },
    { ok: (failedMail.count ?? 0) === 0, text: `${failedMail.count ?? 0} email${failedMail.count === 1 ? "" : "s"} failed to send`, href: "/admin/emails" },
  ];
  const manual = [
    "Paystack: secret key added in Supabase, and the webhook URL pasted in the Paystack dashboard",
    "Flutterwave: secret key and webhook hash added, and the webhook URL pasted in the Flutterwave dashboard",
    "Resend: your sending domain is verified, and the sender address is set",
    "Supabase Auth: Send Email hook switched on, Site URL set to your live address, leaked-password protection on",
    "Do a real test: book a pickup with your own phone, pay a small fare, and walk it all the way to delivered",
  ];
  const row = (c: Check) => (
    <li key={c.text} className="flex items-start gap-3 p-4">
      <span aria-hidden className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold ${c.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{c.ok ? "✓" : "!"}</span>
      <div className="min-w-0 flex-1"><p className={c.ok ? "text-ink-soft" : "font-medium"}>{c.text}<span className="sr-only">{c.ok ? " (done)" : " (needs action)"}</span></p>{!c.ok && c.hint && <p className="mt-0.5 text-sm text-ink-soft">{c.hint}</p>}</div>
      {!c.ok && c.href && <Link href={c.href} className="shrink-0 text-sm font-medium text-brand-dark underline">Fix</Link>}
    </li>
  );
  const open = attention.filter((c) => !c.ok).length;
  const todo = launch.filter((c) => !c.ok).length;
  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-bold tracking-tight">Go-live check</h1><p className="mt-1 text-sm text-ink-soft">What still needs doing before customers can use the system, and what needs your attention right now.</p></div>
      <section className="space-y-2"><h2 className="text-lg font-semibold">Needs attention now {open > 0 ? `(${open})` : ""}</h2>
        <ul className="card divide-y divide-line">{attention.map(row)}</ul>{open === 0 && <p className="text-sm text-emerald-700">Everything is running smoothly.</p>}</section>
      <section className="space-y-2"><h2 className="text-lg font-semibold">Ready to launch? {todo > 0 ? `${todo} thing${todo === 1 ? "" : "s"} left` : "All set"}</h2>
        <ul className="card divide-y divide-line">{launch.map(row)}</ul></section>
      <section className="space-y-2"><h2 className="text-lg font-semibold">Check these yourself</h2><p className="text-sm text-ink-soft">The app cannot see these outside services, so confirm each one by hand.</p>
        <ul className="card divide-y divide-line">{manual.map((t) => <li key={t} className="flex gap-3 p-4 text-sm"><span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-line" />{t}</li>)}</ul></section>
    </div>
  );
}
