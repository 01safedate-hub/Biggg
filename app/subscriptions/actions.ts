"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateSubscriptionCancellation(formData: FormData) {
  const subscriptionId = String(formData.get("subscription_id") ?? "");
  const cancelAtPeriodEnd = String(formData.get("cancel_at_period_end") ?? "") === "true";
  if (!subscriptionId) redirect("/subscriptions/manage?notice=subscription_not_found");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/subscriptions");

  // The RPC acts on the signed-in customer's own active plan only.
  const { error } = await supabase.rpc("set_subscription_cancellation", { _cancel: cancelAtPeriodEnd });
  if (error) redirect(`/subscriptions/manage?notice=${/next_term_already_paid/.test(error.message) ? "next_term_already_paid" : "subscription_update_failed"}`);
  revalidatePath("/subscriptions");
  revalidatePath("/dashboard");
  redirect(cancelAtPeriodEnd ? "/subscriptions/manage?notice=cancellation_scheduled" : "/subscriptions/manage?notice=cancellation_reversed");
}
