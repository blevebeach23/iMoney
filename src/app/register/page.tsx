import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthCard title="Crea account" subtitle="Registra il profilo personale per iniziare l'onboarding.">
      <RegisterForm />
    </AuthCard>
  );
}
