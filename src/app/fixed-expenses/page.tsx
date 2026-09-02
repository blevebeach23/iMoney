import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { FixedExpenseList } from "@/components/fixed-expenses/fixed-expense-list";
import { currentMonthRange } from "@/lib/calculations/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getFixedExpenses } from "@/services/fixed-expenses/fixed-expense-service";

export const dynamic = "force-dynamic";

export default async function FixedExpensesPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fixedExpenses = await getFixedExpenses(supabase, user.id);
  const range = currentMonthRange();
  const toMonth = new Date(`${range.monthStart}T00:00:00`);
  toMonth.setMonth(toMonth.getMonth() + 11);
  const toMonthStart = `${toMonth.getFullYear()}-${String(toMonth.getMonth() + 1).padStart(2, "0")}-01`;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">Spese ricorrenti</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Ricorrenze</h1>
        </div>
        <Link href="/fixed-expenses/new" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white">
          <Plus aria-hidden className="h-4 w-4" />
          Nuova
        </Link>
      </header>
      <FixedExpenseList fixedExpenses={fixedExpenses} fromMonthStart={range.monthStart} toMonthStart={toMonthStart} />
    </main>
  );
}
