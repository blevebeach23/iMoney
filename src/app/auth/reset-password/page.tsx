import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Nuova password" subtitle="Scegli una password nuova per il tuo account.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
