import { requireRole } from "@/lib/roles";
import { SupportInbox } from "@/components/staff/SupportInbox";
export const metadata = { title: "Customer support" };
export const dynamic = "force-dynamic";
export default async function SupportPage() {
  const { supabase } = await requireRole(["super_admin","admin","secretary","cashier","delivery_agent","commission_agent","washer"]);
  const { data: allowed } = await supabase.rpc("staff_support_allowed");
  if (allowed !== true) return <div className="card p-6"><h1 className="text-xl font-semibold">Support access required</h1><p className="mt-2 text-sm text-ink-soft">Ask a Super Admin to grant you Support access.</p></div>;
  const { data, error } = await supabase.rpc("staff_support_list", { _mode: "all" });
  if (error) throw new Error("Unable to load support inbox");
  return <SupportInbox initial={(Array.isArray(data) ? data : []) as SupportConversation[]} />;
}
export type SupportConversation = { phone:string; mode:"ai"|"human"|"resolved"; assigned_to:string|null; handoff_started_at:string|null; response_due_at:string|null; resolved_at:string|null; last_message:string|null; last_direction:string|null; last_message_at:string|null; unread_count:number };
