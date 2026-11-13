-- Per-person interface settings: the staff menu layout (pinned and reordered items)
-- and progress through the in-app guides (customer guide and staff guide chapters).
create table if not exists public.user_ui_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nav jsonb not null default '{}'::jsonb,
  tours jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_ui_prefs enable row level security;
drop policy if exists user_ui_prefs_own_read on public.user_ui_prefs;
create policy user_ui_prefs_own_read on public.user_ui_prefs for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.user_ui_prefs from anon, authenticated;

create or replace function public.my_ui_prefs()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('nav', p.nav, 'tours', p.tours) from public.user_ui_prefs p where p.user_id = auth.uid()),
                  jsonb_build_object('nav', '{}'::jsonb, 'tours', '{}'::jsonb));
$$;

-- Only staff can arrange their menu. _layout = null resets to the default.
-- Shape: {"pinned": ["/staff/orders", ...], "order": {"My work": ["/staff", ...], ...}}
create or replace function public.save_nav_layout(_area text, _layout jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _pinned jsonb := '[]'::jsonb; _order jsonb := '{}'::jsonb; _k text; _v jsonb; _clean jsonb;
begin
  if _uid is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if not private.is_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if _area not in ('staff', 'admin') then raise exception 'invalid_scope' using errcode = 'P0001'; end if;
  if _layout is not null then
    if jsonb_typeof(_layout) <> 'object' or pg_column_size(_layout) > 16000 then raise exception 'bad_request' using errcode = 'P0001'; end if;
    if jsonb_typeof(_layout->'pinned') = 'array' then
      select coalesce(jsonb_agg(h order by o), '[]'::jsonb) into _pinned
        from (select e #>> '{}' h, min(o) o
                from jsonb_array_elements(_layout->'pinned') with ordinality t(e, o)
               where jsonb_typeof(e) = 'string' and (e #>> '{}') ~ '^/[A-Za-z0-9/_-]{0,119}$'
               group by 1) x;
      if jsonb_array_length(_pinned) > 12 then raise exception 'too_many_pins' using errcode = 'P0001'; end if;
    end if;
    if jsonb_typeof(_layout->'order') = 'object' then
      for _k, _v in select key, value from jsonb_each(_layout->'order') limit 30 loop
        if length(_k) between 1 and 60 and jsonb_typeof(_v) = 'array' then
          _order := _order || jsonb_build_object(_k, (select coalesce(jsonb_agg(e #>> '{}' order by o), '[]'::jsonb)
            from (select e, o from jsonb_array_elements(_v) with ordinality t(e, o) where jsonb_typeof(e) = 'string' and (e #>> '{}') ~ '^/[A-Za-z0-9/_-]{0,119}$' limit 80) y));
        end if;
      end loop;
    end if;
    _clean := jsonb_build_object('pinned', _pinned, 'order', _order);
  end if;
  insert into public.user_ui_prefs (user_id, nav) values (_uid, case when _clean is null then '{}'::jsonb else jsonb_build_object(_area, _clean) end)
  on conflict (user_id) do update
    set nav = case when _clean is null then public.user_ui_prefs.nav - _area else public.user_ui_prefs.nav || jsonb_build_object(_area, _clean) end,
        updated_at = now();
end $$;

-- Guide progress. _tour = 'customer' or 'staff'. The app decides the shape; the database only limits its size.
create or replace function public.save_tour_progress(_tour text, _progress jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _p jsonb;
begin
  if _uid is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if _tour not in ('customer', 'staff') then raise exception 'invalid_scope' using errcode = 'P0001'; end if;
  if _tour = 'staff' and not private.is_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if _progress is null or jsonb_typeof(_progress) <> 'object' or pg_column_size(_progress) > 16000 then raise exception 'bad_request' using errcode = 'P0001'; end if;
  _p := _progress || jsonb_build_object('updated_at', now());
  insert into public.user_ui_prefs (user_id, tours) values (_uid, jsonb_build_object(_tour, _p))
  on conflict (user_id) do update set tours = public.user_ui_prefs.tours || jsonb_build_object(_tour, _p), updated_at = now();
end $$;

-- Admins: every active staff member, their roles and their staff-guide progress.
create or replace function public.staff_guide_progress()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone,
             'roles', (select jsonb_agg(r.role::text order by r.role::text) from public.user_roles r where r.user_id = p.id),
             'progress', coalesce(u.tours->'staff', '{}'::jsonb)) order by p.full_name)
      from public.profiles p
      left join public.user_ui_prefs u on u.user_id = p.id
     where p.status = 'active' and exists (select 1 from public.user_roles r where r.user_id = p.id)), '[]'::jsonb);
end $$;

revoke all on function public.my_ui_prefs() from public, anon;
revoke all on function public.save_nav_layout(text, jsonb) from public, anon;
revoke all on function public.save_tour_progress(text, jsonb) from public, anon;
revoke all on function public.staff_guide_progress() from public, anon;
grant execute on function public.my_ui_prefs() to authenticated;
grant execute on function public.save_nav_layout(text, jsonb) to authenticated;
grant execute on function public.save_tour_progress(text, jsonb) to authenticated;
grant execute on function public.staff_guide_progress() to authenticated;
