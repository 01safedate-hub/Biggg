import { STAGES } from "@/lib/customers";

export type Filters = { stage?: string; q?: string; min?: string; max?: string; month?: string; opted?: string; sort?: string; page?: string };
const SORTS = ["recent", "orders", "spent", "quiet", "turnaround"];

/** Turns the page's query string into safe arguments for the customer_list function. */
export function rpcArgs(f: Filters, limit: number, offset: number) {
  const int = (v?: string) => { const n = Number(v); return v && Number.isInteger(n) && n >= 0 && n < 1000 ? n : null; };
  const stage = STAGES.some((s) => s.key === f.stage) ? f.stage! : null;
  const month = f.month && /^\d{4}-\d{2}$/.test(f.month) ? `${f.month}-01` : null;
  return {
    _stage: stage as string, _q: (f.q ?? "").trim().slice(0, 80) || (null as unknown as string), _month: month as string,
    _min: int(f.min) as number, _max: int(f.max) as number, _opted: (f.opted === "yes" ? true : f.opted === "no" ? false : null) as boolean,
    _sort: SORTS.includes(f.sort ?? "") ? f.sort! : "recent", _limit: limit, _offset: offset,
  };
}
