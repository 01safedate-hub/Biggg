-- Staff Support Centre foundation. Does not deploy or modify WhatsApp Edge Functions.
create table if not exists public.whatsapp_support_conversations (
  phone text primary key,
  mode text not null default 'ai' check (mode in ('ai','human','resolved')),
  assigned_to uuid references auth.users(id) on delete set null,
  handoff_started_at timestamptz,
  response_due_at timestamptz,
  last_staff_reply_at timestamptz,
  resolved_at timestamptz,
  unread_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.whatsapp_support_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.whatsapp_support_conversations enable row level security;
alter table public.whatsapp_support_permissions enable row level security;
revoke all on public.whatsapp_support_conversations, public.whatsapp_support_permissions from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_support_conversations, public.whatsapp_support_permissions to service_role;

create or replace function public.staff_support_allowed()
returns boolean language sql stable security definer set search_path = ''
as $$
 select auth.uid() is not null and (
   exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role::text in ('super_admin','admin','secretary'))
   or exists(select 1 from public.whatsapp_support_permissions p where p.user_id=auth.uid())
 );
$$;
revoke all on function public.staff_support_allowed() from public, anon;
grant execute on function public.staff_support_allowed() to authenticated;

create or replace function public.staff_support_list(_mode text default 'all')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 -- Import existing open/assigned handoffs into the staff inbox without overwriting a staff decision.
 insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,updated_at)
 select distinct on (h.from_phone) h.from_phone,'human',h.assigned_to,coalesce(h.created_at,now()),coalesce(h.created_at,now())+interval '1 hour',now()
 from public.whatsapp_handoffs h where h.status in ('open','assigned') and h.from_phone is not null
 order by h.from_phone,h.created_at desc
 on conflict(phone) do nothing;
 -- Enforce server-side timeout whenever the support inbox is read.
 update public.whatsapp_support_conversations
 set mode='ai', assigned_to=null, handoff_started_at=null, response_due_at=null, updated_at=now()
 where mode='human' and response_due_at is not null and response_due_at <= now();
 with phones as (
   select distinct m.phone from public.whatsapp_conversation_messages m
   union select h.from_phone from public.whatsapp_handoffs h
   union select c.phone from public.whatsapp_support_conversations c
 ), latest as (
   select distinct on (m.phone) m.phone,m.body,m.direction,m.created_at
   from public.whatsapp_conversation_messages m order by m.phone,m.created_at desc
 ), unread as (
   select m.phone,count(*)::int as unread_count from public.whatsapp_conversation_messages m
   join public.whatsapp_support_conversations c on c.phone=m.phone
   where m.direction='inbound' and (c.last_staff_reply_at is null or m.created_at>c.last_staff_reply_at)
   group by m.phone
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'phone',p.phone,'mode',coalesce(c.mode,'ai'),'assigned_to',c.assigned_to,
   'handoff_started_at',c.handoff_started_at,'response_due_at',c.response_due_at,
   'resolved_at',c.resolved_at,'last_message',l.body,'last_direction',l.direction,
   'last_message_at',l.created_at,'unread_count',coalesce(u.unread_count,0)
 ) order by l.created_at desc nulls last),'[]'::jsonb) into result
 from phones p left join public.whatsapp_support_conversations c on c.phone=p.phone
 left join latest l on l.phone=p.phone left join unread u on u.phone=p.phone
 where _mode='all' or coalesce(c.mode,'ai')=_mode;
 return result;
end;
$$;
revoke all on function public.staff_support_list(text) from public, anon;
grant execute on function public.staff_support_list(text) to authenticated;

create or replace function public.staff_support_history(_phone text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations set unread_at=null,updated_at=now() where phone=_phone;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'direction',direction,'body',body,'created_at',created_at,'delivery_status',delivery_status) order by created_at),'[]'::jsonb)
 into result from public.whatsapp_conversation_messages where phone=_phone;
 return result;
end;
$$;
revoke all on function public.staff_support_history(text) from public, anon;
grant execute on function public.staff_support_history(text) to authenticated;

create or replace function public.staff_support_takeover(_phone text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,resolved_at,updated_at)
 values(_phone,'human',auth.uid(),now(),now()+interval '1 hour',null,now())
 on conflict(phone) do update set mode='human',assigned_to=auth.uid(),handoff_started_at=now(),response_due_at=now()+interval '1 hour',resolved_at=null,updated_at=now();
 update public.whatsapp_handoffs set status='assigned',assigned_to=auth.uid()
 where from_phone=_phone and status in ('open','assigned');
end;
$$;
revoke all on function public.staff_support_takeover(text) from public, anon;
grant execute on function public.staff_support_takeover(text) to authenticated;

create or replace function public.staff_support_return_ai(_phone text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations set mode='ai',assigned_to=null,handoff_started_at=null,response_due_at=null,updated_at=now() where phone=_phone;
 update public.whatsapp_handoffs set status='dismissed' where from_phone=_phone and status in ('open','assigned');
end;
$$;
revoke all on function public.staff_support_return_ai(text) from public, anon;
grant execute on function public.staff_support_return_ai(text) to authenticated;

create or replace function public.staff_support_resolve(_phone text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations set mode='resolved',assigned_to=auth.uid(),resolved_at=now(),response_due_at=null,updated_at=now() where phone=_phone;
 update public.whatsapp_handoffs set status='resolved',assigned_to=auth.uid(),resolved_at=now() where from_phone=_phone and status in ('open','assigned');
end;
$$;
revoke all on function public.staff_support_resolve(text) from public, anon;
grant execute on function public.staff_support_resolve(text) to authenticated;

create or replace function public.staff_support_reply(_phone text,_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare qid uuid; normalized text;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(_body,'')))=0 or length(_body)>3500 then raise exception 'invalid_message'; end if;
 update public.whatsapp_support_conversations
 set mode='human',assigned_to=auth.uid(),last_staff_reply_at=now(),response_due_at=now()+interval '1 hour',updated_at=now()
 where phone=_phone;
 if not found then
   insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,last_staff_reply_at)
   values(_phone,'human',auth.uid(),now(),now()+interval '1 hour',now());
 end if;
 -- Existing outbound worker validates the 24-hour service window via whatsapp_outbox_is_eligible.
 insert into public.whatsapp_outbox(to_phone,event,template,variables,condition,idempotency_key)
 values(_phone,'staff_reply','freeform_text',jsonb_build_object('text_body',trim(_body)), '{}'::jsonb,
        'staff-reply-'||gen_random_uuid()::text)
 returning id into qid;
 insert into public.whatsapp_conversation_messages(phone,direction,body,delivery_status)
 values(_phone,'outbound',trim(_body),'queued');
 return qid;
end;
$$;
revoke all on function public.staff_support_reply(text,text) from public, anon;
grant execute on function public.staff_support_reply(text,text) to authenticated;

create or replace function public.staff_support_grant(_user uuid,_grant boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role::text='super_admin') then raise exception 'super_admin_required' using errcode='42501'; end if;
 if _grant then
   insert into public.whatsapp_support_permissions(user_id,granted_by) values(_user,auth.uid()) on conflict(user_id) do update set granted_by=auth.uid(),created_at=now();
 else delete from public.whatsapp_support_permissions where user_id=_user;
 end if;
end;
$$;
revoke all on function public.staff_support_grant(uuid,boolean) from public, anon;
grant execute on function public.staff_support_grant(uuid,boolean) to authenticated;
