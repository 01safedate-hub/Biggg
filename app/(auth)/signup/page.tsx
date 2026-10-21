import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" subtitle="Book pickups, track orders and manage your plan."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-brand-dark hover:underline">Sign in</Link></>}>
      <SignupForm />
    </AuthShell>
  );
}
