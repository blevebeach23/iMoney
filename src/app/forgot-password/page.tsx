import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Recupera password" subtitle="Riceverai un link per impostare una nuova password.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
