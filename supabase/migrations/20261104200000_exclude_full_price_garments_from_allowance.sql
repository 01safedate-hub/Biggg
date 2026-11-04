-- Track excluded garment quantity separately so it never consumes the eligible monthly allowance.
alter table public.subscription_pickups
  add column if not exists excluded_pieces integer not null default 0
  check (excluded_pieces >= 0);

do $migration$
declare
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef('private.finalize_subscription_pickup_count()'::regprocedure);

  updated_definition := replace(
    definition,
    'coalesce(prior.pieces_counted, 0) - coalesce(prior.overage_pieces, 0)',
    'coalesce(prior.pieces_counted, 0) - coalesce(prior.overage_pieces, 0) - coalesce(prior.excluded_pieces, 0)'
  );
  updated_definition := replace(
    updated_definition,
    'excluded_kobo = _excluded_kobo, status = ''collected''',
    'excluded_kobo = _excluded_kobo, excluded_pieces = _excluded_pieces, status = ''collected'''
  );

  if updated_definition = definition then
    raise exception 'Could not patch subscription pickup allowance accounting function';
  end if;

  execute updated_definition;
end
$migration$;

comment on column public.subscription_pickups.excluded_pieces is
  'Number of excluded-category garments charged at full catalogue price; excluded from the monthly eligible-piece allowance.';
