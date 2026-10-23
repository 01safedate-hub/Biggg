-- One checked way for the super admin to change business settings. Every field is validated; nothing else can be written through it.
create or replace function public.save_business_settings(_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  _k text; _v jsonb; _t text; _d text; _n numeric;
  _lat double precision; _lng double precision; _has_lat boolean; _has_lng boolean;
  _allowed text[] := array['contact_phone','whatsapp_number','hub_address','hub_lat','hub_lng','demurrage_fee_kobo','demurrage_grace_hours','demurrage_basis','monthly_net_target_kobo','recovery_basis'];
begin
  perform private.require_super_admin();
  if _patch is null or jsonb_typeof(_patch) <> 'object' then raise exception 'invalid_settings' using errcode = 'P0001'; end if;
  for _k in select jsonb_object_keys(_patch) loop
    if _k <> all(_allowed) then raise exception 'invalid_settings' using errcode = 'P0001'; end if;
  end loop;

  if _patch ? 'contact_phone' then
    _t := nullif(trim(_patch->>'contact_phone'), ''); _d := regexp_replace(coalesce(_t, ''), '\D', '', 'g');
    if _t is not null and (length(_d) < 10 or length(_d) > 15) then raise exception 'invalid_phone' using errcode = 'P0001'; end if;
    update public.settings set value = jsonb_build_object('phone', case when _t is null then null else case when left(_t, 1) = '+' then '+' || _d else _d end end) where key = 'contact';
  end if;
  if _patch ? 'whatsapp_number' then
    _t := nullif(trim(_patch->>'whatsapp_number'), ''); _d := regexp_replace(coalesce(_t, ''), '\D', '', 'g');
    if _t is not null and (length(_d) < 10 or length(_d) > 15) then raise exception 'invalid_phone' using errcode = 'P0001'; end if;
    update public.settings set value = jsonb_build_object('number', case when _t is null then null else _d end) where key = 'whatsapp';
  end if;

  if _patch ? 'hub_address' or _patch ? 'hub_lat' or _patch ? 'hub_lng' then
    select (value->>'lat')::double precision, (value->>'lng')::double precision into _lat, _lng from public.settings where key = 'hub';
    _t := (select value->>'address' from public.settings where key = 'hub');
    if _patch ? 'hub_address' then _t := nullif(trim(_patch->>'hub_address'), ''); if length(coalesce(_t, '')) > 200 then raise exception 'invalid_settings' using errcode = 'P0001'; end if; end if;
    if _patch ? 'hub_lat' then _lat := nullif(_patch->>'hub_lat', '')::double precision; end if;
    if _patch ? 'hub_lng' then _lng := nullif(_patch->>'hub_lng', '')::double precision; end if;
    _has_lat := _lat is not null; _has_lng := _lng is not null;
    if _has_lat <> _has_lng or (_has_lat and (_lat not between -90 and 90 or _lng not between -180 and 180)) then raise exception 'invalid_location' using errcode = 'P0001'; end if;
    update public.settings set value = jsonb_build_object('address', _t, 'lat', _lat, 'lng', _lng,
      'maps_url', case when _has_lat then 'https://www.google.com/maps?q=' || _lat::text || ',' || _lng::text else null end) where key = 'hub';
  end if;

  if _patch ? 'demurrage_fee_kobo' or _patch ? 'demurrage_grace_hours' or _patch ? 'demurrage_basis' then
    if _patch ? 'demurrage_fee_kobo' then
      _n := (_patch->>'demurrage_fee_kobo')::numeric;
      if _n is null or _n <> trunc(_n) or _n < 1 or _n > 100000000 then raise exception 'invalid_fee' using errcode = 'P0001'; end if;
      update public.settings set value = jsonb_set(value, '{fee_kobo}', to_jsonb(_n::bigint)) where key = 'demurrage';
    end if;
    if _patch ? 'demurrage_grace_hours' then
      _n := (_patch->>'demurrage_grace_hours')::numeric;
      if _n is null or _n <> trunc(_n) or _n < 0 or _n > 720 then raise exception 'invalid_settings' using errcode = 'P0001'; end if;
      update public.settings set value = jsonb_set(value, '{grace_hours}', to_jsonb(_n::int)) where key = 'demurrage';
    end if;
    if _patch ? 'demurrage_basis' then
      if _patch->>'demurrage_basis' not in ('flat', 'per_day') then raise exception 'invalid_settings' using errcode = 'P0001'; end if;
      update public.settings set value = jsonb_set(value, '{basis}', to_jsonb(_patch->>'demurrage_basis')) where key = 'demurrage';
    end if;
  end if;

  if _patch ? 'monthly_net_target_kobo' then
    _t := nullif(trim(_patch->>'monthly_net_target_kobo'), '');
    if _t is not null and (_t !~ '^\d{1,15}$' or _t::bigint < 1) then raise exception 'invalid_target' using errcode = 'P0001'; end if;
    update public.settings set value = jsonb_build_object('monthly_net_kobo', _t::bigint) where key = 'targets';
  end if;
  if _patch ? 'recovery_basis' then
    if _patch->>'recovery_basis' not in ('profit', 'revenue') then raise exception 'invalid_settings' using errcode = 'P0001'; end if;
    update public.settings set value = jsonb_build_object('basis', _patch->>'recovery_basis') where key = 'recovery';
  end if;
end $$;

revoke execute on function public.save_business_settings(jsonb) from public, anon;
grant execute on function public.save_business_settings(jsonb) to authenticated;
