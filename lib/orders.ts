export const STATUS_LABEL: Record<string, string> = {
  awaiting_fare_payment: "Waiting for your pickup fare",
  awaiting_dispatch: "Awaiting agent assignment",
  agent_assigned: "Agent on the way",
  agent_arrived: "Agent counting your clothes",
  counted: "Garment count recorded",
  count_confirmed: "Confirmed for processing",
  received: "Received and checked at our hub",
  in_house: "Being washed",
  ready: "Ready",
  awaiting_delivery_fare: "Waiting for delivery fare",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  closed: "Closed",
  failed_delivery: "Delivery failed",
  cancelled: "Cancelled",
};

/** The steps a customer sees, in order, and which statuses count as having reached each. */
export const CUSTOMER_STEPS = [
  { label: "Pickup requested", reached: ["awaiting_dispatch", "agent_assigned", "agent_arrived", "counted", "count_confirmed", "received", "in_house", "ready", "out_for_delivery", "delivered", "closed"] },
  { label: "Agent assigned", reached: ["agent_assigned", "agent_arrived", "counted", "count_confirmed", "received", "in_house", "ready", "out_for_delivery", "delivered", "closed"] },
  { label: "Agent at your door", reached: ["agent_arrived", "counted", "count_confirmed", "received", "in_house", "ready", "out_for_delivery", "delivered", "closed"] },
  { label: "Garments counted", reached: ["counted", "count_confirmed", "received", "in_house", "ready", "out_for_delivery", "delivered", "closed"] },
  { label: "Confirmed", reached: ["count_confirmed", "received", "in_house", "ready", "out_for_delivery", "delivered", "closed"] },
  { label: "Received at hub", reached: ["received", "in_house", "ready", "out_for_delivery", "delivered", "closed"] },
  { label: "Washed and ready", reached: ["ready", "out_for_delivery", "delivered", "closed"] },
  { label: "Delivered", reached: ["delivered", "closed"] },
];

export function duration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export const mapsLink = (lat: number | null, lng: number | null) => (lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null);

export type Step = { key: string; label: string; at: string; by: string | null; seconds_from_previous: number | null };
export type Timeline = { booked_at: string; steps: Step[]; agent: string | null };
