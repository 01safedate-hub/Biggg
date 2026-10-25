-- 1) verify_staff now emails the staff member (verified, or changes requested).
create or replace function public.verify_staff(_user uuid, _approve boolean, _note text) returns void language plpgsql security definer set search_path = '' as $$
declare _email text; _name text;
begin
  perform private.require_super_admin();
  if not exists (select 1 from public.staff_profiles where user_id = _user) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _approve then
    if not private.profile_complete(_user) then raise exception 'profile_incomplete' using errcode = 'P0001'; end if;
    update public.staff_profiles set onboarding_status = 'verified', verified_by = auth.uid(), verified_at = now(), review_note = null where user_id = _user;
  else
    if length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
    update public.staff_profiles set onboarding_status = 'rejected', review_note = trim(_note), verified_by = null, verified_at = null where user_id = _user;
  end if;
  select u.email, coalesce(p.full_name, '') into _email, _name from auth.users u left join public.profiles p on p.id = u.id where u.id = _user;
  if _email is not null then
    insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
    values (_user, _email, 'staff_review', jsonb_build_object('approved', _approve, 'note', case when _approve then null else trim(_note) end, 'name', _name),
            'staff-review-' || _user || '-' || extract(epoch from clock_timestamp())::bigint)
    on conflict (idempotency_key) do nothing;
  end if;
end $$;

-- 2) Test email to the signed-in super admin, to prove Resend works.
create or replace function public.send_test_email() returns void language plpgsql security definer set search_path = '' as $$
declare _email text;
begin
  perform private.require_super_admin();
  select email into _email from auth.users where id = auth.uid();
  if _email is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.email_outbox (user_id, to_email, template, payload, idempotency_key)
  values (auth.uid(), _email, 'test', '{}'::jsonb, 'test-' || auth.uid() || '-' || extract(epoch from clock_timestamp())::bigint);
end $$;

-- 3) Extend an instant promise (admin and super admin). Moves the target and the promise, tells the customer.
create or replace function public.extend_instant(_order uuid, _minutes integer, _note text) returns void language plpgsql security definer set search_path = '' as $$
declare _o public.orders;
begin
  if not (private.is_admin() or private.is_super_admin()) or not private.is_active() then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if _minutes is null or _minutes < 15 or _minutes > 480 then raise exception 'invalid_instant' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'note_required' using errcode = 'P0001'; end if;
  select * into _o from public.orders where id = _order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if not _o.instant or _o.instant_target_at is null or _o.status not in ('count_confirmed', 'received', 'in_house', 'ready', 'out_for_delivery', 'failed_delivery') then raise exception 'wrong_state' using errcode = 'P0001'; end if;
  update public.orders set
    instant_target_at = instant_target_at + make_interval(mins => _minutes),
    instant_promise_at = coalesce(instant_promise_at, instant_target_at) + make_interval(mins => _minutes),
    instant_warned_at = null, instant_late_at = null
  where id = _order;
  insert into public.order_events (order_id, actor_id, event, detail) values (_order, auth.uid(), 'instant_extended', jsonb_build_object('minutes', _minutes, 'note', left(trim(_note), 200)));
  insert into public.user_notifications (user_id, title, body, kind, order_id)
  values (_o.customer_id, 'Your delivery time has moved a little', 'We need about ' || _minutes || ' more minutes to do your clothes properly. Sorry for the wait. ' || left(trim(_note), 150), 'order_status', _order);
end $$;

revoke all on function public.send_test_email() from public, anon;
grant execute on function public.send_test_email() to authenticated;
revoke all on function public.extend_instant(uuid, integer, text) from public, anon;
grant execute on function public.extend_instant(uuid, integer, text) to authenticated;
