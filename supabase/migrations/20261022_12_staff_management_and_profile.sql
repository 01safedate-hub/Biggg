-- Staff management for the super admin, own-profile editing, and profile email sync.

create or replace function private.require_super_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_super_admin() or not private.is_active() then
    raise exception 'not_super_admin' using errcode = 'P0001';
  end if;
end $$;

-- The people with any staff role, with whether they have accepted their invitation.
create or replace function public.staff_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
      'status', p.status, 'status_reason', p.status_reason, 'roles', r.roles,
      'accepted', u.email_confirmed_at is not null, 'invited_at', u.invited_at,
      'last_sign_in_at', u.last_sign_in_at, 'created_at', p.created_at) order by p.full_name)
    from public.profiles p
    join auth.users u on u.id = p.id
    join lateral (select array_agg(role::text order by role) as roles from public.user_roles where user_id = p.id) r on r.roles is not null
  ), '[]'::jsonb);
end $$;

-- Lets the super admin turn an existing customer into staff instead of inviting a duplicate account.
create or replace function public.find_user_by_email(_email text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _r jsonb;
begin
  perform private.require_super_admin();
  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'status', p.status,
           'roles', coalesce((select array_agg(role::text) from public.user_roles where user_id = p.id), '{}'))
    into _r from public.profiles p where lower(p.email) = lower(trim(_email));
  return _r;
end $$;

create or replace function public.set_staff_roles(_user uuid, _roles text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare _valid text[] := array(select unnest(enum_range(null::public.staff_role))::text); _new public.staff_role[];
begin
  perform private.require_super_admin();
  if _user = auth.uid() then raise exception 'cannot_edit_self' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = _user) then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(coalesce(_roles, '{}')) r where r <> all(_valid)) then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  _new := array(select distinct r::public.staff_role from unnest(coalesce(_roles, '{}')) r);
  delete from public.user_roles where user_id = _user and role <> all(_new);
  insert into public.user_roles (user_id, role, granted_by)
    select _user, r, auth.uid() from unnest(_new) r on conflict do nothing;
end $$;

create or replace function public.set_staff_status(_user uuid, _status text, _reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_super_admin();
  if _user = auth.uid() then raise exception 'cannot_edit_self' using errcode = 'P0001'; end if;
  if _status not in ('active', 'restricted', 'dismissed') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if _status <> 'active' and length(trim(coalesce(_reason, ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = _user) then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if _status <> 'active' and exists (select 1 from public.user_roles where user_id = _user and role = 'super_admin')
     and not exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
                      where ur.role = 'super_admin' and ur.user_id <> _user and p.status = 'active') then
    raise exception 'last_super_admin' using errcode = 'P0001';
  end if;
  update public.profiles set status = _status, status_reason = case when _status = 'active' then null else trim(_reason) end where id = _user;
end $$;

-- A person edits only their own name and phone; status, code and email can never be changed from here.
create or replace function public.update_my_profile(_full_name text, _phone text) returns void
language plpgsql security definer set search_path = '' as $$
declare _digits text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  if length(trim(coalesce(_full_name, ''))) < 2 or length(trim(_full_name)) > 80 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if length(_digits) < 10 or length(_digits) > 15 then raise exception 'invalid_phone' using errcode = 'P0001'; end if;
  update public.profiles set full_name = trim(_full_name), phone = case when left(trim(_phone), 1) = '+' then '+' || _digits else _digits end
   where id = auth.uid();
end $$;

-- Keep the profile email equal to the sign-in email after a confirmed email change.
create or replace function private.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return null;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.sync_profile_email();

-- Record who restricted, dismissed or reinstated an account.
create trigger profiles_status_audit after update of status on public.profiles
  for each row when (old.status is distinct from new.status) execute function private.audit_row();

revoke execute on function public.staff_list(), public.find_user_by_email(text), public.set_staff_roles(uuid, text[]),
  public.set_staff_status(uuid, text, text), public.update_my_profile(text, text) from public, anon;
grant execute on function public.staff_list(), public.find_user_by_email(text), public.set_staff_roles(uuid, text[]),
  public.set_staff_status(uuid, text, text), public.update_my_profile(text, text) to authenticated;

-- The older helpers are replaced by the checked versions above (they skipped the active-account and last-super-admin checks).
revoke execute on function public.grant_staff_role(uuid, public.staff_role), public.set_user_status(uuid, text, text) from public, anon, authenticated;
