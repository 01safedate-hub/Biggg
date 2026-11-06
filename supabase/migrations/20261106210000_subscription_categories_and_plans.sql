-- Subscription redesign, part 2: categories that plans can cap, and the new plan ladder.
-- Plans work by category: a category missing from category_limits is ordinary
-- daily wear and only counts against the plan's total pieces; a number caps that
-- category per monthly cycle (pieces above the cap are billed at their own price);
-- 0 excludes it (billed at full catalogue price).

alter table public.plans add column if not exists requires_student_id boolean not null default false;
alter table public.plans add column if not exists audience text not null default 'household';
alter table public.plans drop constraint if exists plans_audience_check;
alter table public.plans add constraint plans_audience_check check (audience in ('student','household','business'));

-- New categories ------------------------------------------------------------
insert into public.item_categories (name, slug, sort_order, active) values
  ('School uniforms', 'school-uniforms', 13, true),
  ('School blazers', 'school-blazers', 14, true),
  ('School accessories', 'school-accessories', 15, true),
  ('Shoes', 'shoes', 16, true),
  ('Curtains', 'curtains', 17, true),
  ('Heavy bedding and rugs', 'heavy-bedding', 18, true),
  ('Heavy coats', 'heavy-coats', 19, true)
on conflict (slug) do update set name = excluded.name, active = true;

update public.item_categories set name = 'Bags and soft toys', slug = 'bags' where slug = 'footwear-bags';
update public.item_categories set name = 'Bedding and linen' where slug = 'bedding-home';
update public.item_categories set name = 'Light jackets' where slug = 'outerwear';

-- Move items ----------------------------------------------------------------
update public.items set category_id = (select id from public.item_categories where slug = 'shoes')
 where name in ('Slippers','Canvas shoes','Leather shoes','Boots','Sneakers');
update public.items set category_id = (select id from public.item_categories where slug = 'curtains')
 where name in ('Net curtain','Curtain panel');
update public.items set category_id = (select id from public.item_categories where slug = 'heavy-bedding')
 where name in ('Pillow','Throw blanket','Duvet','Blanket','Mattress cover','Rug');
update public.items set category_id = (select id from public.item_categories where slug = 'heavy-coats')
 where name in ('Puffer jacket','Winter coat','Leather jacket','Overcoat');
update public.items
   set category_id = (select id from public.item_categories where slug = 'school-uniforms'),
       name = 'School uniform set',
       description = 'Shirt or blouse with trousers, shorts or skirt, and socks',
       search_terms = 'school uniform set shirt trouser skirt shorts socks pinafore'
 where name in ('School uniform','School uniform set');

insert into public.items (category_id, name, price_kobo, active, sort_order, description, search_terms, iron_only_allowed)
select c.id, v.name, v.price, true, v.sort, v.descr, v.terms, true
  from (values
    ('school-blazers', 'School blazer', 150000, 1, 'School or law school blazer', 'blazer school law jacket'),
    ('school-accessories', 'School tie', 25000, 1, 'School or law school tie', 'tie school'),
    ('school-accessories', 'School cap or beret', 30000, 2, null, 'cap beret school hat'),
    ('school-accessories', 'School cardigan or sweater', 60000, 3, null, 'cardigan sweater jumper school')
  ) as v(cat, name, price, sort, descr, terms)
  join public.item_categories c on c.slug = v.cat
 where not exists (select 1 from public.items i where i.name = v.name);

-- Plans -----------------------------------------------------------------------
-- Every category slug, so student plans can exclude everything they don't cover.
create temporary table _all_cats on commit drop as select slug from public.item_categories;

create or replace function pg_temp.all_zero(_except text[]) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(slug, 0), '{}'::jsonb) from _all_cats where not (slug = any(_except))
$$;

insert into public.plans (name, slug, blurb, monthly_price_kobo, pieces_per_month, weekly_allowance, overage_price_kobo,
  active, sort_order, category_limits, monthly_discount_pct, three_month_discount_pct, six_month_discount_pct, yearly_discount_pct,
  pickups_per_month, requires_student_id, audience)
values
  ('Student Basic', 'student_basic', 'School uniforms only. Drop off at the hub or book a paid pickup.', 1000000, 30, 30, 0,
   true, 1, pg_temp.all_zero(array['school-uniforms']) || '{"school-uniforms":30}', 0, 2, 5, 10, 0, true, 'student'),
  ('Student Plus', 'student_plus', 'Uniforms, blazers, school accessories and shoe washes.', 2000000, 70, 70, 0,
   true, 2, pg_temp.all_zero(array['school-uniforms','school-blazers','school-accessories','shoes'])
     || '{"school-uniforms":30,"school-blazers":7,"school-accessories":30,"shoes":3}', 0, 2, 5, 10, 0, true, 'student'),
  ('Small Family', 'small_family', 'A small family: everyday clothes plus some bedding and curtains.', 6000000, 150, 75, 0,
   true, 5, '{"bedding-home":15,"curtains":6,"shoes":4,"native-wear":4,"suits-formal":4,"heavy-bedding":0,"heavy-coats":0,"bags":0}', 0, 2, 5, 10, 2, false, 'household'),
  ('Big Family', 'big_family', 'A big household with bedding, curtains and native wear.', 11000000, 300, 150, 0,
   true, 6, '{"bedding-home":30,"curtains":15,"shoes":10,"native-wear":12,"suits-formal":8,"heavy-coats":2,"heavy-bedding":0,"bags":0}', 0, 2, 5, 10, 2, false, 'household'),
  ('Heavy Duty', 'heavy_duty', 'Everything, including duvets, blankets and rugs.', 18000000, 450, 225, 0,
   true, 7, '{"bedding-home":40,"curtains":15,"heavy-bedding":5,"shoes":10,"native-wear":20,"suits-formal":15,"heavy-coats":5,"bags":0}', 0, 2, 5, 10, 2, false, 'household'),
  ('Business', 'business', 'Hostels, salons, guest houses and offices.', 21000000, 600, 300, 0,
   true, 8, '{"bedding-home":80,"curtains":20,"shoes":30,"native-wear":30,"suits-formal":20,"heavy-coats":5,"heavy-bedding":0,"bags":0}', 0, 2, 5, 10, 4, false, 'business')
on conflict (slug) do update set
  name = excluded.name, blurb = excluded.blurb, monthly_price_kobo = excluded.monthly_price_kobo,
  pieces_per_month = excluded.pieces_per_month, weekly_allowance = excluded.weekly_allowance,
  active = true, sort_order = excluded.sort_order, category_limits = excluded.category_limits,
  pickups_per_month = excluded.pickups_per_month, requires_student_id = excluded.requires_student_id,
  audience = excluded.audience;

update public.plans set
  name = 'Starter', blurb = 'One person or a small flat: everyday clothes and a little bedding.',
  monthly_price_kobo = 3000000, pieces_per_month = 70, weekly_allowance = 35, sort_order = 3,
  category_limits = '{"bedding-home":6,"curtains":0,"heavy-bedding":0,"heavy-coats":0,"shoes":0,"bags":0,"native-wear":0,"suits-formal":0}',
  pickups_per_month = 2, requires_student_id = false, audience = 'household', active = true
 where slug = 'starter';

update public.plans set
  name = 'Pro', blurb = 'Office and formal wear: suits count as normal pieces.',
  monthly_price_kobo = 5500000, pieces_per_month = 120, weekly_allowance = 60, sort_order = 4,
  category_limits = '{"shoes":6,"heavy-coats":2,"native-wear":4,"bedding-home":0,"curtains":0,"heavy-bedding":0,"bags":0}',
  pickups_per_month = 2, requires_student_id = false, audience = 'household', active = true
 where slug = 'pro';

-- Replaced by Small Family / Big Family / Heavy Duty / Business. Existing rows
-- stay for history; nobody can buy them.
update public.plans set active = false where slug in ('family_bond', 'family_max');
