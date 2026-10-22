import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/ResetForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Welcome to LaundryPoint", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Where an invited team member lands after accepting the invitation, to choose a password. */
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return (
    <AuthShell title={`Welcome${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`} subtitle="Choose a password to finish setting up your account. You will use your email and this password to sign in.">
      <ResetForm mode="welcome" />
    </AuthShell>
  );
}
