create or replace function public.save_public_holiday(_date date,_name text,_day_in_lieu boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _id uuid;
begin
 if _uid is null or not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_only'; end if;
 if _date is null or length(trim(coalesce(_name,'')))<2 then raise exception 'invalid_holiday'; end if;
 insert into public.public_holidays(holiday_date,name,grants_day_in_lieu,active,created_by) values(_date,trim(_name),coalesce(_day_in_lieu,false),true,_uid)
 on conflict(holiday_date) do update set name=excluded.name,grants_day_in_lieu=excluded.grants_day_in_lieu,active=true,created_by=_uid returning id into _id;
 return _id;
end $$;
create or replace function public.delete_public_holiday(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_only'; end if;
 delete from public.public_holidays where id=_id;
end $$;
create or replace function public.save_roster_blackout(_date date,_reason text,_zone uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _uid uuid:=auth.uid(); _id uuid;
begin
 if _uid is null or not exists(select 1 from public.user_roles r where r.user_id=_uid and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_only'; end if;
 if _date is null or length(trim(coalesce(_reason,'')))<2 then raise exception 'invalid_blackout'; end if;
 if _zone is not null and not exists(select 1 from public.zones where id=_zone) then raise exception 'invalid_blackout_zone'; end if;
 select id into _id from public.roster_blackouts where blackout_date=_date and zone_id is not distinct from _zone limit 1;
 if _id is null then insert into public.roster_blackouts(blackout_date,zone_id,reason,created_by) values(_date,_zone,trim(_reason),_uid) returning id into _id;
 else update public.roster_blackouts set reason=trim(_reason),created_by=_uid where id=_id; end if;
 return _id;
end $$;
create or replace function public.delete_roster_blackout(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('admin','super_admin','secretary')) then raise exception 'manager_only'; end if;
 delete from public.roster_blackouts where id=_id;
end $$;
revoke all on function public.save_public_holiday(date,text,boolean) from public,anon;
revoke all on function public.delete_public_holiday(uuid) from public,anon;
revoke all on function public.save_roster_blackout(date,text,uuid) from public,anon;
revoke all on function public.delete_roster_blackout(uuid) from public,anon;
grant execute on function public.save_public_holiday(date,text,boolean) to authenticated;
grant execute on function public.delete_public_holiday(uuid) to authenticated;
grant execute on function public.save_roster_blackout(date,text,uuid) to authenticated;
grant execute on function public.delete_roster_blackout(uuid) to authenticated;
