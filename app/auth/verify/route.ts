import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "invite", "recovery", "magiclink", "email_change"];

/** Where each kind of link sends the person once the token is accepted. The destination is fixed here, never taken from the URL. */
const DESTINATION: Record<string, string> = {
  signup: "/account?notice=confirmed",
  invite: "/welcome",
  recovery: "/reset-password",
  magiclink: "/account",
  email_change: "/account/security?notice=email_changed",
};

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "") as EmailOtpType;
  if (!tokenHash || !TYPES.includes(type)) return NextResponse.redirect(`${origin}/login?error=link`, 303);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return NextResponse.redirect(`${origin}/login?error=link`, 303);

  // With a secure email change, the first of the two confirmations leaves the change pending until the other is done.
  if (type === "email_change") {
    const { data: { user } } = await supabase.auth.getUser();
    const pending = Boolean(user?.new_email);
    return NextResponse.redirect(`${origin}/account/security?notice=${pending ? "email_pending" : "email_changed"}`, 303);
  }
  return NextResponse.redirect(`${origin}${DESTINATION[type]}`, 303);
}
