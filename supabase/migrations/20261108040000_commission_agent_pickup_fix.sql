-- Fix: a booking by a customer whose referring agent is a verified commission agent failed with a foreign-key error.
-- The BEFORE INSERT trigger wrote the agent's "New pickup for your customer" notification pointing at the new order,
-- which does not exist yet at that moment. No such booking had happened yet, so nothing was lost.
-- Also: only real pickups (an order with a pickup location) go to the referring agent. Walk-in orders and desk drop-offs
-- are handed in at the hub, so no agent is assigned to them and no pickup notification is sent.

create or replace function private.assign_commission_agent_pickup()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare _owner uuid;
begin
  if new.pickup_agent_id is null and new.source <> 'walk_in' and new.pickup_lat is not null then
    select onboarded_by into _owner from public.profiles where id = new.customer_id;
    if private.is_verified_commission_agent(_owner) then
      new.pickup_agent_id := _owner;
      if new.status = 'awaiting_dispatch' then
        new.status := 'agent_assigned';
      end if;
    end if;
  end if;
  return new;
end
$$;

-- The notification, once the order row exists.
create or replace function private.notify_commission_agent_pickup()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.pickup_agent_id is not null and new.source <> 'walk_in' and new.pickup_lat is not null
     and new.pickup_agent_id = (select onboarded_by from public.profiles where id = new.customer_id)
     and private.is_verified_commission_agent(new.pickup_agent_id) then
    insert into public.user_notifications (user_id, title, body, kind, order_id)
    values (new.pickup_agent_id, 'New pickup for your customer',
            'A customer you onboarded has booked a pickup. Check the scheduled time and complete the pickup in your jobs.',
            'job', new.id);
  end if;
  return null;
end
$$;
revoke all on function private.notify_commission_agent_pickup() from public, anon, authenticated;

drop trigger if exists orders_commission_agent_pickup_notify on public.orders;
create trigger orders_commission_agent_pickup_notify
  after insert on public.orders
  for each row execute function private.notify_commission_agent_pickup();
