"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateSubscriptionCancellation(formData: FormData) {
  const subscriptionId = String(formData.get("subscription_id") ?? "");
  const cancelAtPeriodEnd = String(formData.get("cancel_at_period_end") ?? "") === "true";
  if (!subscriptionId) redirect("/subscriptions?notice=subscription_not_found");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/subscriptions");

  // Ownership is enforced in the update predicate; customers cannot change another
  // customer's subscription even if they submit a guessed UUID.
  const { data, error } = await supabase
    .from("subscriptions")
    .update({ cancel_at_period_end: cancelAtPeriodEnd })
    .eq("id", subscriptionId)
    .eq("customer_id", user.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error || !data) redirect("/subscriptions?notice=subscription_update_failed");
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  redirect(cancelAtPeriodEnd ? "/subscriptions?notice=cancellation_scheduled" : "/subscriptions?notice=cancellation_reversed");
}
