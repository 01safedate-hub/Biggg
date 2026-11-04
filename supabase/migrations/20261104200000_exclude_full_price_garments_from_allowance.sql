-- Track excluded garment quantity separately so it never consumes the eligible monthly allowance.
alter table public.subscription_pickups
  add column if not exists excluded_pieces integer not null default 0
  check (excluded_pieces >= 0);

-- Backfill previously collected pickups from their recorded order items.
update public.subscription_pickups sp
set excluded_pieces = coalesce((
  select sum(oi.qty)::integer
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  left join public.items i on i.id = oi.item_id
  left join public.item_categories ic on ic.id = i.category_id
  join public.subscriptions s on s.id = sp.subscription_id
  join public.plans p on p.id = s.plan_id
  where o.subscription_pickup_id = sp.id
    and oi.removed_at is null
    and p.category_limits ? lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g'))
    and coalesce((p.category_limits ->> lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')))::integer, 0) = 0
), 0)
where sp.status not in ('missed','skipped');

-- Exclude both eligible overage and full-price excluded garments from prior
-- monthly usage, and persist excluded garment quantity for each pickup.
do $migration$
declare
  definition text;
  updated_definition text;
  old_usage text := 'coalesce(prior.pieces_counted, 0) - coalesce(prior.overage_pieces, 0)';
  new_usage text := 'coalesce(prior.pieces_counted, 0) - coalesce(prior.overage_pieces, 0) - coalesce(prior.excluded_pieces, 0)';
  old_update text := 'overage_kobo = _overage::bigint * _price, excluded_kobo = _excluded_kobo, status = ''collected''';
  new_update text := 'overage_kobo = _overage::bigint * _price, excluded_kobo = _excluded_kobo, excluded_pieces = _excluded_pieces, status = ''collected''';
begin
  definition := pg_get_functiondef('private.finalize_subscription_pickup_count()'::regprocedure);
  if position(old_usage in definition) = 0 then
    raise exception 'Expected prior allowance expression was not found; migration stopped safely';
  end if;
  if position(old_update in definition) = 0 then
    raise exception 'Expected pickup update statement was not found; migration stopped safely';
  end if;
  updated_definition := replace(definition, old_usage, new_usage);
  updated_definition := replace(updated_definition, old_update, new_update);
  execute updated_definition;
end
$migration$;

comment on column public.subscription_pickups.excluded_pieces is
  'Excluded-category garments charged at full catalogue price; these do not consume the eligible monthly plan allowance.';
