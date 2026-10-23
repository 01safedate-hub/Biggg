import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";
import { rpcArgs, type Filters } from "@/lib/customer-filters";
import type { CustomerRow } from "@/lib/customers";

export const dynamic = "force-dynamic";

// Spreadsheet programs run text that starts with = + - or @ as a formula, so those cells get a leading quote.
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(req: NextRequest) {
  const { supabase } = await requireRole(["super_admin"]);
  const f: Filters = Object.fromEntries(req.nextUrl.searchParams.entries());
  const all: CustomerRow[] = [];
  for (let off = 0; off < 5000; off += 200) {
    const { data } = await supabase.rpc("customer_list", rpcArgs(f, 200, off));
    const rows = ((data as unknown as { rows: CustomerRow[] } | null)?.rows) ?? [];
    all.push(...rows);
    if (rows.length < 200) break;
  }
  const head = ["Name", "Code", "Phone", "Email", "Group", "Orders", "Orders in month", "Last order", "Days quiet", "Avg delivery hours", "Spent (naira)", "Area", "Accepts offers", "Joined"];
  const lines = [head.map(cell).join(",")].concat(all.map((c) => [c.full_name, c.customer_code, c.phone, c.email, c.stage, c.orders, c.month_orders, c.last_order_at?.slice(0, 10), c.days_quiet, c.avg_turnaround_h, (c.spent_kobo / 100).toFixed(2), c.zone_name, c.marketing_opt_in ? "yes" : "no", c.signed_up_at.slice(0, 10)].map(cell).join(",")));
  return new NextResponse("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
