import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";

export default function RegisterCompletedPage() {
  return (
    <AuthCard title="Registrazione completata" subtitle="Controlla l'email e conferma il tuo account per accedere a iMoney.">
      <div className="space-y-4">
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-800">
          Se Supabase richiede conferma email, troverai il link nella tua casella di posta. Dopo la conferma potrai accedere e completare l&apos;onboarding.
        </p>
        <Link href="/login" className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-white">
          Vai al login
        </Link>
      </div>
    </AuthCard>
  );
}
