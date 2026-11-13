-- Crew app: include the customer id so visit photos can be filed under visits/<customer>/<visit>/.
create or replace function public.my_cleaning_jobs(_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare _d date := coalesce(_date, (now() at time zone 'Africa/Lagos')::date);
begin
  if not private.is_cleaning_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'visit_no', v.visit_no, 'date', v.scheduled_date, 'window', v.time_window, 'start_time', v.start_time,
      'status', v.status, 'kind', v.kind, 'customer_id', v.customer_id, 'balance_due_kobo', v.balance_due_kobo, 'service', v.service, 'duration_min', v.duration_min, 'crew_size', v.crew_size, 'my_role', mc.role,
      'customer', c.full_name, 'phone', c.phone, 'address', p.address, 'lat', p.lat, 'lng', p.lng, 'property', jsonb_build_object('kind', p.kind, 'water', p.water_note, 'power', p.power_note,
        'access', p.access_note, 'keys_allowed', p.keys_allowed, 'key_holder', p.key_holder, 'pets', p.pets, 'estate', p.estate_name, 'gate', p.gate_contact, 'people', p.people_note),
      'bundle_laundry', v.bundle_laundry, 'checklist', v.checklist, 'before', cardinality(v.before_photos), 'after', cardinality(v.after_photos),
      'lines', coalesce(case when q.kind = 'plan' then (case when v.service = 'deep' then q.lines->'deep' else q.lines->'regular' end) else q.lines end, '[]'::jsonb),
      'crew', (select jsonb_agg(jsonb_build_object('name', s.full_name, 'role', vc.role)) from public.cleaning_visit_crew vc join public.profiles s on s.id = vc.staff_id where vc.visit_id = v.id),
      'extras', (select jsonb_agg(jsonb_build_object('id', e.id, 'amount_kobo', e.amount_kobo, 'status', e.status, 'lines', e.lines)) from public.cleaning_extras e where e.visit_id = v.id))
      order by v.time_window, v.start_time nulls last)
    from public.cleaning_visits v
    join public.cleaning_visit_crew mc on mc.visit_id = v.id and mc.staff_id = auth.uid()
    join public.profiles c on c.id = v.customer_id join public.cleaning_properties p on p.id = v.property_id
    left join public.cleaning_quotes q on q.id = v.quote_id
   where v.scheduled_date = _d and v.status not in ('cancelled', 'held')), '[]'::jsonb);
end $$;
