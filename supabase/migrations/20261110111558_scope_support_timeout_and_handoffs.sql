-- Make legacy handoff recovery conversation-specific; never update a resolved historical row.
create or replace function public.expire_staff_support_handoffs()
returns integer language plpgsql security definer set search_path=''
as $$
declare r record; affected integer:=0;
msg text:='A support teammate was not available to reply within one hour, so I have resumed as your LaundryPoint AI assistant. Please tell me how I can help.';
begin
 for r in
   update public.whatsapp_support_conversations
   set mode='ai',assigned_to=null,handoff_started_at=null,response_due_at=null,updated_at=now()
   where mode='human' and response_due_at is not null and response_due_at<=now()
     and last_staff_reply_at is null
   returning id,phone
 loop
   insert into public.whatsapp_outbox(to_phone,event,template,variables,condition,idempotency_key)
   values(private.normalize_whatsapp_phone(r.phone),'support_timeout_resume','freeform_text',
     jsonb_build_object('text_body',msg),'{}'::jsonb,
     'support-timeout-'||r.id::text);
   insert into public.whatsapp_conversation_messages(phone,conversation_id,direction,body,delivery_status)
   values(r.phone,r.id,'outbound',msg,'queued');
   affected:=affected+1;
 end loop;
 return affected;
end $$;

-- Reconcile any open handoff onto the current non-resolved conversation.
create or replace function public.staff_support_list(_mode text default 'all')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations c
 set mode='human',assigned_to=h.assigned_to,
     handoff_started_at=coalesce(c.handoff_started_at,h.created_at,now()),
     response_due_at=coalesce(c.response_due_at,h.created_at+interval '1 hour',now()+interval '1 hour'),
     updated_at=now()
 from (
   select distinct on (from_phone) from_phone,assigned_to,created_at
   from public.whatsapp_handoffs where status in ('open','assigned') and from_phone is not null
   order by from_phone,created_at desc
 ) h
 where c.phone=h.from_phone and c.mode<>'resolved'
   and c.id=(select c2.id from public.whatsapp_support_conversations c2 where c2.phone=c.phone and c2.mode<>'resolved' order by c2.created_at desc limit 1)
   and c.mode='ai';
 insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,updated_at)
 select h.from_phone,'human',h.assigned_to,coalesce(h.created_at,now()),coalesce(h.created_at,now())+interval '1 hour',now()
 from (
   select distinct on (from_phone) from_phone,assigned_to,created_at
   from public.whatsapp_handoffs where status in ('open','assigned') and from_phone is not null
   order by from_phone,created_at desc
 ) h
 where not exists(select 1 from public.whatsapp_support_conversations c where c.phone=h.from_phone and c.mode<>'resolved');
 update public.whatsapp_support_conversations set mode='ai',assigned_to=null,handoff_started_at=null,response_due_at=null,updated_at=now()
 where mode='human' and response_due_at is not null and response_due_at<=now() and last_staff_reply_at is null;
 with latest as (
   select distinct on (m.conversation_id) m.conversation_id,m.body,m.direction,m.created_at
   from public.whatsapp_conversation_messages m where m.conversation_id is not null
   order by m.conversation_id,m.created_at desc
 ), unread as (
   select m.conversation_id,count(*)::int unread_count
   from public.whatsapp_conversation_messages m join public.whatsapp_support_conversations c on c.id=m.conversation_id
   where m.direction='inbound' and c.unread_at is not null and m.created_at>=c.unread_at group by m.conversation_id
 ), customer as (
   select distinct on (private.normalize_whatsapp_phone(v.phone))
     private.normalize_whatsapp_phone(v.phone) normalized_phone,p.full_name
   from public.whatsapp_account_verifications v join public.profiles p on p.id=v.customer_id
   where v.customer_id is not null and p.full_name is not null and trim(p.full_name)<>''
   order by private.normalize_whatsapp_phone(v.phone),v.updated_at desc
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'phone',c.phone,'customer_name',cu.full_name,'mode',c.mode,'assigned_to',c.assigned_to,
   'handoff_started_at',c.handoff_started_at,'response_due_at',c.response_due_at,'resolved_at',c.resolved_at,
   'last_message',l.body,'last_direction',l.direction,'last_message_at',l.created_at,'unread_count',coalesce(u.unread_count,0)
 ) order by coalesce(l.created_at,c.created_at) desc),'[]'::jsonb)
 into result from public.whatsapp_support_conversations c
 left join latest l on l.conversation_id=c.id left join unread u on u.conversation_id=c.id
 left join customer cu on cu.normalized_phone=private.normalize_whatsapp_phone(c.phone)
 where _mode='all' or c.mode=_mode;
 return result;
end $$;
