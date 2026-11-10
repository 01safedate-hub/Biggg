"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canManageSupport, supportPermission } from "./actions";

type Thread={phone:string;mode:"ai"|"human"|"resolved";assigned_to:string|null;response_due_at:string|null;last_message:string|null;last_direction:string|null;last_message_at:string|null;unread_count:number};
type Message={id:string;direction:string;body:string;created_at:string;delivery_status:string|null};
const tabs=["ai","human","resolved"] as const;
export default function SupportPage(){
 const supabase=useMemo(()=>createClient(),[]);
 const [tab,setTab]=useState<(typeof tabs)[number]>("ai");
 const [threads,setThreads]=useState<Thread[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [draft,setDraft]=useState("");
 const [muted,setMuted]=useState(false);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [canManage,setCanManage]=useState(false);
 const [permissionUser,setPermissionUser]=useState("");
 const [permissionMessage,setPermissionMessage]=useState("");
 const audio=useRef<AudioContext|null>(null);
 const seen=useRef("");
 const supportRpc=supabase.rpc as unknown as (fn:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>;

 const refresh=useCallback(async()=>{
   const {data,error}=await supportRpc("staff_support_list",{_mode:"all"});
   if(error){setError(error.message);return;}
   const next=(Array.isArray(data)?data:[]) as Thread[];
   const newest=next.find(x=>x.mode!=="resolved"&&x.last_direction==="inbound")?.last_message_at??"";
   if(newest&&seen.current&&newest>seen.current&&!muted){
     try{audio.current??=new AudioContext();const ctx=audio.current;const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.value=880;gain.gain.value=.045;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.16);}catch{}
   }
   if(newest)seen.current=newest;
   setThreads(next);
 },[supabase,muted]);
 useEffect(()=>{void canManageSupport().then(setCanManage);void refresh();const id=setInterval(()=>void refresh(),8000);return()=>clearInterval(id);},[refresh]);
 const open=async(phone:string)=>{setSelected(phone);const {data,error}=await supportRpc("staff_support_history",{_phone:phone});if(error){setError(error.message);return;}setMessages((Array.isArray(data)?data:[]) as Message[]);};
 const act=async(fn:string,args:Record<string,unknown>={})=>{setBusy(true);setError("");const {error}=await supportRpc(fn,args);setBusy(false);if(error){setError(error.message);return;}await refresh();if(selected)await open(selected);};
 const send=async()=>{if(!selected||!draft.trim())return;setBusy(true);const {error}=await supportRpc("staff_support_reply",{_phone:selected,_body:draft.trim()});setBusy(false);if(error){setError(error.message);return;}setDraft("");await open(selected);await refresh();};
 const visible=threads.filter(t=>t.mode===tab);
 const changePermission=async(grant:boolean)=>{const id=permissionUser.trim();if(!id)return;const result=await supportPermission(id,grant);setPermissionMessage(result.message);if(result.ok)setPermissionUser("");};
 const current=threads.find(t=>t.phone===selected);
 return <div className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Support Centre</h1><p className="text-sm text-ink-soft">WhatsApp customer conversations</p></div><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setMuted(x=>!x)}>{muted?"Unmute alerts":"Mute alerts"}</button></div>
  {canManage&&<section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Support access permissions</h2><p className="mt-1 text-xs text-ink-soft">Grant or revoke access using the staff member’s Supabase user UUID. Super Admin, Admin and Secretary already have access by role.</p><div className="mt-3 flex flex-wrap gap-2"><input value={permissionUser} onChange={e=>setPermissionUser(e.target.value)} placeholder="Staff user UUID" className="min-w-[240px] flex-1 rounded-lg border px-3 py-2 text-sm"/><button type="button" onClick={()=>void changePermission(true)} className="rounded-lg bg-brand px-3 py-2 text-sm text-white">Grant access</button><button type="button" onClick={()=>void changePermission(false)} className="rounded-lg border px-3 py-2 text-sm">Revoke access</button></div>{permissionMessage&&<p className="mt-2 text-xs text-ink-soft">{permissionMessage}</p>}</section>}
  <div className="flex gap-2 border-b">{tabs.map(t=><button key={t} onClick={()=>setTab(t)} className={`px-4 py-3 text-sm font-semibold capitalize ${tab===t?"border-b-2 border-brand text-brand":"text-ink-soft"}`}>{t} <span className="ml-1 rounded-full bg-canvas px-2 py-0.5">{threads.filter(x=>x.mode===t).length}</span></button>)}</div>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  <div className="grid min-h-[65vh] gap-4 lg:grid-cols-[320px_1fr]">
   <aside className="space-y-2">{visible.map(t=><button key={t.phone} onClick={()=>void open(t.phone)} className={`w-full rounded-xl border p-3 text-left ${selected===t.phone?"border-brand bg-brand-tint":"bg-white"}`}><div className="flex justify-between gap-2"><strong className="text-sm">{t.phone}</strong>{t.unread_count>0&&<span className="rounded-full bg-brand px-2 text-xs text-white">{t.unread_count}</span>}</div><p className="mt-1 line-clamp-2 text-xs text-ink-soft">{t.last_message??"No messages yet"}</p><div className="mt-2 flex justify-between text-[11px] text-ink-mute">{t.mode==="human"&&t.response_due_at?<span>Due {new Date(t.response_due_at).toLocaleTimeString()}</span>:<span className="capitalize">{t.mode}</span>}<span>{t.last_message_at?new Date(t.last_message_at).toLocaleString():""}</span></div></button>)}{visible.length===0&&<p className="p-4 text-sm text-ink-soft">No conversations in this tab.</p>}</aside>
   <section className="flex min-h-[60vh] flex-col rounded-xl border bg-white">
    {selected&&current?<><header className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><div><strong>{selected}</strong><p className="text-xs capitalize text-ink-soft">{current.mode} conversation</p></div><div className="flex flex-wrap gap-2">{current.mode!=="human"&&<button disabled={busy} onClick={()=>void act("staff_support_takeover",{_phone:selected})} className="rounded-lg bg-brand px-3 py-2 text-sm text-white">Take over</button>}{current.mode==="human"&&<button disabled={busy} onClick={()=>void act("staff_support_return_ai",{_phone:selected})} className="rounded-lg border px-3 py-2 text-sm">Return to AI</button>}<button disabled={busy} onClick={()=>void act("staff_support_resolve",{_phone:selected})} className="rounded-lg border px-3 py-2 text-sm">Resolve</button></div></header><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map(m=><div key={m.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${m.direction==="inbound"?"bg-canvas":"ml-auto bg-brand-tint"}`}><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-[10px] text-ink-mute">{new Date(m.created_at).toLocaleString()} · {m.delivery_status??m.direction}</p></div>)}</div>{current.mode==="human"&&<form onSubmit={e=>{e.preventDefault();void send();}} className="flex gap-2 border-t p-3"><input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={3500} placeholder="Reply to customer…" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"/><button disabled={busy||!draft.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button></form>}</>:<div className="grid flex-1 place-items-center p-8 text-sm text-ink-soft">Select a conversation to view its history.</div>}
   </section>
  </div>
  <p className="text-xs text-ink-mute">Inbox refreshes every 8 seconds. Sound alerts begin after browser interaction. Replies are queued and remain subject to WhatsApp's 24-hour service-window eligibility.</p>
 </div>;
}
