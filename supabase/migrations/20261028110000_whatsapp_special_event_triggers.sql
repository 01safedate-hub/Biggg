-- Enqueue WhatsApp utility templates from non-status order events already handled by the system.
-- Existing functions remain the source of truth; these triggers only append to the transactional outbox.

create or replace function private.enqueue_special_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  onum bigint;
  customer uuid;
  evt text;
  tmpl text;
  vars jsonb;
  key text;
begin
  if tg_table_name = 'order_events' then
    if new.event not in ('pickup_failed','delivery_failed','instant_late') then return null; end if;
    select o.order_no, o.customer_id into onum, customer from public.orders o where o.id = new.order_id;
    if not found then return null; end if;
    evt := case new.event
      when 'pickup_failed' then 'delivery_failed'
      when 'delivery_failed' then 'delivery_failed'
      when 'instant_late' then 'instant_late'
    end;
    tmpl := evt;
    vars := jsonb_build_object('template_params', jsonb_build_array(
      onum::text,
      coalesce(new.detail->>'reason', new.detail->>'outcome', ''),
      'https://laundrypoint.app/orders/'||new.order_id::text
    ));
    key := 'wa-event-'||new.id::text;
    perform private.enqueue_whatsapp(customer,new.order_id,evt,tmpl,vars,now(),'{}'::jsonb,key);
    return null;
  elsif tg_table_name = 'demurrage_cases' then
    select o.order_no, o.customer_id into onum, customer
      from public.orders o where o.id = new.order_id;
    if not found then return null; end if;
    if new.warned_at is not null and old.warned_at is null then
      perform private.enqueue_whatsapp(customer,new.order_id,'storage_warning','storage_warning',
        jsonb_build_object('template_params',jsonb_build_array(onum::text, to_char(new.fee_kobo/100.0,'FM999999990.00'))),
        now(),'{}'::jsonb,'wa-demurrage-warn-'||new.id::text);
    end if;
    if new.started_notice_at is not null and old.started_notice_at is null then
      perform private.enqueue_whatsapp(customer,new.order_id,'storage_started','storage_started',
        jsonb_build_object('template_params',jsonb_build_array(onum::text, to_char(new.fee_kobo/100.0,'FM999999990.00'))),
        now(),'{}'::jsonb,'wa-demurrage-start-'||new.id::text);
    end if;
    return null;
  end if;
  return null;
end;
$$;

drop trigger if exists order_events_whatsapp_outbox on public.order_events;
create trigger order_events_whatsapp_outbox
after insert on public.order_events
for each row execute function private.enqueue_special_whatsapp();

drop trigger if exists demurrage_cases_whatsapp_outbox on public.demurrage_cases;
create trigger demurrage_cases_whatsapp_outbox
after update of warned_at, started_notice_at on public.demurrage_cases
for each row execute function private.enqueue_special_whatsapp();

-- Record that the opt-in originated from an explicit customer choice and pass it from signup.
-- A default false preserves consent safety for existing customers and desk-only profiles.
