import { notFound, redirect } from "next/navigation";
import { TransferForm } from "@/components/transfers/transfer-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getFunds } from "@/services/funds/fund-service";
import { getActiveHouseholdOptions } from "@/services/households/household-service";
import { getTransferById } from "@/services/transfers/transfer-service";

export const dynamic = "force-dynamic";

export default async function EditTransferPage({ params }: Readonly<{ params: { id: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [accounts, funds, households, transfer] = await Promise.all([
    getAccounts(supabase, user.id),
    getFunds(supabase, user.id),
    getActiveHouseholdOptions(supabase, user.id),
    getTransferById(supabase, user.id, params.id)
  ]);

  if (!transfer) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Trasferimenti</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Modifica trasferimento</h1>
      </header>
      <TransferForm accounts={accounts} funds={funds} households={households} transfer={transfer} />
    </main>
  );
}
