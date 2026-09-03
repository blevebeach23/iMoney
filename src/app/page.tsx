import { DashboardPreview } from "@/components/dashboard/dashboard-preview";
import { logoutAction } from "@/lib/auth/actions";
import { calculateAnnualTrend } from "@/lib/calculations/annual-trend";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import { calculateCategoryAggregates } from "@/lib/calculations/category-aggregates";
import { formatMonthLabel, formatYearMonth, monthRangeFromYearMonth } from "@/lib/calculations/dates";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import { getUpcomingMovements } from "@/lib/calculations/upcoming";
import { shortUserName } from "@/lib/profiles/display-name";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { rebuildBalanceCaches } from "@/services/balances/balance-service";
import { getPersonalBudgetsForMonth } from "@/services/budgets/budget-service";
import { buildVirtualCreditCardSettlementTransfers, generateDueCreditCardSettlements, getCreditCardForecasts, getCreditCardSettingsForUser } from "@/services/credit-cards/credit-card-service";
import { getFunds } from "@/services/funds/fund-service";
import { getMovementCategoryInfo, getMonthlyMovements, getMovementsBetween, getMovementsUntil } from "@/services/movements/movement-service";
import { getTransfersUntil } from "@/services/transfers/transfer-service";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: Readonly<{ searchParams: Record<string, string | string[] | undefined> }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed, username")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const range = monthRangeFromYearMonth(firstParam(searchParams.month) ?? formatYearMonth(new Date()));
  const year = Number(range.yearMonth.slice(0, 4));
  const [accounts, budgets, funds, monthMovements, movementsUntilMonthEnd, yearMovements, initialTransfersUntilMonthEnd, categoryInfo, creditCardSettings] = await Promise.all([
    getAccounts(supabase, user.id),
    getPersonalBudgetsForMonth(supabase, user.id, range.monthStart),
    getFunds(supabase, user.id),
    getMonthlyMovements(supabase, user.id, range.monthStart, range.monthEnd),
    getMovementsUntil(supabase, user.id, range.monthEnd),
    getMovementsBetween(supabase, user.id, `${year}-01-01`, `${year}-12-31`),
    getTransfersUntil(supabase, user.id, range.monthEnd),
    getMovementCategoryInfo(supabase, user.id),
    getCreditCardSettingsForUser(supabase, user.id)
  ]);
  const createdSettlements = await generateDueCreditCardSettlements(supabase, user.id, {
    accounts,
    settings: creditCardSettings,
    movements: movementsUntilMonthEnd,
    transfers: initialTransfersUntilMonthEnd,
    today: range.today
  });
  const transfersUntilMonthEnd = createdSettlements > 0 ? await getTransfersUntil(supabase, user.id, range.monthEnd) : initialTransfersUntilMonthEnd;
  if (createdSettlements > 0) {
    await rebuildBalanceCaches(supabase, user.id, range.today);
  }
  const summary = calculateMonthlySummary(monthMovements);
  const currentBalances = calculateFinancialBalances(accounts, funds, movementsUntilMonthEnd, transfersUntilMonthEnd, range.today, range.today);
  const creditCardForecasts = getCreditCardForecasts({
    accounts,
    settings: creditCardSettings,
    movements: movementsUntilMonthEnd,
    transfers: transfersUntilMonthEnd,
    today: range.today,
    bankBalances: currentBalances.bank
  });
  const virtualSettlementTransfers = buildVirtualCreditCardSettlementTransfers(user.id, creditCardForecasts, transfersUntilMonthEnd).filter((transfer) => transfer.occurredOn <= range.monthEnd);
  const balances = calculateFinancialBalances(accounts, funds, movementsUntilMonthEnd, [...transfersUntilMonthEnd, ...virtualSettlementTransfers], range.today, range.monthEnd);
  const budgetReport = calculateBudgetReport(budgets, monthMovements, categoryInfo);
  const categoryAggregates = calculateCategoryAggregates(monthMovements, categoryInfo);
  const upcomingMovements = getUpcomingMovements(monthMovements, range.today);
  const annualTrend = calculateAnnualTrend(yearMovements, year);
  const userName = shortUserName(profile?.full_name, profile?.username);

  return (
    <>
      <form action={logoutAction} className="mx-auto max-w-md px-4 pt-4">
        <button type="submit" className="text-sm font-semibold text-primary">
          Esci
        </button>
      </form>
      <DashboardPreview
        annualTrend={annualTrend}
        balances={balances}
        budgetReport={budgetReport}
        creditCardForecasts={creditCardForecasts}
        macroCategoryAggregates={categoryAggregates.macroCategories}
        monthLabel={formatMonthLabel(range.monthStart)}
        selectedMonth={range.yearMonth}
        summary={summary}
        upcomingMovements={upcomingMovements}
        userName={userName}
      />
    </>
  );
}
