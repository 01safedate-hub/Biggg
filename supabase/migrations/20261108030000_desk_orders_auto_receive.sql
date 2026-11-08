-- Walk-in orders and desk subscription drop-offs are counted in front of the customer at the hub, so the separate
-- Receiving check is a repeat of work already done. Once such an order is paid (or needs no payment) and reaches
-- count_confirmed, move it straight to received so it lands in the wash queue.
-- Agent pickups (online orders and subscription pickups from a customer's address) are untouched: the bag still has to
-- reach the hub and be checked on the Receiving page.
-- The trigger is named zz_ so it runs after every other AFTER trigger on orders: the count_confirmed events, emails and
-- WhatsApp messages are written first, then the received ones, in the right order.
create or replace function private.desk_order_auto_receive()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'count_confirmed' or old.status = 'count_confirmed' then return null; end if;
  if not (new.source = 'walk_in'
          or (new.source = 'subscription' and new.pickup_lat is null and new.subscription_pickup_id is not null)) then
    return null;
  end if;
  -- Same money rule as mark_received: a walk-in with anything still owed waits for the desk.
  if new.source <> 'subscription' and private.items_due(new.id) > 0 then return null; end if;
  update public.order_items
     set check_state = 'ok', check_note = coalesce(check_note, 'Counted in front of the customer at the desk')
   where order_id = new.id and removed_at is null and check_state <> 'ok';
  update public.orders set status = 'received' where id = new.id and status = 'count_confirmed';
  return null;
end
$$;
revoke all on function private.desk_order_auto_receive() from public, anon, authenticated;

drop trigger if exists zz_orders_desk_auto_receive on public.orders;
create trigger zz_orders_desk_auto_receive
  after update of status on public.orders
  for each row when (new.status = 'count_confirmed' and old.status is distinct from new.status)
  execute function private.desk_order_auto_receive();
