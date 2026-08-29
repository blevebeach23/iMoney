import { notFound, redirect } from "next/navigation";
import { BudgetManager } from "@/components/budgets/budget-manager";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import { formatMonthLabel, monthRangeFromYearMonth, previousMonthStart } from "@/lib/calculations/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPersonalBudgetsForMonth } from "@/services/budgets/budget-service";
import { getCategoryTree } from "@/services/categories/category-service";
import { getMovementCategoryInfo, getMonthlyMovements } from "@/services/movements/movement-service";

export async function BudgetMonthContent({ yearMonth }: Readonly<{ yearMonth: string }>) {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const range = monthRangeFromYearMonth(yearMonth);
  const [budgets, categoryTree, categoryInfo, movements] = await Promise.all([
    getPersonalBudgetsForMonth(supabase, user.id, range.monthStart),
    getCategoryTree(supabase, user.id),
    getMovementCategoryInfo(supabase, user.id),
    getMonthlyMovements(supabase, user.id, range.monthStart, range.monthEnd)
  ]);
  const report = calculateBudgetReport(budgets, movements, categoryInfo);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Budget</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">{formatMonthLabel(range.monthStart)}</h1>
      </header>
      <form className="mb-5 flex items-end gap-3" action="/budgets">
        <label className="flex-1">
          <span className="text-sm font-semibold text-foreground">Mese</span>
          <input name="month" type="month" defaultValue={yearMonth} className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3" />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white">
          Apri
        </button>
      </form>
      <BudgetManager
        budgets={budgets}
        categoryTree={categoryTree}
        monthStart={range.monthStart}
        previousMonthStart={previousMonthStart(range.monthStart)}
        report={report}
      />
    </main>
  );
}
