"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/roles";

export async function markAllRead(): Promise<void> {
  const { supabase, user } = await requireUser("/notifications");
  await supabase.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/", "layout");
}
