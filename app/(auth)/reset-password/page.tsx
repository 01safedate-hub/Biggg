import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/ResetForm";

export const metadata = { title: "Choose a new password" };

export default function ResetPage() {
  return (
    <AuthShell title="Choose a new password">
      <ResetForm />
    </AuthShell>
  );
}
