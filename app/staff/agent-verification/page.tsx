import { requireRole } from "@/lib/roles";
import { SecretaryAgentHubDesk } from "@/components/staff/SecretaryAgentHubDesk";
export const metadata = { title: "Agent hub verification desk" };
export const dynamic = "force-dynamic";
export default async function SecretaryAgentHubPage() {
 const { supabase } = await requireRole(["secretary","super_admin"]);
 const { data, error } = await supabase.rpc("secretary_agent_hub_queue");
 return <main className="container-page max-w-4xl space-y-5 py-8"><div><h1 className="text-2xl font-bold tracking-tight">Agent hub verification desk</h1><p className="mt-1 text-sm text-ink-soft">Check original NIN and face in person, record the identity decision, then complete each orientation item. Super admin approval remains the final activation step.</p></div>{error?<p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load the verification queue. Check the migration and permissions before using this desk.</p>:<SecretaryAgentHubDesk initial={(data??[]) as never}/>}</main>;
}
