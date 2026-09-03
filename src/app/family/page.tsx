import Link from "next/link";
import { redirect } from "next/navigation";
import { FamilyDashboard } from "@/components/family/family-dashboard";
import { calculateAnnualTrend } from "@/lib/calculations/annual-trend";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import { calculateCategoryAggregates } from "@/lib/calculations/category-aggregates";
import { formatMonthLabel, formatYearMonth, monthRangeFromYearMonth } from "@/lib/calculations/dates";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import { filterFamilySharedMovements } from "@/lib/households/family-rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHouseholdBudgetsForMonth } from "@/services/budgets/budget-service";
import { getFixedExpenseRequestsForHousehold } from "@/services/fixed-expenses/fixed-expense-request-service";
import { getSharedHouseholdFunds } from "@/services/funds/fund-service";
import { getMovementCategoryInfo, getSharedHouseholdMovements, getSharedHouseholdMovementsBetween } from "@/services/movements/movement-service";
import { getActiveHouseholds, getHouseholdById } from "@/services/households/household-service";
import { getMovementRequestsForHousehold } from "@/services/movements/movement-request-service";
import { buildMovementTimeline, filterTimelineFutureItems } from "@/services/timeline/timeline-service";
import { getSharedHouseholdTransfers } from "@/services/transfers/transfer-service";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FamilyPage({ searchParams }: Readonly<{ searchParams: Record<string, string | string[] | undefined> }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const households = await getActiveHouseholds(supabase, user.id);
  const selectedHouseholdId = firstParam(searchParams.householdId) ?? households[0]?.id;

  if (!selectedHouseholdId) {
    return (
      <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
        <header className="mb-6 pr-28">
          <p className="text-sm font-semibold text-primary">Famiglia</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Dashboard famiglia</h1>
        </header>
        <div className="rounded-md border border-dashed border-border bg-white p-5">
          <p className="font-semibold text-foreground">Nessuna famiglia attiva</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Crea una famiglia o accetta un invito per vedere i movimenti condivisi.</p>
          <Link href="/family/settings" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white">
            Impostazioni famiglia
          </Link>
        </div>
      </main>
    );
  }

  const selectedMonth = firstParam(searchParams.month) ?? formatYearMonth(new Date());
  const showFuture = firstParam(searchParams.showFuture) === "1";
  const range = monthRangeFromYearMonth(selectedMonth);
  const year = Number(range.yearMonth.slice(0, 4));
  const [household, monthMovements, yearMovements, monthTransfers, budgets, categoryInfo, sharedFunds, movementRequests, fixedExpenseRequests] = await Promise.all([
    getHouseholdById(supabase, selectedHouseholdId),
    getSharedHouseholdMovements(supabase, selectedHouseholdId, range.monthStart, range.monthEnd),
    getSharedHouseholdMovementsBetween(supabase, selectedHouseholdId, `${year}-01-01`, `${year}-12-31`),
    getSharedHouseholdTransfers(supabase, selectedHouseholdId, range.monthStart, range.monthEnd),
    getHouseholdBudgetsForMonth(supabase, selectedHouseholdId, range.monthStart),
    getMovementCategoryInfo(supabase, user.id),
    getSharedHouseholdFunds(supabase, selectedHouseholdId),
    getMovementRequestsForHousehold(supabase, selectedHouseholdId),
    getFixedExpenseRequestsForHousehold(supabase, selectedHouseholdId)
  ]);

  if (!household) {
    redirect("/family/settings");
  }

  const visibleMonthMovements = filterFamilySharedMovements(monthMovements, selectedHouseholdId);
  const visibleYearMovements = filterFamilySharedMovements(yearMovements, selectedHouseholdId);
  const summary = calculateMonthlySummary(visibleMonthMovements);
  const aggregates = calculateCategoryAggregates(visibleMonthMovements, categoryInfo);
  const budgetReport = calculateBudgetReport(budgets, visibleMonthMovements, categoryInfo);
  const annualTrend = calculateAnnualTrend(visibleYearMovements, year);
  const familyTimeline = filterTimelineFutureItems(buildMovementTimeline(visibleMonthMovements, monthTransfers), showFuture);

  return (
    <FamilyDashboard
      annualTrend={annualTrend}
      budgetReport={budgetReport}
      currentUserId={user.id}
      householdId={selectedHouseholdId}
      householdName={household.name}
      macroCategoryAggregates={aggregates.macroCategories}
      monthLabel={formatMonthLabel(range.monthStart)}
      fixedExpenseRequests={fixedExpenseRequests}
      movementRequests={movementRequests}
      selectedMonth={range.yearMonth}
      sharedFunds={sharedFunds}
      summary={summary}
      timeline={familyTimeline}
      showFuture={showFuture}
    />
  );
}
