/** The two ways a garment can be handled. Dry clean is the full price; iron only is a share of it set in Admin > Price list. */
export type Service = "dry_clean" | "iron_only";

export const SERVICE_LABEL: Record<Service, string> = { dry_clean: "Dry clean", iron_only: "Iron only" };

/** Order lines are keyed by item for dry clean and by item plus a tag for iron only, so one item can appear twice on an order. */
export function lineKey(itemId: string, service: Service | string | null | undefined): string {
  return service === "iron_only" ? `${itemId}~iron` : itemId;
}

export function parseLineKey(key: string): { item: string; service: Service } {
  const [item, tag] = key.split("~");
  return { item, service: tag === "iron" ? "iron_only" : "dry_clean" };
}

/** Same rule as private.service_price_kobo: share of the dry-clean price, rounded to the nearest 50 naira, never below the minimum and never above the dry-clean price. */
export function ironOnlyKobo(dryCleanKobo: number, pct: number, minKobo: number): number {
  const rounded = Math.round((dryCleanKobo * pct) / 100 / 5000) * 5000;
  return Math.min(dryCleanKobo, Math.max(rounded, minKobo));
}

/** Name shown for a line; order_items.name already carries this suffix for iron-only lines. */
export const lineName = (name: string, service: Service) => (service === "iron_only" ? `${name} (iron only)` : name);

/** Plain-words instant delivery rate, for example "300 naira per dry clean item and 200 naira per iron only item". */
export function instantRateText(fmt: (kobo: number) => string, perDry: number, perIron: number, dryItems: number, ironItems: number): string {
  if (ironItems === 0 || perDry === perIron) return `${fmt(perDry)} more per item`;
  if (dryItems === 0) return `${fmt(perIron)} more per iron only item`;
  return `${fmt(perDry)} more per dry clean item and ${fmt(perIron)} per iron only item`;
}
