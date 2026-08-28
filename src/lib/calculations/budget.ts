import type { Movement } from "@/types/domain";
import { calculateMonthlySummary } from "./monthly-summary";
import { formatMoney, toDecimal } from "./money";

export interface BudgetUsage {
  budgetAmount: string;
  used: string;
  remaining: string;
  usedPercentage: number;
}

export function calculateBudgetUsage(monthlyBudgetAmount: string, monthMovements: Movement[]): BudgetUsage {
  const summary = calculateMonthlySummary(monthMovements);
  const budget = toDecimal(monthlyBudgetAmount);
  const used = toDecimal(summary.netExpenses);
  const remaining = budget.minus(used);
  const usedPercentage = budget.isZero() ? 0 : clampNumber(used.dividedBy(budget).times(100).toNumber(), 0, 999);

  return {
    budgetAmount: formatMoney(budget),
    used: formatMoney(used),
    remaining: formatMoney(remaining),
    usedPercentage
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

