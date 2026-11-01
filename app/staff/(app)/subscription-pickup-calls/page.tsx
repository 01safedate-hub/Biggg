import { requireRole } from "@/lib/roles";
import { PickupFollowupActions } from "@/components/ops/PickupFollowupActions";

export const metadata = { title: "Subscription pickup calls" };
export const dynamic = "force-dynamic";

export default async function SubscriptionPickupCallsPage() {
  const { supabase } = await requireRole(["cashier", "secretary", "admin", "super_admin"]);
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data, error } = await (supabase as any)
    .from("subscription_pickup_followups")
    .select("id,subscription_id,customer_id,first_pickup_id,scheduled_for,call_status,call_notes,last_called_at,profiles:customer_id(full_name,phone)")
    .in("call_status", ["pending", "rescheduled"])
    .gte("scheduled_for", now.toISOString())
    .lte("scheduled_for", soon.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(100);
  if (error) throw new Error("Could not load subscription pickup follow-ups.");
  return <main className="space-y-6">
    <header><h1 className="text-2xl font-bold tracking-tight">Subscription pickup calls</h1><p className="mt-1 text-sm text-ink-soft">Call customers whose planned follow-up pickup is due within the next 24 hours. These are follow-up reminders, not booked orders.</p></header>
    <section className="card divide-y divide-line">
      {(data ?? []).map((item: any) => {
        const customer = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        return <article key={item.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold">{customer?.full_name || "Customer"}</h2><p className="text-sm text-ink-soft">{customer?.phone || "No phone number recorded"}</p><p className="text-sm text-ink-soft">Planned pickup: {new Date(item.scheduled_for).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</p></div>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium">{item.call_status}</span>
          </div>
          <PickupFollowupActions followupId={item.id} initialNotes={item.call_notes ?? ""} />
        </article>;
      })}
      {(data ?? []).length === 0 && <p className="p-5 text-sm text-ink-soft">No pending follow-up calls due in the next 24 hours.</p>}
    </section>
  </main>;
}
