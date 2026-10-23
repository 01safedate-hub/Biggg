import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MyStaffState = {
  onboarding_status: "incomplete" | "submitted" | "verified" | "rejected";
  review_note: string | null;
  must_change_password: boolean;
  job_title: string | null;
  base_salary_kobo: number | null;
  target_salary_kobo: number | null;
  profile: Record<string, string | null>;
};

/** First sign-in rules: replace a password someone else set, then finish the personal details. */
export async function enforceStaffGate(supabase: SupabaseClient, opts: { skipOnboarding: boolean }) {
  const { data } = await supabase.rpc("my_staff_state");
  const s = data as unknown as MyStaffState | null;
  if (!s) return null;
  if (s.must_change_password) redirect("/account/security?forced=1");
  if (!opts.skipOnboarding && (s.onboarding_status === "incomplete" || s.onboarding_status === "rejected")) redirect("/staff/onboarding");
  return s;
}
