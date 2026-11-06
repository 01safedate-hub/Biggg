-- Student plans: the customer uploads a student ID, pays, and the plan waits in
-- 'pending_review' until staff approve the ID. Approval starts the term that day;
-- rejection cancels the plan and queues a refund for staff to pay out.

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('pending','pending_review','active','past_due','cancelled','expired'));

create table if not exists public.student_verifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  school_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists student_verifications_customer_idx on public.student_verifications (customer_id, created_at desc);
create unique index if not exists student_verifications_one_pending on public.student_verifications (customer_id) where status = 'pending';
alter table public.student_verifications enable row level security;
drop policy if exists student_verifications_read on public.student_verifications;
create policy student_verifications_read on public.student_verifications for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_admin()) or (select private.is_shift_manager()));
revoke insert, update, delete on public.student_verifications from anon, authenticated;
grant select on public.student_verifications to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-ids', 'student-ids', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_ids_insert on storage.objects;
create policy student_ids_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-ids' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists student_ids_read on storage.objects;
create policy student_ids_read on storage.objects for select to authenticated
  using (bucket_id = 'student-ids' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select private.is_admin()) or (select private.is_shift_manager())));

create or replace function private.student_status(_customer uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce((select status from public.student_verifications where customer_id = _customer
                    order by (status = 'approved') desc, created_at desc limit 1), 'none')
$$;
revoke all on function private.student_status(uuid) from public, anon, authenticated;

-- Customer: record the uploaded ID (the file is uploaded to student-ids/<uid>/... first).
create or replace function public.submit_student_verification(_storage_path text, _school_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare _id uuid; _school text := nullif(trim(_school_name), '');
begin
  if auth.uid() is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _school is null or length(_school) < 2 or length(_school) > 120 then raise exception 'school_name_required' using errcode = 'P0001'; end if;
  if _storage_path is null or split_part(_storage_path, '/', 1) <> auth.uid()::text or length(_storage_path) > 300 then
    raise exception 'invalid_upload' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'student-ids' and name = _storage_path) then
    raise exception 'invalid_upload' using errcode = 'P0001';
  end if;
  if private.student_status(auth.uid()) = 'approved' then
    return jsonb_build_object('status', 'approved');
  end if;
  update public.student_verifications set storage_path = _storage_path, school_name = _school, created_at = now()
   where customer_id = auth.uid() and status = 'pending' returning id into _id;
  if _id is null then
    insert into public.student_verifications (customer_id, storage_path, school_name)
    values (auth.uid(), _storage_path, _school) returning id into _id;
  end if;
  return jsonb_build_object('status', 'pending', 'id', _id);
end
$$;
revoke all on function public.submit_student_verification(text, text) from public, anon;
grant execute on function public.submit_student_verification(text, text) to authenticated;

-- Staff: approve or reject. Approval also starts any plan waiting on this ID.
create or replace function public.review_student_verification(_id uuid, _approve boolean, _reason text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v public.student_verifications; s public.subscriptions; inv public.subscription_invoices; pay public.payments;
  _months integer; _end date; _refund_ref text; _started integer := 0; _refunded bigint := 0;
begin
  if not private.is_active() or not (private.is_admin() or private.is_shift_manager()) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into v from public.student_verifications where id = _id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v.status <> 'pending' then raise exception 'already_reviewed' using errcode = 'P0001'; end if;
  if not _approve and length(coalesce(trim(_reason), '')) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;

  update public.student_verifications
     set status = case when _approve then 'approved' else 'rejected' end,
         reject_reason = case when _approve then null else trim(_reason) end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id;

  for s in select * from public.subscriptions where customer_id = v.customer_id and status = 'pending_review' for update loop
    select * into inv from public.subscription_invoices where subscription_id = s.id and status = 'paid'
       and subscription_pickup_id is null order by created_at desc limit 1;
    if _approve then
      _months := case coalesce(inv.billing_period, s.billing_period) when 'three_month' then 3 when 'six_month' then 6 when 'yearly' then 12 else 1 end;
      _end := (current_date + make_interval(months => _months))::date - 1;
      update public.subscriptions
         set status = 'active', started_at = coalesce(started_at, now()),
             current_period_start = (current_date::timestamp at time zone 'Africa/Lagos'),
             current_period_end = ((_end + 1)::timestamp at time zone 'Africa/Lagos'), updated_at = now()
       where id = s.id;
      if inv.id is not null then
        update public.subscription_invoices set period_start = current_date, period_end = _end where id = inv.id;
      end if;
      insert into public.subscription_events(event, detail) values ('subscription_activated',
        jsonb_build_object('subscription_id', s.id, 'customer_id', s.customer_id, 'invoice_id', inv.id, 'after_review', true));
      _started := _started + 1;
    else
      update public.subscriptions set status = 'cancelled', updated_at = now() where id = s.id;
      if inv.id is not null then
        select * into pay from public.payments where invoice_id = inv.id and kind = 'payment' and status = 'success'
         order by paid_at desc nulls last limit 1;
        if pay.id is not null then
          _refund_ref := 'LP-REFUND-' || replace(s.id::text, '-', '') || '-' || encode(extensions.gen_random_bytes(4), 'hex');
          insert into public.payments (invoice_id, customer_id, purpose, kind, mode, amount_kobo, reference, status, money_point_id, note)
          values (inv.id, s.customer_id, 'subscription', 'refund', pay.mode, pay.amount_kobo, _refund_ref, 'pending', pay.money_point_id,
                  'Student ID rejected: refund of ' || pay.reference);
          _refunded := _refunded + pay.amount_kobo;
        end if;
        update public.subscription_invoices set status = 'void' where id = inv.id;
      end if;
      insert into public.subscription_events(event, detail) values ('subscription_id_rejected',
        jsonb_build_object('subscription_id', s.id, 'customer_id', s.customer_id, 'reason', trim(_reason),
                           'refund_kobo', coalesce(pay.amount_kobo, 0), 'refund_reference', _refund_ref));
    end if;
  end loop;

  if not _approve and _started = 0 and _refunded = 0
     and not exists (select 1 from public.subscription_events e where e.event = 'subscription_id_rejected'
                       and e.customer_id = v.customer_id and e.created_at > now() - interval '1 minute') then
    insert into public.subscription_events(event, detail) values ('subscription_id_rejected',
      jsonb_build_object('customer_id', v.customer_id, 'reason', trim(_reason), 'refund_kobo', 0));
  end if;
  return jsonb_build_object('ok', true, 'approved', _approve, 'plans_started', _started, 'refund_kobo', _refunded);
end
$$;
revoke all on function public.review_student_verification(uuid, boolean, text) from public, anon;
grant execute on function public.review_student_verification(uuid, boolean, text) to authenticated;

-- Queued refunds are paid out from the existing Admin > Payments refund list (mark_refund_paid).

-- Buying a student plan needs an uploaded (pending) or approved ID; the next
-- term on a student plan needs an approved one. Wrap the payment-intent RPCs.
do $$
declare _src text;
begin
  select p.prosrc into _src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_subscription_payment_intent'
     and pg_get_function_identity_arguments(p.oid) = '_plan_slug text, _provider text, _billing_period text';
  if position('student_id_required' in _src) > 0 then return; end if;
  _src := replace(_src,
    '  perform private.roll_customer_subscriptions(auth.uid());',
    '  perform private.roll_customer_subscriptions(auth.uid());' || chr(10) ||
    '  if exists (select 1 from public.plans where slug = _plan_slug and requires_student_id) then' || chr(10) ||
    '    if exists (select 1 from public.subscriptions where customer_id = auth.uid() and status = ''active'') then' || chr(10) ||
    '      if private.student_status(auth.uid()) <> ''approved'' then raise exception ''student_id_not_approved'' using errcode = ''P0001''; end if;' || chr(10) ||
    '    elsif private.student_status(auth.uid()) not in (''pending'',''approved'') then' || chr(10) ||
    '      raise exception ''student_id_required'' using errcode = ''P0001'';' || chr(10) ||
    '    end if;' || chr(10) ||
    '  end if;' || chr(10) ||
    '  if exists (select 1 from public.subscriptions where customer_id = auth.uid() and status = ''pending_review'') then' || chr(10) ||
    '    raise exception ''subscription_under_review'' using errcode = ''P0001'';' || chr(10) ||
    '  end if;');
  if position('student_id_required' in _src) = 0 then raise exception 'patch_failed'; end if;
  execute format('create or replace function public.create_subscription_payment_intent(_plan_slug text, _provider text, _billing_period text) returns jsonb language plpgsql security definer set search_path = '''' as %L', _src);
end $$;

-- Settlement: a first payment for a student plan without an approved ID waits for review.
do $$
declare _src text;
begin
  select p.prosrc into _src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'settle_online_payment';
  if position('pending_review' in _src) > 0 then return; end if;
  _src := replace(_src,
    '      elsif _sub.status in (''pending'',''expired'') then',
    '      elsif _sub.status in (''pending'',''expired'')' || chr(10) ||
    '            and exists (select 1 from public.plans p where p.id = coalesce(_invoice.plan_id, _sub.plan_id) and p.requires_student_id)' || chr(10) ||
    '            and private.student_status(_sub.customer_id) <> ''approved'' then' || chr(10) ||
    '        update public.subscriptions set status = ''pending_review'', plan_id = coalesce(_invoice.plan_id, plan_id),' || chr(10) ||
    '               billing_period = coalesce(_invoice.billing_period, billing_period), price_kobo = coalesce(_invoice.monthly_price_kobo, price_kobo),' || chr(10) ||
    '               term_amount_kobo = _invoice.amount_kobo, updated_at = now() where id = _sub.id;' || chr(10) ||
    '        insert into public.subscription_events(event, detail) values (''subscription_pending_review'',' || chr(10) ||
    '          jsonb_build_object(''subscription_id'',_sub.id,''customer_id'',_sub.customer_id,''invoice_id'',_invoice.id));' || chr(10) ||
    '      elsif _sub.status in (''pending'',''expired'') then');
  if position('pending_review' in _src) = 0 then raise exception 'patch_failed_settle'; end if;
  execute format('create or replace function public.settle_online_payment(_reference text, _provider text, _amount_kobo bigint) returns jsonb language plpgsql security definer set search_path = '''' as %L', _src);
end $$;
