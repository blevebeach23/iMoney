import type { Budget, Movement } from "@/types/domain";
import { calculateCategoryAggregates, type MovementCategoryInfo } from "./category-aggregates";
import { calculateMonthlySummary } from "./monthly-summary";
import { formatMoney, toDecimal } from "./money";

export interface BudgetUsage {
  budgetAmount: string;
  used: string;
  remaining: string;
  usedPercentage: number;
}

export interface BudgetReportItem {
  budget: Budget;
  label: string;
  scope: "general" | "macro" | "category";
  usage: BudgetUsage;
}

export interface BudgetReport {
  general: BudgetReportItem | null;
  macroCategories: BudgetReportItem[];
  categories: BudgetReportItem[];
}

export function calculateBudgetUsage(monthlyBudgetAmount: string, monthMovements: Movement[]): BudgetUsage {
  const summary = calculateMonthlySummary(monthMovements);
  return calculateBudgetUsageFromNetExpense(monthlyBudgetAmount, summary.netExpenses);
}

export function calculateBudgetUsageFromNetExpense(monthlyBudgetAmount: string, netExpense: string): BudgetUsage {
  const budget = toDecimal(monthlyBudgetAmount);
  const used = toDecimal(netExpense);
  const remaining = budget.minus(used);
  const usedPercentage = budget.isZero() ? 0 : clampNumber(used.dividedBy(budget).times(100).toNumber(), 0, 999);

  return {
    budgetAmount: formatMoney(budget),
    used: formatMoney(used),
    remaining: formatMoney(remaining),
    usedPercentage
  };
}

export function calculateBudgetReport(budgets: Budget[], monthMovements: Movement[], categoryInfoById: Map<string, MovementCategoryInfo>): BudgetReport {
  const activeBudgets = budgets.filter((budget) => budget.deletedAt === null);
  const aggregates = calculateCategoryAggregates(monthMovements, categoryInfoById);
  const macroNetExpenses = new Map(aggregates.macroCategories.map((item) => [item.macroCategoryId, item.netExpenses]));
  const categoryNetExpenses = new Map(aggregates.categories.map((item) => [item.categoryId, item.netExpenses]));

  const generalBudget = activeBudgets.find((budget) => !budget.macroCategoryId && !budget.categoryId) ?? null;
  const general = generalBudget ? toReportItem(generalBudget, "Budget mensile", "general", calculateBudgetUsage(generalBudget.amount, monthMovements)) : null;

  const macroCategories = activeBudgets
    .filter((budget) => budget.macroCategoryId)
    .map((budget) =>
      toReportItem(
        budget,
        categoryInfoByIdValues(categoryInfoById).find((info) => info.macroCategoryId === budget.macroCategoryId)?.macroCategoryName ?? "Macro-categoria",
        "macro",
        calculateBudgetUsageFromNetExpense(budget.amount, macroNetExpenses.get(String(budget.macroCategoryId)) ?? "0.00")
      )
    );

  const categories = activeBudgets
    .filter((budget) => budget.categoryId)
    .map((budget) => {
      const info = categoryInfoById.get(String(budget.categoryId));

      return toReportItem(
        budget,
        info ? `${info.macroCategoryName} / ${info.categoryName}` : "Categoria",
        "category",
        calculateBudgetUsageFromNetExpense(budget.amount, categoryNetExpenses.get(String(budget.categoryId)) ?? "0.00")
      );
    });

  return { general, macroCategories, categories };
}

function categoryInfoByIdValues(categoryInfoById: Map<string, MovementCategoryInfo>): MovementCategoryInfo[] {
  return [...categoryInfoById.values()];
}

function toReportItem(budget: Budget, label: string, scope: BudgetReportItem["scope"], usage: BudgetUsage): BudgetReportItem {
  return { budget, label, scope, usage };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

