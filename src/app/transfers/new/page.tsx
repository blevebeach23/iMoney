import { redirect } from "next/navigation";
import { TransferForm } from "@/components/transfers/transfer-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getFunds } from "@/services/funds/fund-service";
import { getActiveHouseholdOptions } from "@/services/households/household-service";

export const dynamic = "force-dynamic";

export default async function NewTransferPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [accounts, funds, households] = await Promise.all([getAccounts(supabase, user.id), getFunds(supabase, user.id), getActiveHouseholdOptions(supabase, user.id)]);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Trasferimenti</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Nuovo trasferimento</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Sposta denaro tra conti e fondi senza alterare entrate, spese o budget.</p>
      </header>
      <TransferForm accounts={accounts} funds={funds} households={households} />
    </main>
  );
}
