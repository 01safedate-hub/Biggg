"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
type Item={key:string;label:string;checked:boolean};
type Agent={agent_id:string;full_name:string;phone:string|null;onboarding_status:string;hub_visit_at:string|null;hub_distance_m:number|null;secretary_verified_at:string|null;orientation_completed_at:string|null;agreement_accepted_at:string|null;nin_last4:string|null;items:Item[]};
export function SecretaryAgentHubDesk({initial}:{initial:Agent[]}) {
 const [rows,setRows]=useState(initial); const [busy,setBusy]=useState<string|null>(null); const [note,setNote]=useState<Record<string,string>>({}); const [message,setMessage]=useState("");
 const supabase=createClient();
 async function refresh(){const {data,error}=await supabase.rpc("secretary_agent_hub_queue");if(error)throw error;setRows((data??[]) as Agent[]);}
 async function decide(id:string,approve:boolean){setBusy(id);setMessage("");try{const {error}=await supabase.rpc("secretary_verify_agent_identity",{_agent:id,_approved:approve,_note:note[id]??null});if(error)throw error;await refresh();setMessage(approve?"Identity verification recorded.":"Agent verification returned with a note.");}catch(e){setMessage(e instanceof Error?e.message:"Could not save identity decision.");}finally{setBusy(null);}}
 async function check(id:string,key:string){setBusy(id);setMessage("");try{const {error}=await supabase.rpc("secretary_check_agent_orientation",{_agent:id,_item:key});if(error)throw error;await refresh();}catch(e){setMessage(e instanceof Error?e.message:"Could not save orientation item.");}finally{setBusy(null);}}
 return <div className="space-y-4">
  {rows.map(a=><section key={a.agent_id} className="card space-y-3 p-5">
   <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{a.full_name||"Unnamed applicant"}</h2><p className="text-sm text-ink-soft">{a.phone||"No phone"} · NIN ending {a.nin_last4||"not available"}</p></div><span className="rounded-full border px-3 py-1 text-xs">{a.onboarding_status}</span></div>
   <p className="text-sm">Hub visit: <strong>{a.hub_visit_at?new Date(a.hub_visit_at).toLocaleString():"Not recorded"}</strong>{a.hub_distance_m!=null?" · "+a.hub_distance_m+" m from hub":""}</p>
   <p className="text-sm">Secretary identity check: <strong>{a.secretary_verified_at?"Verified":"Pending"}</strong> · Orientation: <strong>{a.orientation_completed_at?"Complete":"Pending"}</strong> · Agreement: <strong>{a.agreement_accepted_at?"Accepted":"Pending"}</strong></p>
   {a.items?.length>0&&<div className="space-y-2"><h3 className="text-sm font-semibold">Orientation checklist</h3>{a.items.map(i=><label key={i.key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={i.checked} disabled={!!busy||!a.secretary_verified_at} onChange={()=>check(a.agent_id,i.key)}/><span>{i.label}</span></label>)}</div>}
   <p className="text-xs text-ink-soft">Compare the applicant in person with the original NIN document and fresh face photo at the hub. This desk intentionally does not display the document or full NIN.</p>
   <textarea className="w-full rounded-md border p-2 text-sm" rows={2} placeholder="Required note when returning an application" value={note[a.agent_id]??""} onChange={e=>setNote(v=>({...v,[a.agent_id]:e.target.value}))}/>
   <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={!!busy||!a.hub_visit_at} onClick={()=>decide(a.agent_id,true)}>{busy===a.agent_id?"Saving…":"Verify identity"}</button><button className="btn-secondary" disabled={!!busy||!(note[a.agent_id]??"").trim()} onClick={()=>decide(a.agent_id,false)}>Return with note</button></div>
  </section>)}
  {rows.length===0&&<p className="card p-5 text-sm text-ink-soft">No delivery-agent applications found.</p>}
  {message&&<p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
 </div>;
}
