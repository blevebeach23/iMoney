import { redirect } from "next/navigation";
import { ImportWorkflow } from "@/components/import/import-workflow";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getCategoryTree } from "@/services/categories/category-service";
import { getFunds } from "@/services/funds/fund-service";
import { getActiveHouseholdOptions } from "@/services/households/household-service";
import { getImportAccountMappings, getImportBatches } from "@/services/imports/import-service";
import { getMovements } from "@/services/movements/movement-service";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [accounts, accountMappings, batches, categoryTree, existingMovements, funds, households] = await Promise.all([
    getAccounts(supabase, user.id),
    getImportAccountMappings(supabase, user.id),
    getImportBatches(supabase, user.id),
    getCategoryTree(supabase, user.id),
    getMovements(supabase, user.id),
    getFunds(supabase, user.id),
    getActiveHouseholdOptions(supabase, user.id)
  ]);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Import</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">CSV movimenti</h1>
      </header>
      <ImportWorkflow
        accounts={accounts}
        accountMappings={Object.fromEntries(accountMappings.map((mapping) => [mapping.normalizedValue, mapping.accountId]))}
        batches={batches}
        categoryTree={categoryTree}
        existingMovements={existingMovements}
        funds={funds}
        households={households}
      />
    </main>
  );
}
