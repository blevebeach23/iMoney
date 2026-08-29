import type { SupabaseClient } from "@supabase/supabase-js";
import type { Budget } from "@/types/domain";
import type { BudgetFormInput } from "@/lib/budgets/validation";

type BudgetRow = Record<string, unknown>;

export interface BudgetListItem extends Budget {
  macroCategoryName: string | null;
  categoryName: string | null;
}

export async function getPersonalBudgetsForMonth(supabase: SupabaseClient, userId: string, monthStart: string): Promise<BudgetListItem[]> {
  const { data, error } = await supabase
    .from("budgets")
    .select("*, macro_categories(name), categories(name)")
    .eq("owner_type", "USER")
    .eq("owner_user_id", userId)
    .eq("month", monthStart)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapBudgetListRow);
}

export async function getHouseholdBudgetsForMonth(supabase: SupabaseClient, householdId: string, monthStart: string): Promise<BudgetListItem[]> {
  const { data, error } = await supabase
    .from("budgets")
    .select("*, macro_categories(name), categories(name)")
    .eq("owner_type", "HOUSEHOLD")
    .eq("household_id", householdId)
    .eq("month", monthStart)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapBudgetListRow);
}

export async function getPreviousPersonalBudgets(supabase: SupabaseClient, userId: string, previousMonthStart: string): Promise<BudgetListItem[]> {
  return getPersonalBudgetsForMonth(supabase, userId, previousMonthStart);
}

export async function createBudget(supabase: SupabaseClient, userId: string, input: BudgetFormInput) {
  const { error } = await supabase.from("budgets").insert(toBudgetPayload(userId, input));

  if (error) {
    throw error;
  }
}

export async function createHouseholdBudget(supabase: SupabaseClient, householdId: string, input: BudgetFormInput) {
  const { error } = await supabase.from("budgets").insert(toHouseholdBudgetPayload(householdId, input));

  if (error) {
    throw error;
  }
}

export async function updateHouseholdBudget(supabase: SupabaseClient, householdId: string, input: BudgetFormInput & { id: string }) {
  const { error } = await supabase
    .from("budgets")
    .update(toHouseholdBudgetPayload(householdId, input))
    .eq("id", input.id)
    .eq("owner_type", "HOUSEHOLD")
    .eq("household_id", householdId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function deactivateHouseholdBudget(supabase: SupabaseClient, householdId: string, budgetId: string) {
  const { error } = await supabase
    .from("budgets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", budgetId)
    .eq("owner_type", "HOUSEHOLD")
    .eq("household_id", householdId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function updateBudget(supabase: SupabaseClient, userId: string, input: BudgetFormInput & { id: string }) {
  const { error } = await supabase
    .from("budgets")
    .update(toBudgetPayload(userId, input))
    .eq("id", input.id)
    .eq("owner_type", "USER")
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function deactivateBudget(supabase: SupabaseClient, userId: string, budgetId: string) {
  const { error } = await supabase
    .from("budgets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", budgetId)
    .eq("owner_type", "USER")
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function copyMissingPersonalBudgets(supabase: SupabaseClient, userId: string, fromMonthStart: string, toMonthStart: string) {
  const [source, target] = await Promise.all([
    getPreviousPersonalBudgets(supabase, userId, fromMonthStart),
    getPersonalBudgetsForMonth(supabase, userId, toMonthStart)
  ]);
  const targetKeys = new Set(target.map(budgetScopeKey));
  const rows = source.filter((budget) => !targetKeys.has(budgetScopeKey(budget))).map((budget) => ({
    owner_type: "USER",
    owner_user_id: userId,
    household_id: null,
    month: toMonthStart,
    macro_category_id: budget.macroCategoryId,
    category_id: budget.categoryId,
    amount: budget.amount
  }));

  if (rows.length === 0) {
    return 0;
  }

  const { error } = await supabase.from("budgets").insert(rows);

  if (error) {
    throw error;
  }

  return rows.length;
}

function budgetScopeKey(budget: Pick<Budget, "macroCategoryId" | "categoryId">): string {
  if (budget.categoryId) {
    return `category:${budget.categoryId}`;
  }

  if (budget.macroCategoryId) {
    return `macro:${budget.macroCategoryId}`;
  }

  return "general";
}

function toBudgetPayload(userId: string, input: BudgetFormInput) {
  return {
    owner_type: "USER",
    owner_user_id: userId,
    household_id: null,
    month: input.month,
    macro_category_id: input.scopeKind === "macro" ? input.macroCategoryId : null,
    category_id: input.scopeKind === "category" ? input.categoryId : null,
    amount: input.amount
  };
}

function toHouseholdBudgetPayload(householdId: string, input: BudgetFormInput) {
  return {
    owner_type: "HOUSEHOLD",
    owner_user_id: null,
    household_id: householdId,
    month: input.month,
    macro_category_id: input.scopeKind === "macro" ? input.macroCategoryId : null,
    category_id: input.scopeKind === "category" ? input.categoryId : null,
    amount: input.amount
  };
}

function mapBudgetListRow(row: BudgetRow): BudgetListItem {
  const macroCategory = asRecord(row.macro_categories);
  const category = asRecord(row.categories);

  return {
    id: String(row.id),
    ownerType: row.owner_type as Budget["ownerType"],
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    householdId: row.household_id ? String(row.household_id) : null,
    month: String(row.month),
    macroCategoryId: row.macro_category_id ? String(row.macro_category_id) : null,
    categoryId: row.category_id ? String(row.category_id) : null,
    amount: String(row.amount),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    macroCategoryName: macroCategory?.name ? String(macroCategory.name) : null,
    categoryName: category?.name ? String(category.name) : null
  };
}

function asRecord(value: unknown): BudgetRow | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as BudgetRow;
  }

  return null;
}
