"use client";
import { useState, useTransition } from "react";
import { decideSwap } from "@/app/staff/(app)/leave-actions";

type Swap = {id:string; requester_id:string; target_staff_id:string|null; status:string; created_at:string; shift:any};
export function AdminShiftSwapRequests({swaps,names}:{swaps:Swap[];names:Record<string,string>}) {
 const [busy,startTransition]=useTransition(); const [feedback,setFeedback]=useState("");
 const act=(id:string,approve:boolean,note:string)=>startTransition(async()=>{const r=await decideSwap(id,approve,note);setFeedback(r.message);if(r.ok)window.location.reload();});
 return <section className="space-y-2"><h2 className="text-lg font-semibold">Shift-swap requests</h2>{feedback&&<p role="status" className="rounded border border-line p-3 text-sm">{feedback}</p>}<div className="card divide-y divide-line">
 {swaps.map(s=>{const shift=Array.isArray(s.shift)?s.shift[0]:s.shift;return <article key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{names[s.requester_id]??"Staff"} → {s.target_staff_id?(names[s.target_staff_id]??"Colleague"):"No colleague selected"}</p><p className="text-ink-soft">{shift?.shift_date??"Shift"} · Requested {new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Lagos",dateStyle:"medium",timeStyle:"short"}).format(new Date(s.created_at))}</p><p className="mt-1 text-xs capitalize">Status: {s.status}</p></div><div className="flex flex-wrap gap-2">{s.status==="accepted"&&<button disabled={busy} className="btn-primary" onClick={()=>act(s.id,true,"Approved by manager")}>Approve & transfer shift</button>}{["pending","accepted"].includes(s.status)&&<button disabled={busy} className="btn-secondary" onClick={()=>act(s.id,false,"Rejected by manager")}>Reject request</button>}</div></article>})}
 {swaps.length===0&&<p className="p-4 text-sm text-ink-soft">No shift-swap requests found.</p>}</div><p className="text-xs text-ink-soft">Approving an accepted request transfers the shift to the colleague and marks it Approved. Rejecting a pending or accepted request leaves the shift assignment unchanged and marks it Rejected.</p></section>;
}
