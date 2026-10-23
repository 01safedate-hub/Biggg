-- Applied via apply_migration: disputes_and_weak_spots
-- ===== bank disputes (chargebacks) =====
create table if not exists public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  order_id uuid not null references public.orders (id),
  provider text not null check (provider in ('paystack','flutterwave','bank','other')),
  external_ref text,
  amount_kobo bigint not null check (amount_kobo > 0),
  reason text not null check (length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open','evidence_sent','won','lost')),
  due_at timestamptz,
  evidence_note text,
  evidence_sent_at timestamptz,
  resolution_note text,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  opened_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index if not exists payment_disputes_live_idx on public.payment_disputes (payment_id) where status in ('open','evidence_sent');
create index if not exists payment_disputes_order_idx on public.payment_disputes (order_id);
alter table public.payment_disputes enable row level security;
create policy payment_disputes_read on public.payment_disputes for select to authenticated using ((select private.is_super_admin()));
revoke all on public.payment_disputes from anon;

create or replace function private.has_open_dispute(_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payment_disputes d where d.order_id = _order and d.status in ('open','evidence_sent'))
$$;

-- an order whose payment is under dispute keeps its clothes until the dispute is settled
create or replace function private.held_until(_order uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when private.has_open_dispute(_order) then 'infinity'::timestamptz else greatest(
    (select c.promised_for from public.contact_log c
      where c.order_id = _order and c.outcome = 'rescheduled' and c.promised_for is not null
        and c.created_at > coalesce(private.failure_at(_order), '-infinity'::timestamptz)
      order by c.created_at desc limit 1),
    (select o.scheduled_for from public.orders o where o.id = _order and o.status = 'awaiting_dispatch')) end
$$;

create or replace function public.assign_delivery_agent(_order uuid, _agent uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _cust uuid;
begin
  if not private.is_shift_manager() or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id where r.user_id = _agent and r.role = 'delivery_agent' and p.status = 'active') then
    raise exception 'agent_invalid' using errcode = 'P0001';
  end if;
  if private.has_open_dispute(_order) then raise exception 'dispute_open' using errcode = 'P0001'; end if;
  update public.orders set delivery_agent_id = _agent where id = _order and status = 'out_for_delivery' returning customer_id into _cust;
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  insert into public.user_notifications (user_id, title, kind, order_id) values (_agent, 'New delivery assigned to you', 'job', _order);
  insert into public.user_notifications (user_id, title, kind, order_id) values (_cust, 'Your delivery agent is on the way', 'order_status', _order);
end $$;

-- called by the payment webhooks (service role only)
create or replace function public.record_dispute_from_provider(_reference text, _provider text, _external text, _reason text, _due timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare _p public.payments; _id uuid; _s uuid;
begin
  if _provider not in ('paystack','flutterwave') then raise exception 'invalid_provider' using errcode = 'P0001'; end if;
  select * into _p from public.payments where reference = _reference and kind = 'payment' and status = 'success';
  if not found then return null; end if;
  insert into public.payment_disputes (payment_id, order_id, provider, external_ref, amount_kobo, reason, due_at)
  values (_p.id, _p.order_id, _provider, left(_external, 100), _p.amount_kobo, left(coalesce(nullif(trim(_reason), ''), 'Customer disputed the charge with their bank'), 500), _due)
  on conflict (payment_id) where status in ('open','evidence_sent') do nothing
  returning id into _id;
  if _id is not null then
    insert into public.order_events (order_id, event, detail) values (_p.order_id, 'dispute_opened', jsonb_build_object('dispute_id', _id, 'provider', _provider));
    for _s in select user_id from public.user_roles where role = 'super_admin' loop
      insert into public.user_notifications (user_id, title, body, kind, order_id) values (_s, 'A customer disputed a payment', 'Respond before ' || coalesce(to_char(_due at time zone 'Africa/Lagos', 'DD Mon'), 'the deadline') || '. The clothes are on hold.', 'dispute', _p.order_id);
    end loop;
  end if;
  return _id;
end $$;
revoke execute on function public.record_dispute_from_provider(text,text,text,text,timestamptz) from public, anon, authenticated;

create or replace function public.open_dispute(_payment uuid, _reason text, _due date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare _p public.payments; _id uuid;
begin
  perform private.require_super_admin();
  select * into _p from public.payments where id = _payment and kind = 'payment' and status = 'success' and mode in ('paystack','flutterwave');
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_reason, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payment_disputes where payment_id = _payment and status in ('open','evidence_sent')) then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  insert into public.payment_disputes (payment_id, order_id, provider, amount_kobo, reason, due_at, opened_by)
  values (_payment, _p.order_id, _p.mode, _p.amount_kobo, left(trim(_reason), 500), case when _due is null then null else (_due + 1)::timestamp at time zone 'Africa/Lagos' - interval '1 second' end, auth.uid()) returning id into _id;
  insert into public.order_events (order_id, actor_id, event, detail) values (_p.order_id, auth.uid(), 'dispute_opened', jsonb_build_object('dispute_id', _id, 'provider', _p.mode));
  return _id;
end $$;

-- everything the system knows that helps prove the customer received what they paid for
create or replace function public.dispute_evidence(_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _d public.payment_disputes; _o public.orders; _p public.payments;
begin
  perform private.require_super_admin();
  select * into _d from public.payment_disputes where id = _id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _d.order_id;
  select * into _p from public.payments where id = _d.payment_id;
  return jsonb_build_object(
    'dispute', to_jsonb(_d),
    'payment', jsonb_build_object('reference', _p.reference, 'mode', _p.mode, 'purpose', _p.purpose, 'amount_kobo', _p.amount_kobo, 'paid_at', _p.paid_at),
    'order', jsonb_build_object('order_no', _o.order_no, 'source', _o.source, 'status', _o.status, 'created_at', _o.created_at, 'address', _o.pickup_address, 'delivered_at', _o.delivered_at, 'items_total_kobo', _o.items_total_kobo, 'discount_kobo', _o.discount_kobo),
    'customer', (select jsonb_build_object('name', c.full_name, 'email', c.email, 'phone', c.phone, 'member_since', c.created_at, 'earlier_orders', (select count(*) from public.orders x where x.customer_id = c.id and x.id <> _o.id and x.status in ('delivered','closed'))) from public.profiles c where c.id = _o.customer_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'line_total_kobo', i.line_total_kobo) order by i.created_at) from public.order_items i where i.order_id = _o.id and i.removed_at is null), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('at', e.created_at, 'event', e.event, 'detail', e.detail) order by e.created_at) from public.order_events e where e.order_id = _o.id and e.event in ('status','rescheduled','contact_logged','auto_assigned','auto_reassigned','pickup_failed','issue_reported')), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('step', k.step, 'verified_at', k.verified_at, 'issued_at', k.issued_at) order by k.issued_at) from public.order_codes k where k.order_id = _o.id), '[]'::jsonb),
    'delivery_attempts', coalesce((select jsonb_agg(jsonb_build_object('at', a.created_at, 'outcome', a.outcome, 'note', a.note) order by a.created_at) from public.delivery_attempts a where a.order_id = _o.id), '[]'::jsonb),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('at', l.created_at, 'outcome', l.outcome, 'note', l.note) order by l.created_at) from public.contact_log l where l.order_id = _o.id), '[]'::jsonb),
    'rating', (select jsonb_build_object('stars', r.stars, 'comment', r.comment) from public.order_ratings r where r.order_id = _o.id),
    'issues', coalesce((select jsonb_agg(jsonb_build_object('kind', s.kind, 'status', s.status, 'description', s.description)) from public.order_issues s where s.order_id = _o.id), '[]'::jsonb));
end $$;

create or replace function public.mark_dispute_evidence_sent(_id uuid, _note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  update public.payment_disputes set status = 'evidence_sent', evidence_note = left(trim(_note), 1000), evidence_sent_at = now() where id = _id and status = 'open';
  if not found then raise exception 'wrong_state' using errcode = 'P0001'; end if;
end $$;

-- lost: the provider has taken the money back, so the books show a refund out of the same money point
create or replace function public.resolve_dispute(_id uuid, _outcome text, _note text) returns void
language plpgsql security definer set search_path = '' as $$
declare _d public.payment_disputes; _p public.payments; _o public.orders;
begin
  perform private.require_super_admin();
  if _outcome not in ('won','lost') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  select * into _d from public.payment_disputes where id = _id for update;
  if not found or _d.status not in ('open','evidence_sent') then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  select * into _p from public.payments where id = _d.payment_id;
  select * into _o from public.orders where id = _d.order_id;
  if _outcome = 'lost' then
    insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note, recorded_by)
    values (_p.order_id, _p.customer_id, _p.purpose, 'refund', _p.mode, _d.amount_kobo, 'CB-' || _o.order_no || '-' || encode(extensions.gen_random_bytes(4), 'hex'), 'success', _p.money_point_id, 'Chargeback lost: ' || trim(_note), auth.uid());
  end if;
  update public.payment_disputes set status = _outcome, resolution_note = left(trim(_note), 1000), resolved_by = auth.uid(), resolved_at = now() where id = _id;
  insert into public.order_events (order_id, actor_id, event, detail) values (_d.order_id, auth.uid(), 'dispute_' || _outcome, jsonb_build_object('dispute_id', _id));
end $$;
revoke execute on function public.open_dispute(uuid,text,date), public.dispute_evidence(uuid), public.mark_dispute_evidence_sent(uuid,text), public.resolve_dispute(uuid,text,text) from public, anon;
grant execute on function public.open_dispute(uuid,text,date), public.dispute_evidence(uuid), public.mark_dispute_evidence_sent(uuid,text), public.resolve_dispute(uuid,text,text) to authenticated;

-- ===== weak spot: shifts can only be removed before they start and when nobody has checked in =====
alter policy shifts_delete on public.shifts using ((select private.is_shift_manager()) and starts_at > now() and not exists (select 1 from public.attendance a where a.shift_id = shifts.id));

-- ===== weak spot: a customer can take a discount code off =====
alter table public.promo_redemptions add column if not exists released_at timestamptz;

create or replace function public.apply_promo(_order uuid, _code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _o public.orders; _p public.promo_codes; _c text := upper(trim(coalesce(_code, ''))); _red public.promo_redemptions;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.customer_id <> auth.uid() then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status not in ('agent_arrived', 'counted') or _o.source = 'subscription' then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  if _o.promo_code_id is not null then raise exception 'promo_already_applied' using errcode = 'P0001'; end if;
  select * into _p from public.promo_codes where upper(code) = _c for update;
  if not found or not _p.active or (_p.expires_at is not null and _p.expires_at < now()) or (_p.max_uses is not null and _p.uses >= _p.max_uses) then
    raise exception 'promo_invalid' using errcode = 'P0001';
  end if;
  select * into _red from public.promo_redemptions where code_id = _p.id and customer_id = auth.uid() order by created_at desc limit 1;
  if found and _red.released_at is null then raise exception 'promo_used' using errcode = 'P0001'; end if;
  if found then
    update public.promo_redemptions set released_at = null, order_id = _order where id = _red.id;
  else
    insert into public.promo_redemptions (code_id, customer_id, order_id) values (_p.id, auth.uid(), _order);
  end if;
  update public.promo_codes set uses = uses + 1 where id = _p.id;
  update public.orders set promo_code_id = _p.id, discount_kobo = floor(items_total_kobo * _p.percent / 100.0)::bigint where id = _order;
  return jsonb_build_object('percent', _p.percent);
end $$;

create or replace function public.remove_promo(_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found or _o.customer_id <> auth.uid() then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if _o.status not in ('agent_arrived', 'counted') or _o.promo_code_id is null then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  update public.promo_redemptions set released_at = now() where code_id = _o.promo_code_id and customer_id = auth.uid() and order_id = _order and released_at is null;
  update public.promo_codes set uses = greatest(0, uses - 1) where id = _o.promo_code_id;
  update public.orders set promo_code_id = null, discount_kobo = 0 where id = _order;
end $$;
revoke execute on function public.remove_promo(uuid) from public, anon;
grant execute on function public.remove_promo(uuid) to authenticated;
