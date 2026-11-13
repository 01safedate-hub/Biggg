"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/rpc-errors";
import type { NavLayout } from "@/lib/nav-layout";

type R = { ok: boolean; message: string };
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

async function rpc() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { user, call: ((fn: string, args?: Record<string, unknown>) => supabase.rpc(fn as never, args as never)) as unknown as Rpc };
}

export async function saveNavLayout(area: "staff" | "admin", layout: NavLayout | null): Promise<R> {
  const { user, call } = await rpc();
  if (!user) return { ok: false, message: friendlyError("auth_required") };
  if (area !== "staff" && area !== "admin") return { ok: false, message: "Unknown menu." };
  const { error } = await call("save_nav_layout", { _area: area, _layout: layout });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return { ok: true, message: layout ? "Menu saved." : "Menu reset." };
}

export async function saveTourProgress(tour: "customer" | "staff", progress: Record<string, unknown>): Promise<R> {
  const { user, call } = await rpc();
  if (!user) return { ok: false, message: friendlyError("auth_required") };
  if (tour !== "customer" && tour !== "staff") return { ok: false, message: "Unknown guide." };
  const { error } = await call("save_tour_progress", { _tour: tour, _progress: progress });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return { ok: true, message: "" };
}
