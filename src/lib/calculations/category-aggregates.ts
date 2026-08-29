import type { Movement } from "@/types/domain";
import { formatMoney, toDecimal } from "./money";

export interface MovementCategoryInfo {
  categoryId: string;
  categoryName: string;
  macroCategoryId: string;
  macroCategoryName: string;
}

export interface CategoryAggregate {
  categoryId: string;
  categoryName: string;
  macroCategoryId: string;
  macroCategoryName: string;
  grossExpenses: string;
  reimbursements: string;
  netExpenses: string;
  income: string;
}

export interface MacroCategoryAggregate {
  macroCategoryId: string;
  macroCategoryName: string;
  grossExpenses: string;
  reimbursements: string;
  netExpenses: string;
  income: string;
}

export function calculateCategoryAggregates(
  movements: Movement[],
  categoryInfoById: Map<string, MovementCategoryInfo>
): { categories: CategoryAggregate[]; macroCategories: MacroCategoryAggregate[] } {
  const categoryTotals = new Map<string, Totals>();
  const macroTotals = new Map<string, Totals>();

  for (const movement of movements) {
    if (movement.deletedAt !== null || !movement.categoryId) {
      continue;
    }

    const info = categoryInfoById.get(movement.categoryId);
    if (!info) {
      continue;
    }

    applyMovement(categoryTotals, info.categoryId, info.categoryName, info.macroCategoryId, info.macroCategoryName, movement);
    applyMovement(macroTotals, info.macroCategoryId, info.macroCategoryName, info.macroCategoryId, info.macroCategoryName, movement);
  }

  return {
    categories: [...categoryTotals.values()].map((total) => ({
      categoryId: total.id,
      categoryName: total.name,
      macroCategoryId: total.macroCategoryId,
      macroCategoryName: total.macroCategoryName,
      ...formatTotals(total)
    })),
    macroCategories: [...macroTotals.values()].map((total) => ({
      macroCategoryId: total.id,
      macroCategoryName: total.name,
      ...formatTotals(total)
    }))
  };
}

interface Totals {
  id: string;
  name: string;
  macroCategoryId: string;
  macroCategoryName: string;
  grossExpenses: ReturnType<typeof toDecimal>;
  income: ReturnType<typeof toDecimal>;
  reimbursements: ReturnType<typeof toDecimal>;
}

function applyMovement(
  totals: Map<string, Totals>,
  id: string,
  name: string,
  macroCategoryId: string,
  macroCategoryName: string,
  movement: Movement
) {
  const total =
    totals.get(id) ??
    ({
      id,
      name,
      macroCategoryId,
      macroCategoryName,
      grossExpenses: toDecimal(0),
      income: toDecimal(0),
      reimbursements: toDecimal(0)
    } satisfies Totals);

  if (movement.type === "expense") {
    total.grossExpenses = total.grossExpenses.plus(movement.amount);
  } else if (movement.type === "reimbursement") {
    total.reimbursements = total.reimbursements.plus(movement.amount);
  } else {
    total.income = total.income.plus(movement.amount);
  }

  totals.set(id, total);
}

function formatTotals(total: Totals) {
  const netExpenses = total.grossExpenses.minus(total.reimbursements);

  return {
    grossExpenses: formatMoney(total.grossExpenses),
    reimbursements: formatMoney(total.reimbursements),
    netExpenses: formatMoney(netExpenses),
    income: formatMoney(total.income)
  };
}
