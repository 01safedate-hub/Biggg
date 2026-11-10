create or replace function public.staff_support_reply(_phone text, _body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare qid uuid; customer uuid; normalized_phone text;
begin
 if not public.staff_support_allowed() then raise exception 'support_access_denied' using errcode='42501'; end if;
 if length(trim(coalesce(_body,'')))=0 or length(_body)>3500 then raise exception 'invalid_message'; end if;
 normalized_phone := private.normalize_whatsapp_phone(_phone);
 select p.id into customer
 from public.whatsapp_account_verifications v
 join public.profiles p on p.id=v.customer_id
 where private.normalize_whatsapp_phone(v.phone)=normalized_phone
   and p.whatsapp_opt_in is true and p.whatsapp_opt_out_at is null
 order by v.verified_until desc nulls last
 limit 1;
 if customer is null then raise exception 'verified_customer_or_whatsapp_consent_not_found'; end if;
 insert into public.whatsapp_support_conversations(phone,mode,assigned_to,handoff_started_at,response_due_at,last_staff_reply_at,updated_at)
 values(_phone,'human',auth.uid(),now(),null,now(),now())
 on conflict(phone) do update set mode='human',assigned_to=auth.uid(),last_staff_reply_at=now(),response_due_at=null,updated_at=now();
 insert into public.whatsapp_outbox(user_id,to_phone,event,template,variables,condition,idempotency_key)
 values(customer,normalized_phone,'staff_reply','freeform_text',jsonb_build_object('text_body',trim(_body)), '{}'::jsonb,'staff-reply-'||gen_random_uuid()::text)
 returning id into qid;
 insert into public.whatsapp_conversation_messages(phone,direction,body,delivery_status)
 values(_phone,'outbound',trim(_body),'queued');
 perform public.invoke_whatsapp_worker();
 return qid;
end;
$function$;

create or replace function public.whatsapp_outbox_is_eligible(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare w public.whatsapp_outbox; p public.profiles; o public.orders; st text; verified_phone text;
begin
 select * into w from public.whatsapp_outbox where id=_id;
 if not found or w.status<>'processing' then return false; end if;
 select * into p from public.profiles where id=w.user_id;
 if not found or not p.whatsapp_opt_in or p.whatsapp_opt_out_at is not null then return false; end if;
 if private.normalize_whatsapp_phone(p.phone) is distinct from w.to_phone then
   select v.phone into verified_phone
   from public.whatsapp_account_verifications v
   where v.customer_id=p.id
     and private.normalize_whatsapp_phone(v.phone)=w.to_phone
   order by v.verified_until desc nulls last
   limit 1;
   if verified_phone is null then return false; end if;
 end if;
 if w.order_id is null then return true; end if;
 select * into o from public.orders where id=w.order_id;
 if not found then return false; end if;
 if coalesce(w.condition,'{}'::jsonb)='{}'::jsonb then return true; end if;
 st:=w.condition->>'status';
 if st is not null and o.status::text<>st then return false; end if;
 if w.condition ? 'count_accepted_at' and o.count_accepted_at is not null then return false; end if;
 if w.condition ? 'delivered_at' and o.delivered_at is not null and st<>'delivered' then return false; end if;
 if st='delivered' and o.delivered_at is null then return false; end if;
 if w.condition ? 'rated' and exists(select 1 from public.order_ratings r where r.order_id=o.id) then return false; end if;
 return true;
end;
$function$;
