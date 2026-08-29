import { redirect } from "next/navigation";
import { StatisticsDashboard } from "@/components/statistics/statistics-dashboard";
import { monthRangeFromYearMonth, formatYearMonth } from "@/lib/calculations/dates";
import { buildStatisticsReport, filterMovementsForStatistics, type StatisticsPeriodKind, type StatisticsScope } from "@/lib/calculations/statistics";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPersonalBudgetsForMonth, getHouseholdBudgetsForMonth } from "@/services/budgets/budget-service";
import { getActiveHouseholds } from "@/services/households/household-service";
import { getMovementCategoryInfo, getMovementsBetween, getSharedHouseholdMovementsBetween } from "@/services/movements/movement-service";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function validMonth(value: string | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : formatYearMonth(new Date());
}

function validYear(value: string | undefined, fallbackMonth: string) {
  const year = Number(value ?? fallbackMonth.slice(0, 4));
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : Number(fallbackMonth.slice(0, 4));
}

export default async function StatisticsPage({ searchParams }: Readonly<{ searchParams: Record<string, string | string[] | undefined> }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const scope = firstParam(searchParams.scope) === "family" ? "family" : "personal";
  const periodKind = periodKindFromParam(firstParam(searchParams.period));
  const selectedMonth = validMonth(firstParam(searchParams.month));
  const selectedYear = validYear(firstParam(searchParams.year), selectedMonth);
  const selectedMonthRange = monthRangeFromYearMonth(selectedMonth);
  const periodRange = resolvePeriodRange(periodKind, selectedMonth, selectedYear, firstParam(searchParams.start), firstParam(searchParams.end));
  const archiveStart = "2000-01-01";
  const archiveEnd = "2100-12-31";
  const households = await getActiveHouseholds(supabase, user.id);
  const selectedHouseholdId = firstParam(searchParams.householdId) ?? households[0]?.id ?? null;
  const familyEnabled = scope === "family" && Boolean(selectedHouseholdId);

  const [personalMovements, familyMovements, categoryInfo, budgets] = await Promise.all([
    getMovementsBetween(supabase, user.id, archiveStart, archiveEnd),
    familyEnabled ? getSharedHouseholdMovementsBetween(supabase, String(selectedHouseholdId), archiveStart, archiveEnd) : Promise.resolve([]),
    getMovementCategoryInfo(supabase, user.id),
    familyEnabled
      ? getHouseholdBudgetsForMonth(supabase, String(selectedHouseholdId), selectedMonthRange.monthStart)
      : getPersonalBudgetsForMonth(supabase, user.id, selectedMonthRange.monthStart)
  ]);

  const movements = filterMovementsForStatistics({
    personalMovements,
    familyMovements,
    householdId: selectedHouseholdId,
    scope: scope as StatisticsScope
  });
  const report = buildStatisticsReport({
    scope: scope as StatisticsScope,
    periodKind,
    movements,
    budgets,
    categoryInfoById: categoryInfo,
    startDate: periodRange.startDate,
    endDate: periodRange.endDate,
    selectedMonth,
    selectedYear
  });

  return <StatisticsDashboard report={report} households={households} selectedHouseholdId={selectedHouseholdId} />;
}

function periodKindFromParam(value: string | undefined): StatisticsPeriodKind {
  if (value === "year" || value === "custom") {
    return value;
  }

  return "month";
}

function resolvePeriodRange(periodKind: StatisticsPeriodKind, selectedMonth: string, selectedYear: number, start: string | undefined, end: string | undefined) {
  if (periodKind === "year") {
    return { startDate: `${selectedYear}-01-01`, endDate: `${selectedYear}-12-31` };
  }

  if (periodKind === "custom") {
    const startDate = validDate(start);
    const endDate = validDate(end);
    if (startDate && endDate && startDate <= endDate) {
      return { startDate, endDate };
    }
  }

  const range = monthRangeFromYearMonth(selectedMonth);
  return { startDate: range.monthStart, endDate: range.monthEnd };
}
