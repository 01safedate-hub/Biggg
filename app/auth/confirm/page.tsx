import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata = { title: "Continue", robots: { index: false } };

const COPY: Record<string, { title: string; text: string; button: string }> = {
  signup: { title: "Confirm your email", text: "Press the button to confirm your email and activate your account.", button: "Confirm email" },
  invite: { title: "Accept your invitation", text: "Press the button to accept the invitation. You will then choose your password.", button: "Accept invitation" },
  recovery: { title: "Reset your password", text: "Press the button to continue and choose a new password.", button: "Continue" },
  magiclink: { title: "Sign in", text: "Press the button to sign in.", button: "Sign in" },
  email_change: { title: "Confirm your email change", text: "Press the button to confirm the change of your sign-in email.", button: "Confirm" },
};

/**
 * Email links land here first. The one-time token is only used when the person presses the button,
 * so mail security scanners that open links in advance cannot use it up.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash, type } = await searchParams;
  const copy = type ? COPY[type] : undefined;
  if (!token_hash || !copy) {
    return (
      <AuthShell title="This link is not valid" footer={<Link href="/login" className="font-medium text-brand-dark hover:underline">Back to sign in</Link>}>
        <p className="text-sm text-ink-soft">The link is incomplete. Open the latest email we sent you, or request a new one.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={copy.title}>
      <p className="text-sm text-ink-soft">{copy.text}</p>
      <form action="/auth/verify" method="post" className="mt-6">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <button className="btn-primary w-full">{copy.button}</button>
      </form>
    </AuthShell>
  );
}
