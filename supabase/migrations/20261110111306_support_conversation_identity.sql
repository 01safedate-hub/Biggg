-- Conversation identity is independent of a WhatsApp phone number.
alter table public.whatsapp_support_conversations
  add column if not exists id uuid default gen_random_uuid();
update public.whatsapp_support_conversations set id=gen_random_uuid() where id is null;
alter table public.whatsapp_support_conversations alter column id set default gen_random_uuid();
alter table public.whatsapp_support_conversations alter column id set not null;
do $$
declare pk text;
begin
  select conname into pk from pg_constraint
  where conrelid='public.whatsapp_support_conversations'::regclass and contype='p';
  if pk is not null then execute format('alter table public.whatsapp_support_conversations drop constraint %I',pk); end if;
  alter table public.whatsapp_support_conversations add constraint whatsapp_support_conversations_pkey primary key(id);
end $$;
create index if not exists whatsapp_support_conversations_phone_created_idx
  on public.whatsapp_support_conversations(phone,created_at desc);
alter table public.whatsapp_conversation_messages
  add column if not exists conversation_id uuid;
-- Preserve existing message history by attaching it to the pre-migration conversation for that phone.
update public.whatsapp_conversation_messages m
set conversation_id=c.id
from public.whatsapp_support_conversations c
where m.conversation_id is null and m.phone=c.phone;
alter table public.whatsapp_conversation_messages
  add constraint whatsapp_conversation_messages_conversation_id_fkey
  foreign key(conversation_id) references public.whatsapp_support_conversations(id) on delete set null;
create index if not exists whatsapp_conversation_messages_conversation_created_idx
  on public.whatsapp_conversation_messages(conversation_id,created_at asc);

create or replace function public.whatsapp_active_support_conversation(_phone text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_phone text:=_phone;
begin
  if v_phone is null or length(trim(v_phone))=0 then raise exception 'invalid_phone'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_phone,0));
  select id into v_id from public.whatsapp_support_conversations
    where phone=v_phone and mode<>'resolved'
    order by created_at desc,updated_at desc limit 1;
  if v_id is null then
    insert into public.whatsapp_support_conversations(phone,mode,updated_at)
    values(v_phone,'ai',now()) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.whatsapp_active_support_conversation(text) from public,anon,authenticated;
grant execute on function public.whatsapp_active_support_conversation(text) to service_role;

create or replace function public.staff_support_list(_mode text default 'all')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,updated_at)
 select distinct on (h.from_phone) h.from_phone,'human',h.assigned_to,coalesce(h.created_at,now()),coalesce(h.created_at,now())+interval '1 hour',now()
 from public.whatsapp_handoffs h
 where h.status in ('open','assigned') and h.from_phone is not null
 and not exists(select 1 from public.whatsapp_support_conversations c where c.phone=h.from_phone and c.mode<>'resolved')
 order by h.from_phone,h.created_at desc;
 update public.whatsapp_support_conversations set mode='ai',assigned_to=null,handoff_started_at=null,response_due_at=null,updated_at=now()
 where mode='human' and response_due_at is not null and response_due_at<=now() and last_staff_reply_at is null;
 with latest as (
   select distinct on (m.conversation_id) m.conversation_id,m.body,m.direction,m.created_at
   from public.whatsapp_conversation_messages m
   where m.conversation_id is not null
   order by m.conversation_id,m.created_at desc
 ), unread as (
   select m.conversation_id,count(*)::int unread_count
   from public.whatsapp_conversation_messages m
   join public.whatsapp_support_conversations c on c.id=m.conversation_id
   where m.direction='inbound' and c.unread_at is not null and m.created_at>=c.unread_at
   group by m.conversation_id
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
 into result
 from public.whatsapp_support_conversations c
 left join latest l on l.conversation_id=c.id
 left join unread u on u.conversation_id=c.id
 left join customer cu on cu.normalized_phone=private.normalize_whatsapp_phone(c.phone)
 where _mode='all' or c.mode=_mode;
 return result;
end $$;

create or replace function public.staff_support_history(_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations set unread_at=null,updated_at=now() where id=_conversation_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'direction',direction,'body',body,'created_at',created_at,'delivery_status',delivery_status) order by created_at),'[]'::jsonb)
 into result from public.whatsapp_conversation_messages where conversation_id=_conversation_id;
 return result;
end $$;

create or replace function public.staff_support_takeover(_conversation_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_phone text;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations
 set mode='human',assigned_to=auth.uid(),handoff_started_at=now(),response_due_at=now()+interval '1 hour',
     resolved_at=null,last_staff_reply_at=null,updated_at=now()
 where id=_conversation_id and mode<>'resolved' returning phone into v_phone;
 if v_phone is null then raise exception 'conversation_not_active'; end if;
 update public.whatsapp_handoffs set status='assigned',assigned_to=auth.uid()
 where from_phone=v_phone and status in ('open','assigned');
end $$;

create or replace function public.staff_support_return_ai(_conversation_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_phone text;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations
 set mode='ai',assigned_to=null,handoff_started_at=null,response_due_at=null,updated_at=now()
 where id=_conversation_id and mode<>'resolved' returning phone into v_phone;
 if v_phone is null then raise exception 'conversation_not_active'; end if;
 update public.whatsapp_handoffs set status='dismissed'
 where from_phone=v_phone and status in ('open','assigned');
end $$;

create or replace function public.staff_support_reply(_conversation_id uuid,_body text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare qid uuid; customer uuid; normalized_phone text; v_phone text;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(_body,'')))=0 or length(_body)>3500 then raise exception 'invalid_message'; end if;
 select phone into v_phone from public.whatsapp_support_conversations where id=_conversation_id and mode<>'resolved' for update;
 if v_phone is null then raise exception 'conversation_not_active'; end if;
 normalized_phone:=private.normalize_whatsapp_phone(v_phone);
 select p.id into customer from public.whatsapp_account_verifications v join public.profiles p on p.id=v.customer_id
 where private.normalize_whatsapp_phone(v.phone)=normalized_phone and p.whatsapp_opt_in is true and p.whatsapp_opt_out_at is null
 order by v.verified_until desc nulls last limit 1;
 if customer is null then raise exception 'verified_customer_or_whatsapp_consent_not_found'; end if;
 update public.whatsapp_support_conversations
 set mode='human',assigned_to=auth.uid(),last_staff_reply_at=now(),response_due_at=null,updated_at=now()
 where id=_conversation_id;
 insert into public.whatsapp_outbox(user_id,to_phone,event,template,variables,condition,idempotency_key)
 values(customer,normalized_phone,'staff_reply','freeform_text',jsonb_build_object('text_body',trim(_body)), '{}'::jsonb,'staff-reply-'||gen_random_uuid()::text)
 returning id into qid;
 insert into public.whatsapp_conversation_messages(phone,conversation_id,direction,body,delivery_status)
 values(v_phone,_conversation_id,'outbound',trim(_body),'queued');
 perform public.invoke_whatsapp_worker();
 return qid;
end $$;

create or replace function public.staff_support_resolve(_conversation_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_phone text; v_user_id uuid; v_to_phone text;
_notice text:='Your LaundryPoint support conversation has been marked as resolved. If you need more help, simply send us another message here.';
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations
 set mode='resolved',assigned_to=auth.uid(),resolved_at=now(),response_due_at=null,updated_at=now()
 where id=_conversation_id and mode<>'resolved' returning phone into v_phone;
 if v_phone is null then raise exception 'conversation_already_resolved'; end if;
 update public.whatsapp_handoffs set status='resolved',assigned_to=auth.uid(),resolved_at=now()
 where from_phone=v_phone and status in ('open','assigned');
 v_to_phone:=private.normalize_whatsapp_phone(v_phone);
 select p.id into v_user_id from public.whatsapp_account_verifications v join public.profiles p on p.id=v.customer_id
 where private.normalize_whatsapp_phone(v.phone)=v_to_phone and v.customer_id is not null
 and p.whatsapp_opt_in is true and p.whatsapp_opt_out_at is null
 order by v.verified_until desc nulls last,v.updated_at desc limit 1;
 if v_user_id is not null and exists(
   select 1 from public.whatsapp_conversation_messages m
   where m.conversation_id=_conversation_id and m.direction='inbound' and m.created_at>=now()-interval '24 hours'
 ) then
   insert into public.whatsapp_outbox(user_id,to_phone,event,template,variables,status,condition,idempotency_key,run_after)
   values(v_user_id,v_to_phone,'support_resolved','support_resolved',jsonb_build_object('text_body',_notice),'queued','{}'::jsonb,
   'support-resolved:'||v_to_phone||':'||txid_current()::text,now())
   on conflict(idempotency_key) do nothing;
   insert into public.whatsapp_conversation_messages(phone,conversation_id,direction,body,delivery_status)
   select v_phone,_conversation_id,'outbound',_notice,'queued'
   where exists(select 1 from public.whatsapp_outbox o where o.idempotency_key='support-resolved:'||v_to_phone||':'||txid_current()::text);
 end if;
end $$;

-- Older phone-based RPC overloads remain available for backwards compatibility.
