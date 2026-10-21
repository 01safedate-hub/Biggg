import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { FormMessage } from "@/components/auth/AuthShell";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthShell title="Sign in" subtitle="Welcome back."
      footer={<>New here? <Link href="/signup" className="font-medium text-brand-dark hover:underline">Create an account</Link></>}>
      {error === "link" && (
        <div className="mb-4"><FormMessage kind="error">That link has expired or was already used. Sign in, or request a new password reset link.</FormMessage></div>
      )}
      <LoginForm next={next ?? "/account"} />
    </AuthShell>
  );
}
