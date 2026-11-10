"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { loadSupport, loadSupportHistory, supportReply, supportResolve, supportReturnAI, supportTakeover } from "@/app/staff/(app)/support/actions";
import type { SupportConversation } from "@/app/staff/(app)/support/page";
import { createClient } from "@/lib/supabase/client";

type Message = {id:string;direction:string;body:string;created_at:string;delivery_status?:string};
const fmt=(v:string|null)=>v?new Intl.DateTimeFormat("en-NG",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v)):"";
export function SupportInbox({initial}:{initial:SupportConversation[]}) {
 const messagesEndRef=useRef<HTMLDivElement|null>(null);
 const [rows,setRows]=useState(initial),[tab,setTab]=useState<"ai"|"human"|"resolved">("human"),[conversationId,setConversationId]=useState<string|null>(null),[messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[error,setError]=useState(""),[busy,start]=useTransition() ;
 const lastInboundIds=useRef<Set<string>>(new Set());
 const [soundEnabled,setSoundEnabled]=useState(true);
 useEffect(()=>{try{setSoundEnabled(window.localStorage.getItem("staff-notification-sound")!=="off");}catch{setSoundEnabled(true);}},[]);
 function toggleSound(){setSoundEnabled(enabled=>{const next=!enabled;try{window.localStorage.setItem("staff-notification-sound",next?"on":"off");}catch{};window.dispatchEvent(new Event("staff-notification-sound-change"));return next;});}
 const refresh=useCallback(async()=>{try{const d=await loadSupport("all");setRows(Array.isArray(d)?d as SupportConversation[]:[]);}catch(e){setError(e instanceof Error?e.message:"Refresh failed");}},[]);
 
 useEffect(()=>{
  const supabase=createClient();
  let refreshTimer: ReturnType<typeof setTimeout>|undefined;
  const scheduleRefresh=()=>{if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{void refresh();},180);};
  const channel=supabase.channel("staff-support-live")
   .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_support_conversations"},scheduleRefresh)
   .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_conversation_messages"},payload=>{
     scheduleRefresh();
     const incoming=payload.new as Message & {phone?:string};
     if(incoming?.direction==="inbound"&&incoming.id&&!lastInboundIds.current.has(incoming.id)){
       lastInboundIds.current.add(incoming.id);
     }
     const changedConversationId=String((payload.new as {conversation_id?:string}|null)?.conversation_id??(payload.old as {conversation_id?:string}|null)?.conversation_id??"");
     if(conversationId&&changedConversationId===conversationId){
       void loadSupportHistory(conversationId).then(d=>setMessages(Array.isArray(d)?d as Message[]:d?[d as Message]:[])).catch(()=>{});
     }
   })
   .subscribe();
  const fallback=setInterval(()=>{void refresh();if(conversationId)void loadSupportHistory(conversationId).then(d=>setMessages(Array.isArray(d)?d as Message[]:d?[d as Message]:[])).catch(()=>{});},60000);
  return()=>{if(refreshTimer)clearTimeout(refreshTimer);clearInterval(fallback);void supabase.removeChannel(channel);};
 },[refresh,conversationId]);
 useEffect(()=>{messagesEndRef.current?.scrollIntoView({block:"end",behavior:"auto"});},[messages,conversationId]);
 const selected=rows.find(r=>r.id===conversationId);
 const shown=useMemo(()=>rows.filter(r=>r.mode===tab).sort((a,b)=>(b.last_message_at??"").localeCompare(a.last_message_at??"")),[rows,tab]);
 async function open(r:SupportConversation){setConversationId(r.id);setError("");try{const d=await loadSupportHistory(r.id);setMessages(Array.isArray(d)?d as Message[]:d ? [d as Message] : []);await refresh();}catch(e){setError(e instanceof Error?e.message:"Unable to load chat");}}
 async function act(fn:()=>Promise<unknown>){setError("");start(()=>{void fn().then(refresh).catch(e=>setError(e instanceof Error?e.message:"Action failed"));});}
 async function send(){if(!conversationId||!draft.trim())return;const body=draft.trim();setDraft("");act(async()=>{await supportReply(conversationId,body);const d=await loadSupportHistory(conversationId);setMessages(Array.isArray(d)?d as Message[]:d ? [d as Message] : []);});}
 return <div className="w-full min-w-0 max-w-full space-y-5 overflow-x-hidden">
  <header className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Customer support</h1><p className="mt-1 text-sm text-ink-soft">WhatsApp conversations · human handover expires after one hour without a staff reply.</p></div><button type="button" onClick={toggleSound} aria-label={soundEnabled?"Mute notification sound":"Enable notification sound"} className="rounded-full border border-orange-300 bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700">{soundEnabled?"🔔 Sound on":"🔕 Sound off"}</button></header>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  <nav className="grid w-full min-w-0 grid-cols-3 gap-2">{(["ai","human","resolved"] as const).map(t=><button key={t} onClick={()=>setTab(t)} className={`rounded-xl border p-3 text-sm font-semibold capitalize ${tab===t?"border-brand bg-brand/10 text-brand-dark":"bg-white"}`}>{t}<span className="ml-2 rounded-full bg-black/5 px-2 py-0.5">{rows.filter(r=>r.mode===t).length}</span></button>)}</nav>
  <div className="grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
   <section className="card min-w-0 max-h-[70vh] space-y-2 overflow-y-auto p-3">{shown.map(r=><button key={r.id} onClick={()=>void open(r)} className={`w-full rounded-lg border p-3 text-left ${conversationId===r.id?"border-brand bg-brand/5":""}`}><div className="flex justify-between gap-2"><div className="min-w-0 flex-1"><b className="block truncate text-sm">{r.customer_name||r.phone}</b><div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs text-ink-mute"><span className="truncate">{r.phone}</span><span className="shrink-0">{fmt(r.last_message_at)}</span></div></div></div><div className="mt-1 flex min-w-0 items-center justify-between gap-2"><p className="min-w-0 flex-1 truncate text-sm text-ink-soft">{r.last_message??"No messages yet"}</p>{r.unread_count>0&&<span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs">{r.unread_count} new</span>}</div>{r.response_due_at&&r.mode==="human"&&<p className="mt-2 text-xs text-ink-mute">Reply by {fmt(r.response_due_at)}</p>}</button>)}{shown.length===0&&<p className="p-4 text-sm text-ink-soft">No conversations in this tab.</p>}</section>
   <section className="card flex h-[70dvh] min-h-[420px] max-h-[760px] min-w-0 max-w-full flex-col overflow-hidden p-3 sm:p-4 lg:h-[75vh]">{selected?<><div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3"><div><h2 className="font-semibold">{selected.customer_name||selected.phone}</h2>{selected.customer_name&&<p className="text-xs text-ink-mute">{selected.phone}</p>}<p className="text-xs capitalize text-ink-mute">{selected.mode} support {selected.assigned_to?"· assigned":""}</p></div><div className="flex flex-wrap gap-2">{selected.mode==="ai"?<button disabled={busy} onClick={()=>act(()=>supportTakeover(selected.id))} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">Take over</button>:selected.mode==="human"?<><button disabled={busy} onClick={()=>act(()=>supportReturnAI(selected.id))} className="rounded-lg border px-3 py-2 text-sm">Return to AI</button><button disabled={busy} onClick={()=>act(()=>supportResolve(selected.id))} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white">Resolve</button></>:<span className="rounded-lg border px-3 py-2 text-sm text-ink-mute">Resolved · read-only</span>}</div></div><div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain overflow-x-hidden py-4">{messages.map(m=><div key={m.id} className={`max-w-[85%] min-w-0 break-words [overflow-wrap:anywhere] rounded-xl p-3 text-sm ${m.direction==="inbound"?"bg-canvas":"ml-auto bg-brand/10"}`}><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body}</p><p className="mt-1 text-[10px] text-ink-mute">{fmt(m.created_at)}{m.delivery_status?` · ${m.delivery_status}`:""}</p></div>)}<div ref={messagesEndRef} /></div>{selected.mode!=="resolved"&&<form onSubmit={e=>{e.preventDefault();void send();}} className="sticky bottom-0 flex shrink-0 gap-2 border-t bg-white pt-3 pb-[env(safe-area-inset-bottom)]"><input value={draft} onChange={e=>setDraft(e.target.value)} maxLength={3500} placeholder="Reply on WhatsApp…" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"/><button disabled={busy||!draft.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Send</button></form>}</>:<div className="grid flex-1 place-items-center text-sm text-ink-mute">Select a conversation to view messages and actions.</div>}</section>
  </div>
 </div>;
}
