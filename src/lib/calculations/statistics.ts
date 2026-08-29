import type { Budget, Movement } from "@/types/domain";
import { calculateAnnualTrend } from "./annual-trend";
import { calculateBudgetReport, type BudgetReport } from "./budget";
import { calculateCategoryAggregates, type CategoryAggregate, type MacroCategoryAggregate, type MovementCategoryInfo } from "./category-aggregates";
import { calculateMonthlySummary } from "./monthly-summary";
import { formatMoney, sumMoney } from "./money";

export type StatisticsScope = "personal" | "family";
export type StatisticsPeriodKind = "month" | "year" | "custom";

export interface StatisticsMonthlyPoint {
  month: string;
  label: string;
  income: number;
  grossExpenses: number;
  reimbursements: number;
  netExpenses: number;
  economicBalance: number;
}

export interface YearComparisonPoint {
  year: number;
  income: string;
  netExpenses: string;
  reimbursements: string;
  economicBalance: string;
}

export interface StatisticsReport {
  scope: StatisticsScope;
  periodKind: StatisticsPeriodKind;
  startDate: string;
  endDate: string;
  selectedMonth: string;
  selectedYear: number;
  summary: ReturnType<typeof calculateMonthlySummary>;
  monthlyTrend: StatisticsMonthlyPoint[];
  macroCategories: MacroCategoryAggregate[];
  categories: CategoryAggregate[];
  reimbursements: Movement[];
  budgetReport: BudgetReport;
  yearComparison: YearComparisonPoint[];
  archiveYears: number[];
}

export function buildStatisticsReport(input: {
  scope: StatisticsScope;
  periodKind: StatisticsPeriodKind;
  movements: Movement[];
  budgets: Budget[];
  categoryInfoById: Map<string, MovementCategoryInfo>;
  startDate: string;
  endDate: string;
  selectedMonth: string;
  selectedYear: number;
}): StatisticsReport {
  const activeMovements = input.movements.filter((movement) => movement.deletedAt === null);
  const periodMovements = filterMovementsByDateRange(activeMovements, input.startDate, input.endDate);
  const monthMovements = activeMovements.filter((movement) => movement.occurredOn.startsWith(input.selectedMonth));
  const categoryAggregates = calculateCategoryAggregates(periodMovements, input.categoryInfoById);

  return {
    scope: input.scope,
    periodKind: input.periodKind,
    startDate: input.startDate,
    endDate: input.endDate,
    selectedMonth: input.selectedMonth,
    selectedYear: input.selectedYear,
    summary: calculateMonthlySummary(periodMovements),
    monthlyTrend: calculateMonthlyStatistics(activeMovements, input.selectedYear),
    macroCategories: categoryAggregates.macroCategories,
    categories: categoryAggregates.categories,
    reimbursements: periodMovements.filter((movement) => movement.type === "reimbursement"),
    budgetReport: calculateBudgetReport(input.budgets, monthMovements, input.categoryInfoById),
    yearComparison: calculateYearComparison(activeMovements),
    archiveYears: calculateArchiveYears(activeMovements)
  };
}

export function filterMovementsForStatistics(input: {
  personalMovements: Movement[];
  familyMovements: Movement[];
  scope: StatisticsScope;
  householdId?: string | null;
}): Movement[] {
  if (input.scope === "family") {
    return input.familyMovements.filter(
      (movement) => movement.isSharedWithHousehold && (!input.householdId || movement.householdId === input.householdId)
    );
  }

  return input.personalMovements;
}

export function filterMovementsByDateRange(movements: Movement[], startDate: string, endDate: string): Movement[] {
  return movements.filter((movement) => movement.occurredOn >= startDate && movement.occurredOn <= endDate);
}

export function calculateMonthlyStatistics(movements: Movement[], year: number): StatisticsMonthlyPoint[] {
  return calculateAnnualTrend(movements, year).map((point) => ({
    month: point.month,
    label: point.label,
    income: Number(point.summary.income),
    grossExpenses: Number(point.summary.grossExpenses),
    reimbursements: Number(point.summary.reimbursements),
    netExpenses: Number(point.summary.netExpenses),
    economicBalance: Number(point.summary.economicBalance)
  }));
}

export function calculateYearComparison(movements: Movement[]): YearComparisonPoint[] {
  return calculateArchiveYears(movements).map((year) => {
    const summary = calculateMonthlySummary(filterMovementsByDateRange(movements, `${year}-01-01`, `${year}-12-31`));

    return {
      year,
      income: summary.income,
      netExpenses: summary.netExpenses,
      reimbursements: summary.reimbursements,
      economicBalance: summary.economicBalance
    };
  });
}

export function calculateArchiveYears(movements: Movement[]): number[] {
  return [
    ...new Set(
      movements
        .filter((movement) => movement.deletedAt === null)
        .map((movement) => Number(movement.occurredOn.slice(0, 4)))
        .filter((year) => Number.isInteger(year))
    )
  ].sort((a, b) => b - a);
}

export function calculateYearTotalNetExpenses(movements: Movement[], year: number): string {
  const monthly = calculateMonthlyStatistics(movements, year);
  return formatMoney(sumMoney(monthly.map((point) => point.netExpenses)));
}
