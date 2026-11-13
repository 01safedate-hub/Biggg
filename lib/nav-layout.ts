// Applies a person's saved menu layout (pinned items and their own order) to the default menu.
// Pages added later keep their default place; pages that no longer exist are ignored.
import type { NavGroup, NavItem } from "@/components/admin/Sidebar";

export type NavLayout = { pinned: string[]; order: Record<string, string[]> };
export const PINNED_LABEL = "Pinned";
export const MAX_PINS = 12;

export function emptyLayout(): NavLayout {
  return { pinned: [], order: {} };
}

export function cleanLayout(raw: unknown): NavLayout {
  const r = (raw && typeof raw === "object" ? raw : {}) as { pinned?: unknown; order?: unknown };
  const pinned = Array.isArray(r.pinned) ? r.pinned.filter((x): x is string => typeof x === "string").slice(0, MAX_PINS) : [];
  const order: Record<string, string[]> = {};
  if (r.order && typeof r.order === "object") {
    for (const [k, v] of Object.entries(r.order as Record<string, unknown>)) {
      if (Array.isArray(v)) order[k] = v.filter((x): x is string => typeof x === "string");
    }
  }
  return { pinned, order };
}

function dedupe(items: NavItem[]): NavItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.href) ? false : (seen.add(i.href), true)));
}

// Saved order first; items the person has never arranged keep their default position.
function arrange(items: NavItem[], saved: string[] | undefined): NavItem[] {
  if (!saved?.length) return items;
  const byHref = new Map(items.map((i) => [i.href, i]));
  const known = saved.map((h) => byHref.get(h)).filter((i): i is NavItem => !!i);
  const knownSet = new Set(known.map((i) => i.href));
  const out = [...known];
  items.forEach((i, idx) => {
    if (!knownSet.has(i.href)) out.splice(Math.min(idx, out.length), 0, i);
  });
  return out;
}

export function applyLayout(groups: NavGroup[], layout: NavLayout | null): NavGroup[] {
  const base = groups.map((g) => ({ ...g, items: dedupe(g.items) }));
  if (!layout) return base;
  const all = new Map<string, NavItem>();
  for (const g of base) for (const i of g.items) if (!all.has(i.href)) all.set(i.href, i);
  const pinned = layout.pinned.map((h) => all.get(h)).filter((i): i is NavItem => !!i);
  const pinnedSet = new Set(pinned.map((i) => i.href));
  const rest = base
    .map((g) => ({ ...g, items: arrange(g.items.filter((i) => !pinnedSet.has(i.href)), layout.order[g.label]) }))
    .filter((g) => g.items.length > 0);
  return pinned.length ? [{ label: PINNED_LABEL, items: pinned }, ...rest] : rest;
}
