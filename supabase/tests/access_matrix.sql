-- Role access matrix. Run it in the Supabase SQL editor (or through any SQL runner) after every migration.
-- It builds fake users inside one transaction, tries things each role must NOT be able to do, and ALWAYS ends with an
-- error whose text starts with RESULT. Nothing is ever saved. Read the text:  "ALL PASS"  or  "FAILURES: ..."
do $$
declare
  _cust uuid := gen_random_uuid(); _other uuid := gen_random_uuid(); _agent uuid := gen_random_uuid();
  _sec uuid := gen_random_uuid(); _adm uuid := gen_random_uuid(); _sup uuid := gen_random_uuid();
  _o uuid; _fail text := ''; _n int := 0; _id uuid; _removed int;
begin
  insert into auth.users (id, instance_id, aud, role, email)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'matrix-' || u || '@example.com'
  from unnest(array[_cust, _other, _agent, _sec, _adm, _sup]) u;
  insert into public.user_roles (user_id, role) values (_agent, 'delivery_agent'), (_sec, 'secretary'), (_adm, 'admin'), (_sup, 'super_admin');
  insert into public.orders (customer_id, status, source) values (_cust, 'awaiting_dispatch', 'online') returning id into _o;

  -- run one probe: who (uuid), label, sql, must_block
  create temp table _probe (who uuid, who_name text, what text, sql text, must_block boolean) on commit drop;
  insert into _probe values
    (_cust, 'customer', 'find desk customers',       'select public.desk_find_customer(''08012345678'')', true),
    (_cust, 'customer', 'save slot settings',        'select public.save_slot_settings(true,60,7,120,4)', true),
    (_cust, 'customer', 'read dispute evidence',     'select public.dispute_evidence(gen_random_uuid())', true),
    (_cust, 'customer', 'resolve a dispute',         'select public.resolve_dispute(gen_random_uuid(),''won'',''abc'')', true),
    (_cust, 'customer', 'open a dispute',            'select public.open_dispute(gen_random_uuid(),''abc'',null)', true),
    (_cust, 'customer', 'send agent location',       'select public.agent_ping(''' || _o || ''', 6.5, 3.3, 10)', true),
    (_cust, 'customer', 'create a walk-in order',    'select public.desk_create_walkin_order(''' || _other || ''', '''')', true),
    (_cust, 'customer', 'assign an agent',           'select public.assign_pickup_agent(''' || _o || ''', ''' || _agent || ''')', true),
    (_other, 'other customer', 'see where the agent is on someone else''s order', 'select public.order_agent_location(''' || _o || ''')', true),
    (_other, 'other customer', 'reschedule someone else''s pickup', 'select public.reschedule_pickup(''' || _o || ''', now() + interval ''2 days'')', true),
    (_other, 'other customer', 'remove promo from someone else''s order', 'select public.remove_promo(''' || _o || ''')', true),
    (_agent, 'agent', 'find desk customers',         'select public.desk_find_customer(''08012345678'')', true),
    (_agent, 'agent', 'save slot settings',          'select public.save_slot_settings(true,60,7,120,4)', true),
    (_agent, 'agent', 'resolve a dispute',           'select public.resolve_dispute(gen_random_uuid(),''won'',''abc'')', true),
    (_agent, 'agent', 'assign an agent',             'select public.assign_pickup_agent(''' || _o || ''', ''' || _agent || ''')', true),
    (_sec, 'secretary', 'save slot settings',        'select public.save_slot_settings(true,60,7,120,4)', true),
    (_sec, 'secretary', 'read dispute evidence',     'select public.dispute_evidence(gen_random_uuid())', true),
    (_sec, 'secretary', 'resolve a dispute',         'select public.resolve_dispute(gen_random_uuid(),''won'',''abc'')', true),
    (_sec, 'secretary', 'save dispatch settings',    'select public.save_dispatch_settings(true,4,45,true)', true),
    (_sec, 'secretary', 'find desk customers',       'select public.desk_find_customer(''08012345678'')', false),
    (_adm, 'admin', 'save slot settings',            'select public.save_slot_settings(true,60,7,120,4)', true),
    (_adm, 'admin', 'resolve a dispute',             'select public.resolve_dispute(gen_random_uuid(),''won'',''abc'')', true),
    (_adm, 'admin', 'find desk customers',           'select public.desk_find_customer(''08012345678'')', false),
    (_sup, 'super admin', 'save slot settings',      'select public.save_slot_settings(true,60,7,120,4)', false);

  declare _p record; _blocked boolean;
  begin
    for _p in select * from _probe loop
      perform set_config('request.jwt.claims', json_build_object('sub', _p.who, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', _p.who::text, true);
      _blocked := false;
      begin
        set local role authenticated;
        execute _p.sql;
      exception when others then _blocked := true;
      end;
      reset role;
      _n := _n + 1;
      -- "not found" style refusals on made-up ids count as blocked for must_block rows, and as fine for allowed rows
      if _blocked <> _p.must_block then _fail := _fail || _p.who_name || ' / ' || _p.what || ' (expected ' || case when _p.must_block then 'refused' else 'allowed' end || '); '; end if;
    end loop;
  end;

  -- row level security: who can read what
  perform set_config('request.jwt.claims', json_build_object('sub', _other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', _other::text, true);
  set local role authenticated;
  _n := _n + 1; if (select count(*) from public.orders where id = _o) <> 0 then _fail := _fail || 'other customer can read someone else''s order; '; end if;
  _n := _n + 1; if (select count(*) from public.payment_disputes) <> 0 then _fail := _fail || 'customer can read disputes; '; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', _cust, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', _cust::text, true);
  set local role authenticated;
  _n := _n + 1; if (select count(*) from public.orders where id = _o) <> 1 then _fail := _fail || 'customer cannot read their own order; '; end if;
  _n := _n + 1; begin update public.orders set status = 'delivered' where id = _o; if found then _fail := _fail || 'customer can change their order status directly; '; end if; exception when others then null; end;
  _n := _n + 1; begin insert into public.payments (order_id, customer_id, purpose, kind, mode, amount_kobo, reference, status) values (_o, _cust, 'items', 'payment', 'cash', 100, 'MATRIX-X', 'success'); _fail := _fail || 'customer can insert a payment; '; exception when others then null; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', _sup, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', _sup::text, true);
  set local role authenticated;
  _n := _n + 1; if (select count(*) from public.orders where id = _o) <> 1 then _fail := _fail || 'super admin cannot read orders; '; end if;
  reset role;

  -- a shift that already started, or has attendance, cannot be removed
  insert into public.shifts (staff_id, shift_date, starts_at, ends_at)
  values (_agent, private.today_lagos(), now() - interval '1 hour', now() + interval '5 hours') returning id into _id;
  perform set_config('request.jwt.claims', json_build_object('sub', _sec, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', _sec::text, true);
  set local role authenticated;
  _n := _n + 1;
  with gone as (delete from public.shifts where id = _id returning 1) select count(*) into _removed from gone;
  if _removed <> 0 then _fail := _fail || 'a shift that already started was removed; '; end if;
  reset role;

  raise exception 'RESULT %', case when _fail = '' then 'ALL PASS (' || _n || ' checks)' else 'FAILURES: ' || _fail end;
end $$;
