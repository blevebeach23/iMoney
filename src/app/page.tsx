import Link from "next/link";
import { BalanceRefresh } from "@/components/dashboard/balance-refresh";
import { personalViewMovements } from "@/lib/movements/view-scope";
import { buildLiquidityForecastEvents, calculateLiquiditySummary } from "@/lib/calculations/liquidity";
import { synchronizeFinancialAutomation } from "@/services/automation/financial-automation-service";
import { DashboardPreview } from "@/components/dashboard/dashboard-preview";
import { logoutAction } from "@/lib/auth/actions";
import { calculateAnnualTrend } from "@/lib/calculations/annual-trend";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import { calculateCategoryAggregates } from "@/lib/calculations/category-aggregates";
import { formatMonthLabel, todayInRome, monthRangeFromYearMonth } from "@/lib/calculations/dates";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import { getUpcomingMovements } from "@/lib/calculations/upcoming";
import { shortUserName } from "@/lib/profiles/display-name";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccounts } from "@/services/accounts/account-service";
import { getPersonalBudgetsForMonth } from "@/services/budgets/budget-service";
import { buildVirtualCreditCardSettlementTransfers, getCreditCardForecasts, getCreditCardSettlementHistoryForUser, getCreditCardSettingsForUser } from "@/services/credit-cards/credit-card-service";
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

  await synchronizeFinancialAutomation(supabase, user.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed, username")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const range = monthRangeFromYearMonth(firstParam(searchParams.month) ?? todayInRome().slice(0, 7));
  const year = Number(range.yearMonth.slice(0, 4));
  const includeShared = firstParam(searchParams.includeShared) === "1";
  const [accounts, budgets, funds, monthMovements, movementsUntilMonthEnd, yearMovements, transfersUntilMonthEnd, categoryInfo, creditCardSettings, creditCardSettlementHistory] = await Promise.all([
    getAccounts(supabase, user.id),
    getPersonalBudgetsForMonth(supabase, user.id, range.monthStart),
    getFunds(supabase, user.id),
    getMonthlyMovements(supabase, user.id, range.monthStart, range.monthEnd),
    getMovementsUntil(supabase, user.id, range.monthEnd > range.today ? range.monthEnd : range.today),
    getMovementsBetween(supabase, user.id, `${year}-01-01`, `${year}-12-31`),
    getTransfersUntil(supabase, user.id, range.monthEnd > range.today ? range.monthEnd : range.today),
    getMovementCategoryInfo(supabase, user.id, { includeHouseholds: includeShared }),
    getCreditCardSettingsForUser(supabase, user.id),
    getCreditCardSettlementHistoryForUser(supabase, user.id)
  ]);
  const visibleMonthMovements = personalViewMovements(monthMovements, includeShared);
  const summary = calculateMonthlySummary(visibleMonthMovements);
  const currentBalances = calculateFinancialBalances(accounts, funds, movementsUntilMonthEnd, transfersUntilMonthEnd, range.today, range.today);
  const creditCardForecasts = getCreditCardForecasts({
    accounts,
    settings: creditCardSettings,
    movements: movementsUntilMonthEnd,
    transfers: transfersUntilMonthEnd,
    settlementHistory: creditCardSettlementHistory,
    today: range.today,
    bankBalances: currentBalances.bank
  });
  const virtualSettlementTransfers = buildVirtualCreditCardSettlementTransfers(user.id, creditCardForecasts, creditCardSettlementHistory).filter((transfer) => transfer.occurredOn > range.today && transfer.occurredOn <= range.monthEnd);
  const balances = calculateFinancialBalances(accounts, funds, movementsUntilMonthEnd, [...transfersUntilMonthEnd, ...virtualSettlementTransfers], range.today, range.monthEnd);
  const budgetReport = calculateBudgetReport(budgets, personalViewMovements(monthMovements), categoryInfo);
  const categoryAggregates = calculateCategoryAggregates(visibleMonthMovements, categoryInfo);
  const upcomingMovements = getUpcomingMovements(visibleMonthMovements, range.today);
  const annualTrend = calculateAnnualTrend(personalViewMovements(yearMovements, includeShared), year);
  const userName = shortUserName(profile?.full_name, profile?.username);

  return (
    <>
      <BalanceRefresh />
      <form action={logoutAction} className="mx-auto max-w-md px-4 pt-4">
        <button type="submit" className="text-sm font-semibold text-primary">
          Esci
        </button>
      </form>
      <div className="mx-auto max-w-md px-4 pt-3"><Link href={`/?month=${range.yearMonth}${includeShared ? "" : "&includeShared=1"}`} className="flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold">{includeShared ? "Mostra solo i miei movimenti personali" : "Includi i miei movimenti condivisi"}</Link><p className="mt-2 text-xs text-zinc-600">I saldi dei conti includono sempre tutta la tua storia contabile. Il budget personale include soltanto movimenti non condivisi.</p></div>
      <DashboardPreview
        includeShared={includeShared}
        liquidity={calculateLiquiditySummary(accounts, balances)}
        liquidityEvents={buildLiquidityForecastEvents(accounts, movementsUntilMonthEnd, [...transfersUntilMonthEnd, ...virtualSettlementTransfers], range.today, range.monthEnd)}
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
