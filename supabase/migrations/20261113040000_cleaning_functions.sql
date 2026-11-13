-- Cleaning service: pricing, capacity, requests, inspections and quotes.

-- ---------- Small helpers ----------
create or replace function private.cl_set() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.settings where key = 'cleaning'), '{}'::jsonb)
$$;

create or replace function private.cl_int(_k text, _default bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((private.cl_set()->>_k)::bigint, _default)
$$;

create or replace function private.cl_round(_kobo numeric, _to bigint default 5000) returns bigint
language sql immutable as $$
  select (round(_kobo / greatest(_to, 1)) * greatest(_to, 1))::bigint
$$;

create or replace function private.cl_event(_entity text, _id uuid, _event text, _detail jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.cleaning_events (entity, entity_id, actor_id, event, detail) values (_entity, _id, auth.uid(), _event, coalesce(_detail, '{}'::jsonb))
$$;

create or replace function private.cl_notify_admin(_heading text, _lines jsonb, _url text, _key text) returns void
language plpgsql security definer set search_path = '' as $$
declare _email text := nullif(trim(private.cl_set()->>'admin_email'), ''); _admin uuid;
begin
  if _email is null then return; end if;
  select id into _admin from public.profiles where lower(email) = lower(_email) limit 1;
  perform private.custom_email(_admin, _email, _heading, _lines, 'https://laundrypoint.app' || _url, 'Open in LaundryPoint', _key);
end $$;

-- In-app notification plus an email (walk-in profiles have no real email, so they get none).
create table if not exists public.cleaning_notice_keys (key text primary key, created_at timestamptz not null default now());
alter table public.cleaning_notice_keys enable row level security;

create or replace function private.cl_notify_customer(_customer uuid, _title text, _body text, _lines jsonb, _url text, _cta text, _key text) returns void
language plpgsql security definer set search_path = '' as $$
declare _p public.profiles;
begin
  -- each notice is sent once, however often the caller runs
  insert into public.cleaning_notice_keys (key) values (_key) on conflict do nothing;
  if not found then return; end if;
  select * into _p from public.profiles where id = _customer;
  if not found then return; end if;
  insert into public.user_notifications (user_id, title, body, kind) values (_customer, _title, _body, 'cleaning');
  if _p.email is not null and _p.email !~* '\.invalid$' and coalesce(_p.status, 'active') = 'active' then
    perform private.custom_email(_customer, _p.email, _title, coalesce(_lines, jsonb_build_array(_body)), 'https://laundrypoint.app' || _url, _cta, _key);
  end if;
end $$;

-- Zone, distance from the hub and crew transport fare (same per-km formula as laundry), with the free transport switch.
create or replace function private.cl_transport(_lat double precision, _lng double precision, _customer uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _z record; _hub jsonb; _f jsonb; _km numeric; _fare bigint; _w public.transport_waivers;
begin
  if _lat is null or _lng is null then return jsonb_build_object('served', false, 'reason', 'location_required'); end if;
  select z.id, z.name into _z from public.zones z
   where z.is_live and z.centre_lat is not null and z.centre_lng is not null and z.radius_m is not null
     and private.distance_km(z.centre_lat, z.centre_lng, _lat, _lng) * 1000 <= z.radius_m
   order by private.distance_km(z.centre_lat, z.centre_lng, _lat, _lng) limit 1;
  if not found then return jsonb_build_object('served', false, 'reason', 'not_served'); end if;
  select value into _hub from public.settings where key = 'hub';
  select value into _f from public.settings where key = 'fare_pickup';
  if _hub->>'lat' is null then return jsonb_build_object('served', true, 'zone_id', _z.id, 'zone_name', _z.name, 'reason', 'hub_not_set', 'fare_kobo', 0, 'waived_kobo', 0); end if;
  _km := private.distance_km((_hub->>'lat')::float8, (_hub->>'lng')::float8, _lat, _lng)::numeric;
  _fare := greatest(coalesce((_f->>'min_fare_kobo')::bigint, 80000),
                    private.cl_round(_km * 2 * coalesce((_f->>'rate_per_km_kobo')::bigint, 15000), coalesce((_f->>'round_to_kobo')::bigint, 5000)));
  _w := private.transport_waiver('cleaning', _customer, _z.id);
  return jsonb_build_object('served', true, 'zone_id', _z.id, 'zone_name', _z.name, 'distance_km', round(_km, 2),
    'fare_kobo', case when _w.id is null then _fare else 0 end, 'full_fare_kobo', _fare,
    'waived_kobo', case when _w.id is null then 0 else _fare end, 'waiver_id', _w.id, 'waiver_message', _w.public_message);
end $$;

create or replace function private.cl_inspection_fee(_km numeric) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select (b->>'fee_kobo')::bigint from jsonb_array_elements(private.cl_set()->'inspection_fee_bands') b
                    where coalesce(_km, 0) <= (b->>'max_km')::numeric order by (b->>'max_km')::numeric limit 1), 700000)
$$;

-- Price lines for one visit from the rate card.
create or replace function private.cl_price(_rate jsonb, _service text, _condition text, _spaces jsonb, _addons jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _k text; _v jsonb; _q integer; _sm numeric; _cm numeric; _unit bigint; _amt bigint; _mins numeric := 0; _sub bigint := 0;
        _lines jsonb := '[]'::jsonb; _rt bigint := coalesce((_rate->>'round_to_kobo')::bigint, 5000);
begin
  _sm := (_rate->'services'->_service->>'multiplier')::numeric;
  if _sm is null then raise exception 'cleaning_invalid_service' using errcode = 'P0001'; end if;
  _cm := (_rate->'conditions'->coalesce(_condition, 'normal')->>'multiplier')::numeric;
  if _cm is null then raise exception 'cleaning_invalid_condition' using errcode = 'P0001'; end if;
  for _k, _v in select key, value from jsonb_each(coalesce(_spaces, '{}'::jsonb)) loop
    _q := coalesce((_v #>> '{}')::integer, 0);
    if _q < 0 or _q > 50 then raise exception 'cleaning_invalid_qty' using errcode = 'P0001'; end if;
    continue when _q = 0;
    if _rate->'spaces'->_k is null then raise exception 'cleaning_invalid_space' using errcode = 'P0001'; end if;
    _unit := private.cl_round((_rate->'spaces'->_k->>'price_kobo')::numeric * _sm * _cm, _rt);
    _amt := _unit * _q;
    _mins := _mins + _q * (_rate->'spaces'->_k->>'minutes')::numeric * _sm * _cm;
    _sub := _sub + _amt;
    _lines := _lines || jsonb_build_object('kind', 'space', 'code', _k, 'label', _rate->'spaces'->_k->>'label', 'qty', _q, 'unit_kobo', _unit, 'amount_kobo', _amt);
  end loop;
  for _k, _v in select key, value from jsonb_each(coalesce(_addons, '{}'::jsonb)) loop
    _q := coalesce((_v #>> '{}')::integer, 0);
    if _q < 0 or _q > 50 then raise exception 'cleaning_invalid_qty' using errcode = 'P0001'; end if;
    continue when _q = 0;
    if _rate->'addons'->_k is null then raise exception 'cleaning_invalid_addon' using errcode = 'P0001'; end if;
    _unit := (_rate->'addons'->_k->>'price_kobo')::bigint;
    _amt := _unit * _q;
    _mins := _mins + _q * (_rate->'addons'->_k->>'minutes')::numeric;
    _sub := _sub + _amt;
    _lines := _lines || jsonb_build_object('kind', 'addon', 'code', _k, 'label', _rate->'addons'->_k->>'label', 'qty', _q, 'unit_kobo', _unit, 'amount_kobo', _amt);
  end loop;
  return jsonb_build_object('lines', _lines, 'subtotal_kobo', _sub, 'minutes', ceil(_mins)::integer,
    'service_label', _rate->'services'->_service->>'label', 'condition_label', _rate->'conditions'->coalesce(_condition, 'normal')->>'label');
end $$;

-- Crew size and visit length from total cleaner-minutes.
create or replace function private.cl_crew(_minutes integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _max integer := greatest(60, private.cl_int('max_minutes_per_cleaner', 240)::integer); _crew integer; _dur integer;
begin
  _crew := least(6, greatest(1, ceil(greatest(_minutes, 30)::numeric / _max)::integer));
  _dur := greatest(30, (ceil(greatest(_minutes, 30)::numeric / _crew / 15) * 15)::integer);
  return jsonb_build_object('crew_size', _crew, 'duration_min', _dur, 'crew_minutes', _crew * _dur);
end $$;

-- ---------- Capacity ----------
-- Cleaner-minutes on shift that day: weekly shift templates of cleaners and leads, minus approved leave,
-- capped per person. Until any cleaner has a shift template, a fallback setting is used.
create or replace function private.cl_day_capacity(_d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _mins integer; _people integer; _cap integer := private.cl_int('daily_cap_min', 420)::integer; _any boolean;
begin
  if extract(isodow from _d) = 7 then return jsonb_build_object('minutes', 0, 'cleaners', 0, 'fallback', false); end if;
  select exists (select 1 from public.shift_templates t join public.user_roles r on r.user_id = t.staff_id
                  where t.active and r.role::text in ('cleaner', 'cleaning_lead')) into _any;
  if not _any then
    return jsonb_build_object('minutes', private.cl_int('fallback_daily_crew_minutes', 840), 'cleaners', private.cl_int('fallback_cleaners', 2), 'fallback', true);
  end if;
  select coalesce(sum(least(_cap, extract(epoch from (t.ends_at - t.starts_at)) / 60)), 0)::integer, count(distinct t.staff_id)::integer
    into _mins, _people
    from public.shift_templates t
   where t.active and t.weekday = extract(isodow from _d)::int
     and exists (select 1 from public.user_roles r where r.user_id = t.staff_id and r.role::text in ('cleaner', 'cleaning_lead'))
     and not exists (select 1 from public.leave_requests l where l.staff_id = t.staff_id and l.status = 'approved' and _d between l.start_date and l.end_date);
  return jsonb_build_object('minutes', _mins, 'cleaners', _people, 'fallback', false);
end $$;

-- Crew-minutes already booked that day, including unexpired holds and a travel buffer per visit.
create or replace function private.cl_day_booked(_d date, _except uuid default null) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(v.crew_size * (v.duration_min + private.cl_int('travel_buffer_min', 30)::integer)), 0)::integer
    from public.cleaning_visits v
   where v.scheduled_date = _d and v.id is distinct from _except
     and (v.status in ('scheduled', 'on_the_way', 'in_progress') or (v.status = 'held' and v.hold_until > now()))
$$;

create or replace function private.cl_fits(_d date, _crew integer, _duration integer, _except uuid default null) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare _c jsonb := private.cl_day_capacity(_d);
begin
  return (_c->>'cleaners')::int >= _crew
     and private.cl_day_booked(_d, _except) + _crew * (_duration + private.cl_int('travel_buffer_min', 30)::integer) <= (_c->>'minutes')::int;
end $$;

-- Free days for a visit of this size, zone days first. Sundays are never offered.
create or replace function public.cleaning_slots(_zone uuid, _crew integer, _duration integer, _from date default null, _days integer default 21)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _d date; _start date := greatest(coalesce(_from, current_date + 1), (now() at time zone 'Africa/Lagos')::date + 1); _out jsonb := '[]'::jsonb;
        _zd integer[];
begin
  if auth.uid() is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if _crew is null or _crew < 1 or _duration is null or _duration < 15 then raise exception 'cleaning_invalid_size' using errcode = 'P0001'; end if;
  select coalesce(array_agg(weekday), '{}') into _zd from public.cleaning_zone_days where zone_id = _zone;
  for _d in select generate_series(_start, _start + least(greatest(_days, 1), 60) - 1, interval '1 day')::date loop
    continue when extract(isodow from _d) = 7;
    if private.cl_fits(_d, _crew, _duration) then
      _out := _out || jsonb_build_object('date', _d, 'weekday', extract(isodow from _d)::int,
        'zone_day', extract(isodow from _d)::int = any(_zd), 'windows', jsonb_build_array('morning', 'afternoon'));
    end if;
  end loop;
  return _out;
end $$;

-- ---------- Public price information (SEO pages, request form) ----------
create or replace function public.cleaning_public_info()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _r jsonb; _s jsonb := private.cl_set(); _min bigint := private.cl_int('min_job_kobo', 800000);
        _ex jsonb := '[]'::jsonb; _homes jsonb; _h jsonb; _std bigint; _deep bigint;
begin
  select data into _r from public.cleaning_rate_versions where active;
  _homes := jsonb_build_array(
    jsonb_build_object('label', 'Self-contain', 'spaces', jsonb_build_object('bedroom', 1, 'kitchen', 1, 'bathroom', 1)),
    jsonb_build_object('label', '1 bedroom flat', 'spaces', jsonb_build_object('bedroom', 1, 'living_room', 1, 'kitchen', 1, 'bathroom', 1)),
    jsonb_build_object('label', '2 bedroom flat', 'spaces', jsonb_build_object('bedroom', 2, 'living_room', 1, 'kitchen', 1, 'bathroom', 2)),
    jsonb_build_object('label', '3 bedroom flat', 'spaces', jsonb_build_object('bedroom', 3, 'living_room', 1, 'kitchen', 1, 'bathroom', 2)));
  for _h in select * from jsonb_array_elements(_homes) loop
    _std := greatest(_min, (private.cl_price(_r, 'standard', 'normal', _h->'spaces', '{}'::jsonb)->>'subtotal_kobo')::bigint);
    _deep := greatest(_min, (private.cl_price(_r, 'deep', 'normal', _h->'spaces', '{}'::jsonb)->>'subtotal_kobo')::bigint);
    _ex := _ex || jsonb_build_object('label', _h->>'label', 'standard_kobo', _std, 'deep_kobo', _deep);
  end loop;
  return jsonb_build_object(
    'examples', _ex, 'min_job_kobo', _min,
    'inspection_fee_bands', _s->'inspection_fee_bands',
    'services', (select jsonb_object_agg(k, v->>'label') from jsonb_each(_r->'services') e(k, v)),
    'addons', (select jsonb_agg(jsonb_build_object('code', k, 'label', v->>'label', 'price_kobo', (v->>'price_kobo')::bigint)) from jsonb_each(_r->'addons') e(k, v)),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'blurb', blurb, 'visits_per_month', visits_per_month,
               'deep_every_months', deep_every_months, 'discount_pct', discount_pct, 'custom', custom) order by sort_order), '[]'::jsonb)
              from public.cleaning_plan_types where active),
    'bundle_discount_pct', coalesce((_s->>'bundle_discount_pct')::numeric, 10),
    'hotline', _s->>'hotline', 'whatsapp', _s->>'whatsapp');
end $$;

-- Coverage, inspection fee and crew transport for an address (request form).
create or replace function public.cleaning_check_address(_lat double precision, _lng double precision)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _t jsonb;
begin
  _t := private.cl_transport(_lat, _lng, auth.uid());
  if not coalesce((_t->>'served')::boolean, false) then return _t; end if;
  return _t || jsonb_build_object('inspection_fee_kobo', private.cl_inspection_fee((_t->>'distance_km')::numeric));
end $$;

-- ---------- Requests ----------
create or replace function private.cl_property_upsert(_customer uuid, _property uuid, _p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare _id uuid; _t jsonb; _lat double precision := nullif(_p->>'lat', '')::float8; _lng double precision := nullif(_p->>'lng', '')::float8;
        _addr text := nullif(trim(coalesce(_p->>'address', '')), '');
begin
  if _property is not null then
    select id into _id from public.cleaning_properties where id = _property and customer_id = _customer and not archived;
    if not found then raise exception 'cleaning_property_not_found' using errcode = 'P0001'; end if;
    return _id;
  end if;
  if _addr is null or length(_addr) < 5 or length(_addr) > 300 then raise exception 'address_required' using errcode = 'P0001'; end if;
  if _lat is null or _lng is null then raise exception 'location_required' using errcode = 'P0001'; end if;
  _t := private.cl_transport(_lat, _lng, _customer);
  if not coalesce((_t->>'served')::boolean, false) then raise exception 'not_served' using errcode = 'P0001'; end if;
  insert into public.cleaning_properties (customer_id, kind, address, lat, lng, zone_id, distance_km, bedrooms, bathrooms, created_by)
  values (_customer, coalesce(nullif(_p->>'home_kind', ''), 'flat'), _addr, _lat, _lng, (_t->>'zone_id')::uuid, (_t->>'distance_km')::numeric,
          nullif(_p->>'bedrooms', '')::int, nullif(_p->>'bathrooms', '')::int, auth.uid())
  returning id into _id;
  return _id;
end $$;

create or replace function public.cleaning_request_create(_p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _me uuid := auth.uid(); _prop uuid; _id uuid; _no bigint; _photos text[]; _svc text := _p->>'service'; _pr public.cleaning_properties;
begin
  if _me is null or not private.is_active() then raise exception 'account_restricted' using errcode = 'P0001'; end if;
  if _svc not in ('standard', 'deep', 'move', 'post_construction', 'after_event', 'shortlet', 'office') then raise exception 'cleaning_invalid_service' using errcode = 'P0001'; end if;
  if (select count(*) from public.cleaning_requests where customer_id = _me and status in ('new', 'contacted', 'inspection_booked', 'quoting', 'quoted')) >= 5 then
    raise exception 'cleaning_too_many_requests' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x), '{}') into _photos from jsonb_array_elements_text(coalesce(_p->'photos', '[]'::jsonb)) x;
  if array_length(_photos, 1) > 10 then raise exception 'too_many_photos' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(_photos) x where x !~ ('^requests/' || _me::text || '/[A-Za-z0-9._/-]+$')) then raise exception 'evidence_path_invalid' using errcode = 'P0001'; end if;
  if length(coalesce(_p->>'details', '')) > 1000 then raise exception 'notes_too_long' using errcode = 'P0001'; end if;
  _prop := private.cl_property_upsert(_me, nullif(_p->>'property_id', '')::uuid, _p);
  select * into _pr from public.cleaning_properties where id = _prop;
  insert into public.cleaning_requests (customer_id, source, service, wants_plan, property_id, address, lat, lng, zone_id, distance_km,
    home_kind, bedrooms, bathrooms, details, preferred, photos, created_by)
  values (_me, 'web', _svc, coalesce((_p->>'wants_plan')::boolean, false), _prop, _pr.address, _pr.lat, _pr.lng, _pr.zone_id, _pr.distance_km,
    coalesce(nullif(_p->>'home_kind', ''), _pr.kind), coalesce(nullif(_p->>'bedrooms', '')::int, _pr.bedrooms), coalesce(nullif(_p->>'bathrooms', '')::int, _pr.bathrooms),
    nullif(trim(coalesce(_p->>'details', '')), ''), nullif(trim(coalesce(_p->>'preferred', '')), ''), _photos, _me)
  returning id, request_no into _id, _no;
  perform private.cl_event('request', _id, 'created', jsonb_build_object('source', 'web'));
  perform private.cl_notify_admin('New cleaning request #' || _no,
    jsonb_build_array('Service: ' || replace(_svc, '_', ' ') || case when coalesce((_p->>'wants_plan')::boolean, false) then ' (wants a monthly plan)' else '' end,
      'Address: ' || _pr.address, 'Call the customer to arrange the inspection or a remote quote.'),
    '/staff/cleaning/requests/' || _id, 'cleaning-request-' || _id);
  perform private.cl_notify_customer(_me, 'We received your cleaning request', 'Request #' || _no || '. We will call you shortly to arrange a quote. You can also call or WhatsApp 0913 258 4627.',
    null, '/cleaning/my', 'See my cleaning', 'cleaning-request-cust-' || _id);
  return jsonb_build_object('id', _id, 'request_no', _no);
end $$;

-- Requests taken by phone, WhatsApp or at the desk. A customer account can be linked now or later.
create or replace function public.cleaning_request_staff_create(_p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _c uuid := nullif(_p->>'customer_id', '')::uuid; _prop uuid; _id uuid; _no bigint; _svc text := _p->>'service'; _pr public.cleaning_properties;
        _src text := coalesce(nullif(_p->>'source', ''), 'call');
begin
  if not private.is_cleaning_desk() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if _svc not in ('standard', 'deep', 'move', 'post_construction', 'after_event', 'shortlet', 'office') then raise exception 'cleaning_invalid_service' using errcode = 'P0001'; end if;
  if _src not in ('call', 'whatsapp', 'walk_in', 'web') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _c is null and (nullif(trim(coalesce(_p->>'contact_name', '')), '') is null or nullif(trim(coalesce(_p->>'contact_phone', '')), '') is null) then
    raise exception 'cleaning_contact_required' using errcode = 'P0001';
  end if;
  if _c is not null and not exists (select 1 from public.profiles where id = _c) then raise exception 'customer_not_found' using errcode = 'P0001'; end if;
  if _c is not null and (nullif(_p->>'lat', '') is not null or nullif(_p->>'property_id', '') is not null) then
    _prop := private.cl_property_upsert(_c, nullif(_p->>'property_id', '')::uuid, _p);
    select * into _pr from public.cleaning_properties where id = _prop;
  end if;
  insert into public.cleaning_requests (customer_id, contact_name, contact_phone, source, service, wants_plan, property_id, address, lat, lng, zone_id, distance_km,
    home_kind, bedrooms, bathrooms, details, preferred, created_by, assigned_to, status)
  values (_c, nullif(trim(coalesce(_p->>'contact_name', '')), ''), nullif(trim(coalesce(_p->>'contact_phone', '')), ''), _src, _svc,
    coalesce((_p->>'wants_plan')::boolean, false), _prop, coalesce(_pr.address, nullif(trim(coalesce(_p->>'address', '')), '')),
    _pr.lat, _pr.lng, _pr.zone_id, _pr.distance_km, nullif(_p->>'home_kind', ''), nullif(_p->>'bedrooms', '')::int, nullif(_p->>'bathrooms', '')::int,
    nullif(trim(coalesce(_p->>'details', '')), ''), nullif(trim(coalesce(_p->>'preferred', '')), ''), auth.uid(), auth.uid(), 'contacted')
  returning id, request_no into _id, _no;
  perform private.cl_event('request', _id, 'created', jsonb_build_object('source', _src));
  perform private.cl_notify_admin('New cleaning request #' || _no || ' (' || _src || ')',
    jsonb_build_array('Service: ' || replace(_svc, '_', ' '), 'Taken by staff.'), '/staff/cleaning/requests/' || _id, 'cleaning-request-' || _id);
  return jsonb_build_object('id', _id, 'request_no', _no);
end $$;

create or replace function public.cleaning_request_update(_id uuid, _patch jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare _r public.cleaning_requests; _c uuid; _prop uuid; _pr public.cleaning_properties; _st text := nullif(_patch->>'status', '');
begin
  if not private.is_cleaning_desk() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _r from public.cleaning_requests where id = _id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _st is not null and _st not in ('new', 'contacted', 'quoting', 'lost', 'cancelled') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _st = 'lost' and nullif(trim(coalesce(_patch->>'lost_reason', '')), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  _c := coalesce(nullif(_patch->>'customer_id', '')::uuid, _r.customer_id);
  if _c is distinct from _r.customer_id and not exists (select 1 from public.profiles where id = _c) then raise exception 'customer_not_found' using errcode = 'P0001'; end if;
  _prop := _r.property_id;
  if _c is not null and (nullif(_patch->>'lat', '') is not null or nullif(_patch->>'property_id', '') is not null) then
    _prop := private.cl_property_upsert(_c, nullif(_patch->>'property_id', '')::uuid, _patch);
  end if;
  select * into _pr from public.cleaning_properties where id = _prop;
  update public.cleaning_requests set
    customer_id = _c, property_id = _prop,
    address = coalesce(_pr.address, address), lat = coalesce(_pr.lat, lat), lng = coalesce(_pr.lng, lng),
    zone_id = coalesce(_pr.zone_id, zone_id), distance_km = coalesce(_pr.distance_km, distance_km),
    status = coalesce(_st, status), lost_reason = case when _st = 'lost' then trim(_patch->>'lost_reason') else lost_reason end,
    assigned_to = coalesce(nullif(_patch->>'assigned_to', '')::uuid, assigned_to),
    details = coalesce(nullif(trim(coalesce(_patch->>'details', '')), ''), details),
    wants_plan = coalesce((_patch->>'wants_plan')::boolean, wants_plan),
    service = coalesce(nullif(_patch->>'service', ''), service),
    updated_at = now()
  where id = _id;
  perform private.cl_event('request', _id, 'updated', _patch - 'lat' - 'lng');
end $$;

-- ---------- Inspections ----------
create or replace function public.cleaning_book_inspection(_request uuid, _p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare _r public.cleaning_requests; _mode text := coalesce(nullif(_p->>'mode', ''), 'onsite'); _fee bigint := 0; _waive boolean := coalesce((_p->>'waive')::boolean, false);
        _id uuid; _inv uuid; _at timestamptz := nullif(_p->>'scheduled_for', '')::timestamptz; _insp uuid := nullif(_p->>'inspector_id', '')::uuid;
begin
  if not private.is_cleaning_desk() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _r from public.cleaning_requests where id = _request for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _r.status in ('accepted', 'lost', 'cancelled') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _mode not in ('onsite', 'remote') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _mode = 'onsite' and _at is null then raise exception 'cleaning_time_required' using errcode = 'P0001'; end if;
  if _at is not null and _at < now() - interval '1 hour' then raise exception 'slot_invalid' using errcode = 'P0001'; end if;
  if _insp is not null and not exists (select 1 from public.user_roles where user_id = _insp and role::text in ('inspector', 'admin', 'super_admin', 'scheduler', 'cleaning_lead')) then
    raise exception 'cleaning_not_inspector' using errcode = 'P0001';
  end if;
  if _waive and nullif(trim(coalesce(_p->>'waive_reason', '')), '') is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if _mode = 'onsite' and not _waive then
    if _r.customer_id is null then raise exception 'customer_account_required' using errcode = 'P0001'; end if;
    _fee := private.cl_inspection_fee(_r.distance_km);
  end if;
  update public.cleaning_inspections set status = 'cancelled' where request_id = _request and status in ('awaiting_fee', 'scheduled');
  update public.cleaning_invoices set status = 'void' where purpose = 'inspection' and status = 'open'
     and inspection_id in (select id from public.cleaning_inspections where request_id = _request);
  insert into public.cleaning_inspections (request_id, inspector_id, mode, scheduled_for, fee_kobo, fee_waived, waived_by, waive_reason, status, created_by)
  values (_request, _insp, _mode, _at, case when _waive then 0 else _fee end, _waive and _mode = 'onsite', case when _waive then auth.uid() end,
          nullif(trim(coalesce(_p->>'waive_reason', '')), ''), case when _fee > 0 then 'awaiting_fee' else 'scheduled' end, auth.uid())
  returning id into _id;
  if _fee > 0 then
    insert into public.cleaning_invoices (customer_id, purpose, inspection_id, amount_kobo, description)
    values (_r.customer_id, 'inspection', _id, _fee, 'Cleaning inspection fee for request #' || _r.request_no || ' (credited to your clean if you accept the quote)')
    returning id into _inv;
  end if;
  update public.cleaning_requests set status = 'inspection_booked', assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now() where id = _request;
  perform private.cl_event('inspection', _id, 'booked', jsonb_build_object('mode', _mode, 'fee_kobo', _fee, 'waived', _waive));
  if _r.customer_id is not null then
    perform private.cl_notify_customer(_r.customer_id,
      case when _mode = 'remote' then 'Send us photos or a video call for your quote' else 'Cleaning inspection booked' end,
      case when _mode = 'remote' then 'We will quote from photos or a short WhatsApp video call. No inspection fee.'
           when _fee > 0 then 'Inspection on ' || to_char(_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH12:MI AM') || '. Please pay the ₦' || to_char(_fee / 100, 'FM999,999') || ' inspection fee to confirm it. It is credited to your clean if you accept the quote.'
           else 'Inspection on ' || to_char(_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH12:MI AM') || '. No fee for this inspection.' end,
      null, '/cleaning/my', case when _fee > 0 then 'Pay the inspection fee' else 'See my cleaning' end, 'cleaning-insp-' || _id);
  end if;
  return jsonb_build_object('id', _id, 'fee_kobo', _fee, 'invoice_id', _inv);
end $$;

create or replace function public.cleaning_inspection_done(_id uuid, _findings jsonb, _photos text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare _i public.cleaning_inspections; _r public.cleaning_requests;
begin
  if not private.is_cleaning_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _i from public.cleaning_inspections where id = _id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _i.status not in ('scheduled', 'awaiting_fee') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _i.inspector_id is not null and _i.inspector_id <> auth.uid() and not private.is_cleaning_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if array_length(coalesce(_photos, '{}'), 1) > 30 then raise exception 'too_many_photos' using errcode = 'P0001'; end if;
  select * into _r from public.cleaning_requests where id = _i.request_id;
  update public.cleaning_inspections set status = 'done', findings = coalesce(_findings, '{}'::jsonb), photos = coalesce(_photos, '{}'),
         inspector_id = coalesce(inspector_id, auth.uid()), done_at = now() where id = _id;
  if _r.property_id is not null then
    update public.cleaning_properties set
      water_note = coalesce(nullif(_findings->>'water', ''), water_note), power_note = coalesce(nullif(_findings->>'power', ''), power_note),
      access_note = coalesce(nullif(_findings->>'access', ''), access_note), pets = coalesce(nullif(_findings->>'pets', ''), pets),
      kind = coalesce(nullif(_findings->>'kind', ''), kind), updated_at = now()
    where id = _r.property_id;
  end if;
  update public.cleaning_requests set status = 'quoting', updated_at = now() where id = _i.request_id and status in ('inspection_booked', 'contacted', 'new');
  perform private.cl_event('inspection', _id, 'done', jsonb_build_object('photos', array_length(coalesce(_photos, '{}'), 1)));
end $$;

-- ---------- Quotes ----------
-- Works out a full quote. Used both to preview while typing and to save.
create or replace function private.cl_quote_calc(_customer uuid, _property uuid, _p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _rate public.cleaning_rate_versions; _pr public.cleaning_properties; _kind text := coalesce(nullif(_p->>'kind', ''), 'one_off');
        _svc text := coalesce(nullif(_p->>'service', ''), 'standard'); _cond text := coalesce(nullif(_p->>'condition', ''), 'normal');
        _price jsonb; _deep jsonb; _crew jsonb; _dcrew jsonb; _t jsonb; _min bigint := private.cl_int('min_job_kobo', 800000);
        _sub bigint; _visit bigint; _pt public.cleaning_plan_types; _visits integer; _disc numeric; _monthly bigint; _first bigint;
        _override bigint := nullif(_p->>'override_kobo', '')::bigint; _bundle boolean := coalesce((_p->>'bundle')::boolean, false);
        _bpct numeric := coalesce((private.cl_set()->>'bundle_discount_pct')::numeric, 10); _regular text; _computed_monthly bigint;
begin
  select * into _rate from public.cleaning_rate_versions where active;
  select * into _pr from public.cleaning_properties where id = _property and customer_id = _customer;
  if not found then raise exception 'cleaning_property_not_found' using errcode = 'P0001'; end if;
  if _kind not in ('one_off', 'plan') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  _t := private.cl_transport(_pr.lat, _pr.lng, _customer);
  if not coalesce((_t->>'served')::boolean, false) then raise exception 'not_served' using errcode = 'P0001'; end if;
  if _kind = 'one_off' then
    _price := private.cl_price(_rate.data, _svc, _cond, _p->'spaces', _p->'addons');
    _sub := greatest(_min, (_price->>'subtotal_kobo')::bigint);
    if (_price->>'subtotal_kobo')::bigint = 0 then raise exception 'cleaning_nothing_to_clean' using errcode = 'P0001'; end if;
    _crew := private.cl_crew((_price->>'minutes')::int);
    _visit := coalesce(_override, _sub) + (_t->>'fare_kobo')::bigint;
    return jsonb_build_object('kind', 'one_off', 'service', _svc, 'condition', _cond, 'rate_version_id', _rate.id,
      'lines', _price->'lines', 'subtotal_kobo', _sub, 'computed_subtotal_kobo', (_price->>'subtotal_kobo')::bigint, 'min_applied', (_price->>'subtotal_kobo')::bigint < _min,
      'override_kobo', _override, 'transport_kobo', (_t->>'fare_kobo')::bigint, 'transport_waived_kobo', (_t->>'waived_kobo')::bigint,
      'visit_price_kobo', _visit, 'crew_size', (_crew->>'crew_size')::int, 'duration_min', (_crew->>'duration_min')::int,
      'zone_id', _t->>'zone_id', 'distance_km', _t->>'distance_km', 'total_kobo', _visit);
  end if;
  -- Monthly plan. Regular visits are standard (offices and shortlets keep their own service); the first visit is a deep clean.
  select * into _pt from public.cleaning_plan_types where slug = coalesce(nullif(_p->>'plan_type', ''), 'care_4') and active;
  if not found then raise exception 'plan_not_found' using errcode = 'P0001'; end if;
  _regular := case when _svc in ('office', 'shortlet') then _svc else 'standard' end;
  _visits := case when _pt.custom then coalesce(nullif(_p->>'visits_per_month', '')::int, _pt.visits_per_month) else _pt.visits_per_month end;
  if _visits < 1 or _visits > 31 then raise exception 'cleaning_invalid_visits' using errcode = 'P0001'; end if;
  _disc := case when _pt.custom then coalesce(nullif(_p->>'discount_pct', '')::numeric, 0) else _pt.discount_pct end;
  _price := private.cl_price(_rate.data, _regular, _cond, _p->'spaces', _p->'addons');
  if (_price->>'subtotal_kobo')::bigint = 0 then raise exception 'cleaning_nothing_to_clean' using errcode = 'P0001'; end if;
  _deep := private.cl_price(_rate.data, 'deep', _cond, _p->'spaces', _p->'addons');
  _crew := private.cl_crew((_price->>'minutes')::int);
  -- the deep first visit uses the same crew, so it simply runs longer
  _dcrew := jsonb_build_object('crew_size', (_crew->>'crew_size')::int,
    'duration_min', least(960, greatest(30, (ceil((_deep->>'minutes')::numeric / (_crew->>'crew_size')::int / 15) * 15)::int)));
  _visit := greatest(_min, (_price->>'subtotal_kobo')::bigint) + (_t->>'fare_kobo')::bigint;
  _first := greatest(_min, (_deep->>'subtotal_kobo')::bigint) + (_t->>'fare_kobo')::bigint;
  _computed_monthly := private.cl_round(
      ((_visit * _visits) + case when _pt.deep_every_months is not null then (_first - _visit)::numeric / _pt.deep_every_months else 0 end)
      * (1 - _disc / 100) * case when _bundle then (1 - _bpct / 100) else 1 end, 50000);
  _monthly := coalesce(_override, _computed_monthly);
  return jsonb_build_object('kind', 'plan', 'service', _regular, 'condition', _cond, 'rate_version_id', _rate.id,
    'lines', _price->'lines', 'deep_lines', _deep->'lines', 'subtotal_kobo', (_price->>'subtotal_kobo')::bigint,
    'transport_kobo', (_t->>'fare_kobo')::bigint, 'transport_waived_kobo', (_t->>'waived_kobo')::bigint,
    'visit_price_kobo', _visit, 'first_deep_kobo', _first, 'crew_size', (_crew->>'crew_size')::int, 'duration_min', (_crew->>'duration_min')::int,
    'deep_crew_size', (_dcrew->>'crew_size')::int, 'deep_duration_min', (_dcrew->>'duration_min')::int,
    'plan_type', _pt.slug, 'plan_type_id', _pt.id, 'plan_name', _pt.name, 'visits_per_month', _visits, 'deep_every_months', _pt.deep_every_months,
    'plan_discount_pct', _disc, 'bundle', _bundle, 'bundle_discount_pct', case when _bundle then _bpct else 0 end,
    'computed_monthly_kobo', _computed_monthly, 'override_kobo', _override, 'monthly_kobo', _monthly,
    'zone_id', _t->>'zone_id', 'distance_km', _t->>'distance_km', 'total_kobo', _first + _monthly);
end $$;

create or replace function public.cleaning_quote_preview(_request uuid, _p jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _r public.cleaning_requests;
begin
  if not private.is_cleaning_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _r from public.cleaning_requests where id = _request;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _r.customer_id is null or _r.property_id is null then raise exception 'cleaning_property_required' using errcode = 'P0001'; end if;
  return private.cl_quote_calc(_r.customer_id, _r.property_id, _p);
end $$;

create or replace function public.cleaning_quote_save(_request uuid, _p jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare _r public.cleaning_requests; _q jsonb; _id uuid; _ver integer; _floor numeric := coalesce((private.cl_set()->>'override_floor_pct')::numeric, 15);
        _computed bigint; _credit bigint;
begin
  if not private.is_cleaning_staff() or not (private.is_cleaning_desk() or private.has_role('inspector')) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _r from public.cleaning_requests where id = _request for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _r.status in ('accepted', 'lost', 'cancelled') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  if _r.customer_id is null or _r.property_id is null then raise exception 'cleaning_property_required' using errcode = 'P0001'; end if;
  _q := private.cl_quote_calc(_r.customer_id, _r.property_id, _p);
  if (_q->>'override_kobo') is not null then
    if length(trim(coalesce(_p->>'override_reason', ''))) < 3 then raise exception 'reason_required' using errcode = 'P0001'; end if;
    _computed := case when _q->>'kind' = 'plan' then (_q->>'computed_monthly_kobo')::bigint else (_q->>'subtotal_kobo')::bigint end;
    if (_q->>'override_kobo')::bigint < _computed * (1 - _floor / 100) and not private.is_super_admin() then
      raise exception 'cleaning_override_needs_super_admin' using errcode = 'P0001';
    end if;
  end if;
  select coalesce(sum(i.fee_kobo), 0) into _credit from public.cleaning_inspections i
   where i.request_id = _request and i.fee_paid and i.fee_kobo > 0;
  update public.cleaning_quotes set status = 'superseded', updated_at = now() where request_id = _request and status in ('draft', 'awaiting_approval', 'sent');
  select coalesce(max(version), 0) + 1 into _ver from public.cleaning_quotes where request_id = _request;
  insert into public.cleaning_quotes (request_id, customer_id, property_id, version, kind, service, condition, spaces, addons, rate_version_id, lines,
    subtotal_kobo, transport_kobo, transport_waived_kobo, override_kobo, override_reason, visit_price_kobo, crew_size, duration_min,
    plan_type_id, visits_per_month, plan_discount_pct, bundle, monthly_kobo, first_deep_kobo, deep_duration_min,
    inspection_credit_kobo, exclusions, notes, status, created_by)
  values (_request, _r.customer_id, _r.property_id, _ver, _q->>'kind', _q->>'service', _q->>'condition', coalesce(_p->'spaces', '{}'::jsonb), coalesce(_p->'addons', '{}'::jsonb),
    (_q->>'rate_version_id')::uuid, case when _q->>'kind' = 'plan' then jsonb_build_object('regular', _q->'lines', 'deep', _q->'deep_lines') else _q->'lines' end,
    (_q->>'subtotal_kobo')::bigint, (_q->>'transport_kobo')::bigint, (_q->>'transport_waived_kobo')::bigint,
    (_q->>'override_kobo')::bigint, nullif(trim(coalesce(_p->>'override_reason', '')), ''), (_q->>'visit_price_kobo')::bigint,
    (_q->>'crew_size')::int, (_q->>'duration_min')::int, nullif(_q->>'plan_type_id', '')::uuid, nullif(_q->>'visits_per_month', '')::int,
    nullif(_q->>'plan_discount_pct', '')::numeric, coalesce((_q->>'bundle')::boolean, false), nullif(_q->>'monthly_kobo', '')::bigint,
    nullif(_q->>'first_deep_kobo', '')::bigint, nullif(_q->>'deep_duration_min', '')::int, _credit,
    nullif(trim(coalesce(_p->>'exclusions', '')), ''), nullif(trim(coalesce(_p->>'notes', '')), ''), 'draft', auth.uid())
  returning id into _id;
  update public.cleaning_requests set status = 'quoting', updated_at = now() where id = _request;
  perform private.cl_event('quote', _id, 'saved', jsonb_build_object('version', _ver, 'total_kobo', _q->'total_kobo'));
  return _id;
end $$;

-- Amount the customer pays to accept (before any inspection credit).
create or replace function private.cl_quote_total(_q public.cleaning_quotes) returns bigint
language sql immutable as $$
  select case when _q.kind = 'plan' then coalesce(_q.first_deep_kobo, 0) + coalesce(_q.monthly_kobo, 0) else _q.visit_price_kobo end
$$;

create or replace function public.cleaning_quote_send(_quote uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare _q public.cleaning_quotes; _limit bigint := private.cl_int('inspector_limit_kobo', 5000000); _days integer := private.cl_int('quote_valid_days', 7)::int;
        _r public.cleaning_requests;
begin
  if not private.is_cleaning_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into _q from public.cleaning_quotes where id = _quote for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if _q.status not in ('draft', 'awaiting_approval') then raise exception 'invalid_step' using errcode = 'P0001'; end if;
  select * into _r from public.cleaning_requests where id = _q.request_id;
  if not private.is_admin() and (private.cl_quote_total(_q) > _limit or _q.override_kobo is not null) then
    update public.cleaning_quotes set status = 'awaiting_approval', updated_at = now() where id = _quote;
    perform private.cl_event('quote', _quote, 'needs_approval', '{}'::jsonb);
    perform private.cl_notify_admin('Cleaning quote #' || _q.quote_no || ' needs your approval',
      jsonb_build_array('Total ₦' || to_char(private.cl_quote_total(_q) / 100, 'FM999,999,999') || case when _q.override_kobo is not null then ' (price changed by staff: ' || coalesce(_q.override_reason, '') || ')' else '' end),
      '/staff/cleaning/requests/' || _q.request_id, 'cleaning-quote-approve-' || _quote);
    return 'awaiting_approval';
  end if;
  update public.cleaning_quotes set status = 'sent', sent_at = now(), valid_until = now() + make_interval(days => _days),
         approved_by = case when private.is_admin() then auth.uid() else approved_by end, updated_at = now() where id = _quote;
  update public.cleaning_requests set status = 'quoted', updated_at = now() where id = _q.request_id;
  perform private.cl_event('quote', _quote, 'sent', '{}'::jsonb);
  perform private.cl_notify_customer(_q.customer_id, 'Your cleaning quote is ready',
    'Quote #' || _q.quote_no || ': ₦' || to_char(private.cl_quote_total(_q) / 100, 'FM999,999,999') || '. It is valid for ' || _days || ' days. Choose your date and pay online to book.',
    null, '/cleaning/quote/' || _quote, 'See the quote and book', 'cleaning-quote-sent-' || _quote);
  return 'sent';
end $$;

create or replace function public.cleaning_quote_approve(_quote uuid)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return public.cleaning_quote_send(_quote);
end $$;
