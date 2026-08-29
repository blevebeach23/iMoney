import { DashboardPreview } from "@/components/dashboard/dashboard-preview";
import { logoutAction } from "@/lib/auth/actions";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import { calculateCategoryAggregates } from "@/lib/calculations/category-aggregates";
import { currentMonthRange } from "@/lib/calculations/dates";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getFunds } from "@/services/funds/fund-service";
import { getMovementCategoryInfo, getMonthlyMovements, getMovementsUntil } from "@/services/movements/movement-service";
import { getTransfersUntil } from "@/services/transfers/transfer-service";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const range = currentMonthRange();
  const [accounts, funds, monthMovements, movementsUntilMonthEnd, transfersUntilMonthEnd, categoryInfo] = await Promise.all([
    getAccounts(supabase, user.id),
    getFunds(supabase, user.id),
    getMonthlyMovements(supabase, user.id, range.monthStart, range.monthEnd),
    getMovementsUntil(supabase, user.id, range.monthEnd),
    getTransfersUntil(supabase, user.id, range.monthEnd),
    getMovementCategoryInfo(supabase, user.id)
  ]);
  const summary = calculateMonthlySummary(monthMovements);
  const balances = calculateFinancialBalances(accounts, funds, movementsUntilMonthEnd, transfersUntilMonthEnd, range.today, range.monthEnd);
  const categoryAggregates = calculateCategoryAggregates(monthMovements, categoryInfo);

  return (
    <>
      <form action={logoutAction} className="mx-auto max-w-md px-4 pt-4">
        <button type="submit" className="text-sm font-semibold text-primary">
          Esci
        </button>
      </form>
      <DashboardPreview
        balances={balances}
        macroCategoryAggregates={categoryAggregates.macroCategories}
        monthLabel={new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${range.monthStart}T00:00:00`))}
        summary={summary}
      />
    </>
  );
}
