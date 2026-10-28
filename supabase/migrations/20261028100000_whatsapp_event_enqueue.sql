-- Queue claims and send-time eligibility checks for WhatsApp worker.
-- Keep private queue internals inaccessible to anon/authenticated clients.

create or replace function private.whatsapp_reminder_condition(_o public.orders, _event text)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select case _event
    when 'count_reminder' then jsonb_build_object('status', 'counted', 'count_accepted_at', null)
    when 'ready_reminder' then jsonb_build_object('status', 'ready', 'delivered_at', null)
    when 'delivery_payment_reminder' then jsonb_build_object('status', 'awaiting_delivery_fare', 'delivered_at', null)
    when 'rate_reminder' then jsonb_build_object('status', 'delivered', 'rated', false)
    else '{}'::jsonb
  end;
$$;
revoke all on function private.whatsapp_reminder_condition(public.orders,text) from public, anon, authenticated;

create or replace function public.claim_whatsapp_outbox(_limit integer default 50)
returns setof public.whatsapp_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user <> 'service_role' and current_user <> 'postgres' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return query
  with picked as (
    select w.id
    from public.whatsapp_outbox w
    where w.status = 'queued' and w.run_after <= now()
    order by w.run_after, w.created_at
    for update skip locked
    limit greatest(1, least(coalesce(_limit, 50), 50))
  ), claimed as (
    update public.whatsapp_outbox w
       set status = 'processing', attempts = w.attempts, updated_at = now()
      from picked p where p.id = w.id
    returning w.*
  )
  select * from claimed;
end;
$$;
revoke all on function public.claim_whatsapp_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_outbox(integer) to service_role;

create or replace function public.whatsapp_outbox_is_eligible(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare w public.whatsapp_outbox; p public.profiles; o public.orders; st text;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into w from public.whatsapp_outbox where id = _id;
  if not found or w.status <> 'processing' then return false; end if;
  select * into p from public.profiles where id = w.user_id;
  if not found or not p.whatsapp_opt_in or p.whatsapp_opt_out_at is not null then return false; end if;
  if private.normalize_whatsapp_phone(p.phone) is distinct from w.to_phone then return false; end if;
  if w.order_id is null then return true; end if;

  select * into o from public.orders where id = w.order_id;
  if not found then return false; end if;
  if coalesce(w.condition, '{}'::jsonb) = '{}'::jsonb then return true; end if;

  st := w.condition->>'status';
  if st is not null and o.status::text <> st then return false; end if;
  if w.condition ? 'count_accepted_at' and o.count_accepted_at is not null then return false; end if;
  if w.condition ? 'delivered_at' and o.delivered_at is not null and st <> 'delivered' then return false; end if;
  if st = 'delivered' and o.delivered_at is null then return false; end if;
  if coalesce((w.condition->>'rated')::boolean, false) and exists (
    select 1 from public.order_ratings r where r.order_id = o.id
  ) then return false; end if;
  return true;
end;
$$;
revoke all on function public.whatsapp_outbox_is_eligible(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_outbox_is_eligible(uuid) to service_role;

-- Event queueing follows the same status transitions as the current in-app/email trigger.
-- It deliberately does not queue by default unless opt-in is already true.
create or replace function private.enqueue_order_status_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evt text;
  tmpl text;
  vars jsonb;
  due timestamptz := now();
begin
  if new.status is not distinct from old.status then return null; end if;
  evt := case new.status::text
    when 'awaiting_dispatch' then 'pickup_confirmed'
    when 'agent_assigned' then 'agent_assigned'
    when 'agent_arrived' then 'agent_arrived'
    when 'counted' then 'count_ready'
    when 'received' then 'hub_received'
    when 'in_house' then case when new.instant then 'instant_started' else null end
    when 'ready' then 'order_ready'
    when 'out_for_delivery' then case when new.source = 'walk_in' then null else 'rider_assigned' end
    when 'delivered' then 'delivered'
    when 'failed_delivery' then 'delivery_failed'
    else null
  end;
  if evt is null then return null; end if;
  tmpl := evt;
  vars := jsonb_build_object(
    'order_no', new.order_no,
    'status', new.status::text,
    'scheduled_for', new.scheduled_for,
    'instant', new.instant,
    'order_url', 'https://laundrypoint.app/orders/' || new.id::text
  );
  if evt = 'pickup_confirmed' then
    perform private.enqueue_whatsapp(new.customer_id, new.id, evt, tmpl, vars, now(), '{}'::jsonb, 'wa-'||new.id||'-'||evt);
  elsif evt = 'count_ready' then
    perform private.enqueue_whatsapp(new.customer_id, new.id, evt, tmpl, vars, now(), '{}'::jsonb, 'wa-'||new.id||'-'||evt);
    perform private.enqueue_whatsapp(new.customer_id, new.id, 'count_reminder', 'count_reminder',
      jsonb_build_object('template_params', jsonb_build_array(new.order_no::text, 'https://laundrypoint.app/orders/'||new.id::text)),
      now() + interval '2 hours',
      jsonb_build_object('status','counted','count_accepted_at',null),
      'wa-'||new.id||'-count-reminder');
  elsif evt = 'order_ready' then
    perform private.enqueue_whatsapp(new.customer_id, new.id, evt, tmpl, vars, now(), '{}'::jsonb, 'wa-'||new.id||'-'||evt);
    if new.source <> 'walk_in' then
      perform private.enqueue_whatsapp(new.customer_id, new.id, 'ready_reminder_24h', 'ready_reminder',
        jsonb_build_object('template_params', jsonb_build_array(new.order_no::text, '24 hours')),
        now() + interval '24 hours', jsonb_build_object('status','ready','delivered_at',null),
        'wa-'||new.id||'-ready-reminder-24h');
      perform private.enqueue_whatsapp(new.customer_id, new.id, 'ready_reminder_72h', 'ready_reminder',
        jsonb_build_object('template_params', jsonb_build_array(new.order_no::text, '72 hours')),
        now() + interval '72 hours', jsonb_build_object('status','ready','delivered_at',null),
        'wa-'||new.id||'-ready-reminder-72h');
    end if;
  elsif evt = 'delivered' then
    perform private.enqueue_whatsapp(new.customer_id, new.id, evt, tmpl, vars, now(), '{}'::jsonb, 'wa-'||new.id||'-'||evt);
    perform private.enqueue_whatsapp(new.customer_id, new.id, 'rate_reminder', 'rate_reminder',
      jsonb_build_object('template_params', jsonb_build_array(new.order_no::text, 'https://laundrypoint.app/orders/'||new.id::text)),
      now() + interval '2 hours', jsonb_build_object('status','delivered','rated',false),
      'wa-'||new.id||'-rate-reminder');
  else
    perform private.enqueue_whatsapp(new.customer_id, new.id, evt, tmpl, vars, due, '{}'::jsonb, 'wa-'||new.id||'-'||evt);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_whatsapp_outbox on public.orders;
create trigger orders_whatsapp_outbox
after update of status on public.orders
for each row execute function private.enqueue_order_status_whatsapp();

-- Payment receipt uses the successful payment row and is idempotent by payment id.
create or replace function private.enqueue_payment_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare evt text; vars jsonb; onum bigint;
begin
  if new.status <> 'success' or old.status = 'success' then return null; end if;
  if new.order_id is null then return null; end if;
  select order_no into onum from public.orders where id = new.order_id;
  evt := 'payment_receipt';
  vars := jsonb_build_object('template_params', jsonb_build_array(
    onum::text, coalesce(new.purpose,''), to_char(new.amount_kobo / 100.0, 'FM999999990.00')));
  perform private.enqueue_whatsapp(new.customer_id, new.order_id, evt, evt, vars, now(), '{}'::jsonb,
    'wa-payment-' || new.id::text);
  if new.purpose = 'delivery_fare' then
    perform private.enqueue_whatsapp(new.customer_id, new.order_id, 'delivery_payment_reminder', 'delivery_payment_reminder',
      jsonb_build_object('template_params', jsonb_build_array(onum::text)),
      now() + interval '15 minutes', jsonb_build_object('status','awaiting_delivery_fare','delivered_at',null),
      'wa-'||new.order_id||'-delivery-payment-reminder');
  end if;
  return null;
end;
$$;

drop trigger if exists payments_whatsapp_outbox on public.payments;
create trigger payments_whatsapp_outbox
after update of status on public.payments
for each row execute function private.enqueue_payment_whatsapp();

-- Stains are a separate event: insert after flag_stain records the photo and notice.
create or replace function private.enqueue_stain_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare onum bigint; item_name text;
begin
  if new.kind <> 'stain' then return null; end if;
  select order_no into onum from public.orders where id = new.order_id;
  select name into item_name from public.order_items where id = new.order_item_id;
  perform private.enqueue_whatsapp(
    (select customer_id from public.orders where id = new.order_id),
    new.order_id, 'stain_notice', 'stain_notice',
    jsonb_build_object('template_params', jsonb_build_array(onum::text, coalesce(item_name,new.note,'item'),
      'https://laundrypoint.app/orders/'||new.order_id::text)),
    now(), '{}'::jsonb, 'wa-stain-'||new.id::text
  );
  return null;
end;
$$;

drop trigger if exists order_photos_whatsapp_outbox on public.order_photos;
create trigger order_photos_whatsapp_outbox
after insert on public.order_photos
for each row execute function private.enqueue_stain_whatsapp();

-- Every helper inserts into the private outbox; all provider calls are performed by Edge Functions.
