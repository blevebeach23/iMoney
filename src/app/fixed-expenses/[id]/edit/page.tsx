import { notFound, redirect } from "next/navigation";
import { FixedExpenseForm } from "@/components/fixed-expenses/fixed-expense-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getCategoryTree } from "@/services/categories/category-service";
import { getFixedExpenseById } from "@/services/fixed-expenses/fixed-expense-service";
import { getFunds } from "@/services/funds/fund-service";
import { getActiveHouseholdOptions } from "@/services/households/household-service";

export const dynamic = "force-dynamic";

export default async function EditFixedExpensePage({ params }: Readonly<{ params: { id: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [accounts, funds, categoryTree, households, fixedExpense] = await Promise.all([
    getAccounts(supabase, user.id),
    getFunds(supabase, user.id),
    getCategoryTree(supabase, user.id),
    getActiveHouseholdOptions(supabase, user.id),
    getFixedExpenseById(supabase, user.id, params.id)
  ]);

  if (!fixedExpense) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Spese ricorrenti</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Modifica spesa ricorrente</h1>
      </header>
      <FixedExpenseForm accounts={accounts} categoryTree={categoryTree} fixedExpense={fixedExpense} funds={funds} households={households} />
    </main>
  );
}
