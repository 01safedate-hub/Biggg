-- The agreed subscription overage price is ₦150 per garment for every plan.
-- Values are stored in kobo: ₦150 = 15,000 kobo.
update public.plans
   set overage_price_kobo = 15000
 where overage_price_kobo is distinct from 15000;
