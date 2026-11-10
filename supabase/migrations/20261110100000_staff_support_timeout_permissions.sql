-- Tighten support access and enforce one-hour handover expiry.
create or replace function public.staff_support_allowed()
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null and (
   exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role::text in ('super_admin','admin'))
   or exists(select 1 from public.whatsapp_support_permissions p where p.user_id=auth.uid())
 );
$$;
create or replace function public.expire_staff_support_handoffs()
returns integer language plpgsql security definer set search_path=''
as $$
declare affected integer;
begin
 update public.whatsapp_support_conversations
 set mode='ai',assigned_to=null,handoff_started_at=null,response_due_at=null,updated_at=now()
 where mode='human' and response_due_at is not null and response_due_at <= now()
   and (last_staff_reply_at is null or last_staff_reply_at < response_due_at - interval '1 hour');
 get diagnostics affected = row_count;
 return affected;
end;
$$;
do $$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
   perform cron.unschedule(jobid) from cron.job where jobname='expire-staff-support-handoffs';
   perform cron.schedule('expire-staff-support-handoffs','* * * * *','select public.expire_staff_support_handoffs();');
 end if;
end $$;
revoke all on function public.expire_staff_support_handoffs() from public, anon, authenticated;
grant execute on function public.expire_staff_support_handoffs() to service_role;
create or replace function public.staff_support_takeover(_phone text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,resolved_at,last_staff_reply_at,updated_at)
 values(_phone,'human',auth.uid(),now(),now()+interval '1 hour',null,null,now())
 on conflict(phone) do update set mode='human',assigned_to=auth.uid(),handoff_started_at=now(),response_due_at=now()+interval '1 hour',resolved_at=null,last_staff_reply_at=null,updated_at=now();
 update public.whatsapp_handoffs set status='assigned',assigned_to=auth.uid() where from_phone=_phone and status in ('open','assigned');
end;
$$;
create or replace function public.staff_support_reply(_phone text, _body text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare qid uuid;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(_body,'')))=0 or length(_body)>3500 then raise exception 'invalid_message'; end if;
 insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,last_staff_reply_at,updated_at)
 values(_phone,'human',auth.uid(),now(),now()+interval '1 hour',now(),now())
 on conflict(phone) do update set mode='human',assigned_to=auth.uid(),last_staff_reply_at=now(),response_due_at=now()+interval '1 hour',updated_at=now();
 insert into public.whatsapp_outbox(to_phone,event,template,variables,condition,idempotency_key)
 values(_phone,'staff_reply','freeform_text',jsonb_build_object('text_body',trim(_body)), '{}'::jsonb,'staff-reply-'||gen_random_uuid()::text) returning id into qid;
 insert into public.whatsapp_conversation_messages(phone,direction,body,delivery_status) values(_phone,'outbound',trim(_body),'queued');
 return qid;
end;
$$;
create or replace function public.staff_support_resolve(_phone text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 update public.whatsapp_support_conversations set mode='resolved',assigned_to=auth.uid(),resolved_at=now(),response_due_at=null,updated_at=now() where phone=_phone;
 update public.whatsapp_handoffs set status='resolved',assigned_to=auth.uid(),resolved_at=now() where from_phone=_phone and status in ('open','assigned');
end;
$$;
create or replace function public.staff_support_grant(_user uuid, _grant boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role::text='super_admin') then raise exception 'super_admin_required' using errcode='42501'; end if;
 if _grant then insert into public.whatsapp_support_permissions(user_id,granted_by) values(_user,auth.uid()) on conflict(user_id) do update set granted_by=auth.uid(),created_at=now();
 else delete from public.whatsapp_support_permissions where user_id=_user; end if;
end;
$$;