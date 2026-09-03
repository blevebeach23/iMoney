import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFixedExpenseOccurrences, excludeExistingOccurrences } from "@/lib/fixed-expenses/schedule";
import type { FixedExpenseFormInput } from "@/lib/fixed-expenses/validation";
import type { FixedExpense } from "@/types/domain";

type Row = Record<string, unknown>;

export interface FixedExpenseListItem extends FixedExpense {
  accountName: string | null;
  categoryName: string;
  fundName: string | null;
  macroCategoryName: string;
}

export async function getFixedExpenses(supabase: SupabaseClient, userId: string): Promise<FixedExpenseListItem[]> {
  const { data, error } = await supabase
    .from("fixed_expenses")
    .select("*, categories(name, macro_categories(name)), accounts(name), funds(name)")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("description", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapFixedExpenseListRow);
}

export async function getFixedExpenseById(supabase: SupabaseClient, userId: string, fixedExpenseId: string): Promise<FixedExpenseListItem | null> {
  const { data, error } = await supabase
    .from("fixed_expenses")
    .select("*, categories(name, macro_categories(name)), accounts(name), funds(name)")
    .eq("id", fixedExpenseId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapFixedExpenseListRow(data) : null;
}

export async function createFixedExpense(supabase: SupabaseClient, userId: string, input: FixedExpenseFormInput): Promise<string> {
  const { data, error } = await supabase.from("fixed_expenses").insert(toFixedExpensePayload(userId, input)).select("id").single();

  if (error) {
    throw error;
  }

  return String(data.id);
}

export async function updateFixedExpense(supabase: SupabaseClient, userId: string, input: FixedExpenseFormInput & { id: string }) {
  const { error } = await supabase
    .from("fixed_expenses")
    .update(toFixedExpensePayload(userId, input))
    .eq("id", input.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function syncFixedExpenseFutureMovements(
  supabase: SupabaseClient,
  userId: string,
  fixedExpenseId: string,
  fromMonthStart: string,
  toMonthStart: string,
  today = new Date().toISOString().slice(0, 10)
): Promise<number> {
  const rule = await getFixedExpenseById(supabase, userId, fixedExpenseId);

  if (!rule) {
    throw new Error("Spesa ricorrente non trovata");
  }

  const expected = buildFixedExpenseOccurrences(rule, fromMonthStart, toMonthStart).filter((occurrence) => occurrence.occurredOn >= today);
  const expectedByDate = new Map(expected.map((occurrence) => [occurrence.occurredOn, occurrence]));
  const { data: existingRows, error: existingError } = await supabase
    .from("movements")
    .select("id, occurred_on")
    .eq("fixed_expense_id", fixedExpenseId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .gte("occurred_on", today);

  if (existingError) {
    throw existingError;
  }

  let changed = 0;
  const existingByDate = new Map((existingRows ?? []).map((row: Row) => [String(row.occurred_on), String(row.id)]));
  const deletedAt = new Date().toISOString();
  const obsoleteIds = (existingRows ?? [])
    .filter((row: Row) => !expectedByDate.has(String(row.occurred_on)))
    .map((row: Row) => String(row.id));

  if (obsoleteIds.length > 0) {
    const { error } = await supabase
      .from("movements")
      .update({ deleted_at: deletedAt, updated_by: userId })
      .in("id", obsoleteIds)
      .eq("owner_user_id", userId);

    if (error) {
      throw error;
    }
    changed += obsoleteIds.length;
  }

  for (const [occurredOn, movementId] of existingByDate) {
    if (!expectedByDate.has(occurredOn)) {
      continue;
    }

    const { error } = await supabase
      .from("movements")
      .update({
        household_id: rule.isSharedWithHousehold ? rule.householdId : null,
        account_id: rule.accountId,
        fund_id: rule.fundId,
        category_id: rule.categoryId,
        type: "expense",
        amount: rule.amount,
        occurred_on: occurredOn,
        description: rule.description,
        shared_with_family: rule.isSharedWithHousehold,
        reimbursement_for_movement_id: null,
        notes: "",
        updated_by: userId
      })
      .eq("id", movementId)
      .eq("owner_user_id", userId)
      .is("deleted_at", null);

    if (error) {
      throw error;
    }
    changed += 1;
  }

  const missing = expected.filter((occurrence) => !existingByDate.has(occurrence.occurredOn));
  if (missing.length > 0) {
    const inserted = await insertFixedExpenseMovements(supabase, userId, rule, missing);
    changed += inserted;
  }

  return changed;
}

export async function deactivateFixedExpense(supabase: SupabaseClient, userId: string, fixedExpenseId: string) {
  const { error } = await supabase
    .from("fixed_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", fixedExpenseId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function softDeleteFutureFixedExpenseMovements(
  supabase: SupabaseClient,
  userId: string,
  fixedExpenseId: string,
  today = new Date().toISOString().slice(0, 10)
): Promise<number> {
  const { data, error: readError } = await supabase
    .from("movements")
    .select("id")
    .eq("fixed_expense_id", fixedExpenseId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .gte("occurred_on", today);

  if (readError) {
    throw readError;
  }

  const ids = (data ?? []).map((row: Row) => String(row.id));
  if (ids.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("movements")
    .update({ deleted_at: new Date().toISOString(), updated_by: userId })
    .in("id", ids)
    .eq("owner_user_id", userId);

  if (error) {
    throw error;
  }

  return ids.length;
}

export async function generateFixedExpenseMovements(
  supabase: SupabaseClient,
  userId: string,
  fixedExpenseId: string,
  fromMonthStart: string,
  toMonthStart: string
): Promise<number> {
  const rule = await getFixedExpenseById(supabase, userId, fixedExpenseId);

  if (!rule) {
    throw new Error("Spesa ricorrente non trovata");
  }

  const occurrences = buildFixedExpenseOccurrences(rule, fromMonthStart, toMonthStart);
  if (occurrences.length === 0) {
    return 0;
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("movements")
    .select("fixed_expense_id, occurred_on")
    .eq("fixed_expense_id", fixedExpenseId)
    .is("deleted_at", null);

  if (existingError) {
    throw existingError;
  }

  const existing = (existingRows ?? []).map((row: Row) => ({
    fixedExpenseId: row.fixed_expense_id ? String(row.fixed_expense_id) : null,
    occurredOn: String(row.occurred_on)
  }));
  const pending = excludeExistingOccurrences(occurrences, existing);

  if (pending.length === 0) {
    return 0;
  }

  return insertFixedExpenseMovements(supabase, userId, rule, pending);
}

async function insertFixedExpenseMovements(
  supabase: SupabaseClient,
  userId: string,
  rule: FixedExpenseListItem,
  occurrences: Array<{ occurredOn: string }>
): Promise<number> {
  const { data: inserted, error: insertError } = await supabase
    .from("movements")
    .insert(
      occurrences.map((occurrence) => ({
        owner_user_id: userId,
        household_id: rule.isSharedWithHousehold ? rule.householdId : null,
        account_id: rule.accountId,
        fund_id: rule.fundId,
        category_id: rule.categoryId,
        type: "expense",
        amount: rule.amount,
        occurred_on: occurrence.occurredOn,
        description: rule.description,
        shared_with_family: rule.isSharedWithHousehold,
        fixed_expense_id: rule.id,
        notes: "",
        created_by: userId,
        updated_by: userId
      }))
    )
    .select("id, occurred_on");

  if (insertError) {
    throw insertError;
  }

  const monthRows = (inserted ?? []).map((row: Row) => ({
    fixed_expense_id: rule.id,
    month: String(row.occurred_on).slice(0, 7) + "-01",
    movement_id: String(row.id),
    generated_at: new Date().toISOString()
  }));

  if (monthRows.length > 0) {
    const { error: monthError } = await supabase.from("fixed_expense_months").upsert(monthRows, {
      onConflict: "fixed_expense_id,month"
    });

    if (monthError) {
      throw monthError;
    }
  }

  return occurrences.length;
}

export function toFixedExpensePayload(userId: string, input: FixedExpenseFormInput) {
  return {
    owner_user_id: userId,
    household_id: input.sharedWithFamily ? input.householdId : null,
    account_id: input.accountId,
    fund_id: input.fundId,
    category_id: input.categoryId,
    amount: input.amount,
    description: input.description,
    frequency: "monthly",
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    shared_with_family: input.sharedWithFamily,
    day_of_month: input.dayOfMonth,
    active_months: [...new Set(input.activeMonths)].sort((a, b) => a - b)
  };
}

function mapFixedExpenseListRow(row: Row): FixedExpenseListItem {
  const category = asRecord(row.categories);
  const macro = asRecord(category?.macro_categories);
  const account = asRecord(row.accounts);
  const fund = asRecord(row.funds);

  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    householdId: row.household_id ? String(row.household_id) : null,
    accountId: row.account_id ? String(row.account_id) : null,
    fundId: row.fund_id ? String(row.fund_id) : null,
    categoryId: String(row.category_id),
    amount: String(row.amount),
    description: String(row.description ?? ""),
    frequency: row.frequency as FixedExpense["frequency"],
    startsOn: String(row.starts_on),
    endsOn: row.ends_on ? String(row.ends_on) : null,
    dayOfMonth: Number(row.day_of_month ?? 1),
    activeMonths: Array.isArray(row.active_months) ? row.active_months.map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    isSharedWithHousehold: Boolean(row.shared_with_family),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    accountName: account?.name ? String(account.name) : null,
    categoryName: String(category?.name ?? "Categoria"),
    fundName: fund?.name ? String(fund.name) : null,
    macroCategoryName: String(macro?.name ?? "")
  };
}

function asRecord(value: unknown): Row | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }

  return null;
}
