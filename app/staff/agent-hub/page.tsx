import { requireRole } from "@/lib/roles";
import { AgentHubVerification } from "@/components/staff/AgentHubVerification";

export const metadata = { title: "Agent hub verification" };
export const dynamic = "force-dynamic";

export default async function AgentHubPage() {
 const { supabase } = await requireRole(["delivery_agent"]);
 const { data, error } = await supabase.rpc("agent_hub_status");
 if (error || !data) return <main className="container-page max-w-3xl space-y-4 py-8"><h1 className="text-2xl font-bold tracking-tight">Agent hub verification</h1><p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">Your hub verification status could not be loaded. Please refresh or contact the LaundryPoint secretary.</p></main>;
 return <main className="container-page max-w-3xl space-y-5 py-8"><div><h1 className="text-2xl font-bold tracking-tight">Agent hub verification</h1><p className="mt-1 text-sm text-ink-soft">Complete these steps in order. Your account remains restricted until the secretary verifies you and a super admin gives final approval.</p></div><AgentHubVerification initial={data as never} /></main>;
}
