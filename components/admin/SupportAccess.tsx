"use client";
import { useState, useTransition } from "react";
import { grantSupportAccess } from "@/app/admin/staff/actions";
type Person={id:string;name:string;email:string|null;roles:string[];enabled:boolean};
export function SupportAccess({people}:{people:Person[]}) {
 const [rows,setRows]=useState(people),[busy,start]=useTransition(),[message,setMessage]=useState("");
 async function toggle(id:string,grant:boolean){setMessage("");start(()=>{void grantSupportAccess(id,grant).then(r=>{setMessage(r.message);if(r.ok)setRows(v=>v.map(p=>p.id===id?{...p,enabled:grant}:p));});});}
 return <section className="card space-y-3 p-5"><div><h2 className="text-lg font-semibold">Support access</h2><p className="text-sm text-ink-soft">Admins and Super Admins always have access. Grant or revoke access for other staff here.</p></div>{message&&<p role="status" className="text-sm text-ink-soft">{message}</p>}<div className="divide-y divide-line">{rows.filter(p=>!p.roles.some(r=>["admin","super_admin"].includes(r))).map(p=><label key={p.id} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><b className="block text-sm">{p.name||p.email||"Staff member"}</b><span className="text-xs text-ink-mute">{p.roles.join(", ")}</span></span><input type="checkbox" checked={p.enabled} disabled={busy} onChange={e=>void toggle(p.id,e.target.checked)} aria-label={`Support access for ${p.name||p.email}`}/></label>)}</div></section>;
}
