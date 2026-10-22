import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/ForgotForm";

export const metadata = { title: "Reset password" };

import { FormMessage } from "@/components/auth/AuthShell";

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will send you a link."
      footer={<Link href="/login" className="font-medium text-brand-dark hover:underline">Back to sign in</Link>}>
      {expired && <div className="mb-4"><FormMessage kind="error">That reset link has expired or was already used. Request a new one below.</FormMessage></div>}
      <ForgotForm />
    </AuthShell>
  );
}
