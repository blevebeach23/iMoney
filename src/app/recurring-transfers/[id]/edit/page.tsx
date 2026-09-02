import { notFound, redirect } from "next/navigation";
import { RecurringTransferForm } from "@/components/recurring-transfers/recurring-transfer-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getFunds } from "@/services/funds/fund-service";
import { getActiveHouseholdOptions } from "@/services/households/household-service";
import { getRecurringTransferById } from "@/services/recurring-transfers/recurring-transfer-service";

export const dynamic = "force-dynamic";

export default async function EditRecurringTransferPage({ params }: Readonly<{ params: { id: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [accounts, funds, households, recurringTransfer] = await Promise.all([
    getAccounts(supabase, user.id),
    getFunds(supabase, user.id),
    getActiveHouseholdOptions(supabase, user.id),
    getRecurringTransferById(supabase, user.id, params.id)
  ]);

  if (!recurringTransfer) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Trasferimenti ricorrenti</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Modifica trasferimento ricorrente</h1>
      </header>
      <RecurringTransferForm accounts={accounts} funds={funds} households={households} recurringTransfer={recurringTransfer} />
    </main>
  );
}
