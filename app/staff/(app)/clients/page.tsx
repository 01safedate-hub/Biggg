import { requireRole } from "@/lib/roles";
import { PhoneActions } from "@/components/ops/PhoneActions";
import { AddClient } from "@/components/ops/AddClient";
export const metadata={title:"My clients"}; export const dynamic="force-dynamic";
type C={id:string;name:string|null;phone:string|null;email:string|null;since:string|null;orders:number;last_order:string|null};
const day=(iso:string|null)=>(iso?new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Lagos",day:"numeric",month:"short",year:"numeric"}).format(new Date(iso)):"none yet");
export default async function MyClients(){const {supabase}=await requireRole(["delivery_agent","commission_agent","admin","super_admin"]);const {data}=await supabase.rpc("my_clients");const rows=(Array.isArray(data)?data:[]) as unknown as C[];
return <div className="space-y-6"><div><h1 className="text-2xl font-bold tracking-tight">My clients</h1><p className="mt-1 text-sm text-ink-soft">People you brought to LaundryPoint. {rows.length} so far.</p></div><AddClient/><div className="card divide-y divide-line">{rows.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"><div><p className="font-medium">{c.name||"No name"}</p><p className="text-ink-soft"><PhoneActions phone={c.phone}/> · {c.email}</p></div><p className="text-ink-soft">Added {day(c.since)} · {c.orders} order{c.orders===1?"":"s"} · last {day(c.last_order)}</p></div>)}{rows.length===0&&<p className="p-5 text-sm text-ink-soft">No clients yet. Add your first one above.</p>}</div></div>}
