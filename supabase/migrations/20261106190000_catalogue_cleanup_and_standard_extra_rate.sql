-- 1. Dresses group: Dress, Evening gown and Jumpsuit leave Bottoms. No plan limits Bottoms or Dresses, so subscription counting is unchanged.
--    Wedding gown and Bridesmaid dress stay in Suits and formal, which Starter and Pro exclude, so their billing is unchanged.
do $m$
begin
  if not exists (select 1 from public.item_categories where slug = 'dresses') then
    update public.item_categories set sort_order = sort_order + 1 where sort_order >= 3;
    insert into public.item_categories (name, slug, sort_order, active) values ('Dresses', 'dresses', 3, true);
  end if;
end $m$;
update public.items set category_id = (select id from public.item_categories where slug = 'dresses')
 where name in ('Dress', 'Evening gown', 'Jumpsuit')
   and category_id = (select id from public.item_categories where slug = 'bottoms');

-- 2. Items that cannot be ironed alone (shoes, bags, rugs, pillows, blankets and similar) never offer iron only.
alter table public.items add column if not exists iron_only_allowed boolean not null default true;
update public.items set iron_only_allowed = false
 where category_id = (select id from public.item_categories where slug = 'footwear-bags')
    or name in ('Pillow', 'Soft toy', 'Bath mat', 'Rug', 'Blanket', 'Baby blanket', 'Throw blanket', 'Duvet', 'Mattress cover');

-- item_service_prices: iron_only_kobo is null when iron only is not allowed for the item.
drop function if exists public.item_service_prices();
create function public.item_service_prices()
returns table(item_id uuid, dry_clean_kobo bigint, iron_only_kobo bigint)
language sql
stable security definer
set search_path = ''
as $function$
  select i.id, private.service_price_kobo(i.id, 'dry_clean'),
         case when i.iron_only_allowed then private.service_price_kobo(i.id, 'iron_only') else null end
    from public.items i where i.active
$function$;
revoke execute on function public.item_service_prices() from public, anon;
grant execute on function public.item_service_prices() to authenticated;

do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.agent_set_item(uuid, uuid, integer, text)'::regprocedure);
  n := replace(d, $r$if _qty is null or _qty < 0 or _qty > 200 then raise exception 'invalid_qty' using errcode = 'P0001'; end if;$r$,
    $r$if _qty is null or _qty < 0 or _qty > 200 then raise exception 'invalid_qty' using errcode = 'P0001'; end if;
  if _svc = 'iron_only' and _qty > 0 and exists (select 1 from public.items where id = _item and not iron_only_allowed) then raise exception 'iron_only_not_allowed' using errcode = 'P0001'; end if;$r$);
  if n = d then raise exception 'agent_set_item patch did not apply'; end if;
  execute n;
  d := pg_get_functiondef('public.desk_set_item(uuid, uuid, integer, text)'::regprocedure);
  n := replace(d, $r$if _qty is null or _qty < 0 or _qty > 200 then raise exception 'invalid_qty' using errcode = 'P0001'; end if;$r$,
    $r$if _qty is null or _qty < 0 or _qty > 200 then raise exception 'invalid_qty' using errcode = 'P0001'; end if;
  if _svc = 'iron_only' and _qty > 0 and exists (select 1 from public.items where id = _item and not iron_only_allowed) then raise exception 'iron_only_not_allowed' using errcode = 'P0001'; end if;$r$);
  if n = d then raise exception 'desk_set_item patch did not apply'; end if;
  execute n;
end $m$;

-- 3. Subscription pieces above the allowance are billed at the standard price of the pickup's eligible pieces
--    (their average catalogue price on that pickup) instead of the flat plans.overage_price_kobo, which is no longer used.
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('private.finalize_subscription_pickup_count()'::regprocedure);
  n := replace(d, $r$_price := greatest(0, coalesce(_plan.overage_price_kobo,0));$r$,
    $r$select coalesce(round(sum(oi.line_total_kobo)::numeric / nullif(sum(oi.qty), 0)), 0)::bigint into _price
    from public.order_items oi left join public.items i on i.id = oi.item_id left join public.item_categories ic on ic.id = i.category_id
   where oi.order_id = new.id and oi.removed_at is null
     and not (_plan.category_limits ? lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g'))
              and coalesce((_plan.category_limits ->> lower(regexp_replace(coalesce(ic.slug, oi.category_name, 'uncategorized'), '[^a-z0-9]+', '-', 'g')))::integer, 0) = 0);$r$);
  if n = d then raise exception 'finalize_subscription_pickup_count patch did not apply'; end if;
  execute n;
end $m$;
