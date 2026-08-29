import type { SupabaseClient } from "@supabase/supabase-js";
import type { Movement } from "@/types/domain";
import type { MovementCategoryInfo } from "@/lib/calculations/category-aggregates";
import type { MovementFormInput } from "@/lib/movements/validation";

type MovementRow = Record<string, unknown>;

export interface MovementFilters {
  period?: string;
  type?: "all" | Movement["type"];
  macroCategoryId?: string;
  categoryId?: string;
  containerId?: string;
  reimbursement?: "all" | "yes" | "no";
  shared?: "all" | "yes" | "no";
}

export interface MovementListItem extends Movement {
  accountName: string | null;
  categoryName: string;
  fundName: string | null;
  macroCategoryName: string;
}

export async function getMovements(supabase: SupabaseClient, userId: string, filters: MovementFilters = {}): Promise<MovementListItem[]> {
  let query = supabase
    .from("movements")
    .select("*, categories(name, macro_categories(id, name)), accounts(name), funds(name)")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.period) {
    const [year, month] = filters.period.split("-");
    if (year && month) {
      query = query.gte("occurred_on", `${year}-${month}-01`).lte("occurred_on", new Date(Number(year), Number(month), 0).toISOString().slice(0, 10));
    }
  }

  if (filters.type && filters.type !== "all") {
    query = query.eq("type", filters.type);
  }

  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  if (filters.containerId?.startsWith("account:")) {
    query = query.eq("account_id", filters.containerId.slice("account:".length));
  }

  if (filters.containerId?.startsWith("fund:")) {
    query = query.eq("fund_id", filters.containerId.slice("fund:".length));
  }

  if (filters.reimbursement === "yes") {
    query = query.eq("type", "reimbursement");
  } else if (filters.reimbursement === "no") {
    query = query.neq("type", "reimbursement");
  }

  if (filters.shared === "yes") {
    query = query.eq("shared_with_family", true);
  } else if (filters.shared === "no") {
    query = query.eq("shared_with_family", false);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map(mapMovementListRow)
    .filter((movement) => !filters.macroCategoryId || String(asRecord(movement.rawCategory?.macro_categories)?.id ?? "") === filters.macroCategoryId)
    .map(stripRawCategory);
}

export async function getMonthlyMovements(
  supabase: SupabaseClient,
  userId: string,
  monthStart: string,
  monthEnd: string
): Promise<Movement[]> {
  const { data, error } = await supabase
    .from("movements")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .gte("occurred_on", monthStart)
    .lte("occurred_on", monthEnd)
    .order("occurred_on", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapMovementRow);
}

export async function getMovementsBetween(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<Movement[]> {
  const { data, error } = await supabase
    .from("movements")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .gte("occurred_on", startDate)
    .lte("occurred_on", endDate)
    .order("occurred_on", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapMovementRow);
}

export async function getMovementsUntil(supabase: SupabaseClient, userId: string, cutoffDate: string): Promise<Movement[]> {
  const { data, error } = await supabase
    .from("movements")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .lte("occurred_on", cutoffDate)
    .order("occurred_on", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapMovementRow);
}

export async function getMovementCategoryInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, MovementCategoryInfo>> {
  const { data, error } = await supabase
    .from("macro_categories")
    .select("id, name, categories(id, name)")
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  const map = new Map<string, MovementCategoryInfo>();

  for (const macro of data ?? []) {
    const macroRow = asRecord(macro);
    const categories = Array.isArray(macroRow?.categories) ? macroRow.categories : [];
    for (const category of categories) {
      const categoryRow = asRecord(category);
      if (!categoryRow?.id) {
        continue;
      }

      map.set(String(categoryRow.id), {
        categoryId: String(categoryRow.id),
        categoryName: String(categoryRow.name ?? ""),
        macroCategoryId: String(macroRow?.id ?? ""),
        macroCategoryName: String(macroRow?.name ?? "")
      });
    }
  }

  return map;
}

export async function getMovementById(supabase: SupabaseClient, userId: string, movementId: string): Promise<MovementListItem | null> {
  const { data, error } = await supabase
    .from("movements")
    .select("*, categories(name, macro_categories(id, name)), accounts(name), funds(name)")
    .eq("id", movementId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? stripRawCategory(mapMovementListRow(data)) : null;
}

export async function createMovement(supabase: SupabaseClient, userId: string, input: MovementFormInput) {
  const { error } = await supabase.from("movements").insert(toMovementPayload(userId, input, true));

  if (error) {
    throw error;
  }
}

export async function updateMovement(supabase: SupabaseClient, userId: string, input: MovementFormInput & { id: string }) {
  const { error } = await supabase
    .from("movements")
    .update(toMovementPayload(userId, input, false))
    .eq("id", input.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function softDeleteMovement(supabase: SupabaseClient, userId: string, movementId: string) {
  const { error } = await supabase
    .from("movements")
    .update({ deleted_at: new Date().toISOString(), updated_by: userId })
    .eq("id", movementId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function duplicateMovement(supabase: SupabaseClient, userId: string, movementId: string) {
  const original = await getMovementById(supabase, userId, movementId);

  if (!original) {
    throw new Error("Movimento non trovato");
  }

  await createMovement(supabase, userId, buildDuplicateInput(original));
}

export function buildDuplicateInput(original: Movement): MovementFormInput {
  return {
    occurredOn: new Date().toISOString().slice(0, 10),
    description: original.description,
    categoryId: String(original.categoryId),
    type: original.type === "reimbursement" ? "income" : original.type,
    amount: original.amount,
    accountId: original.accountId,
    fundId: original.fundId,
    containerId: original.accountId ? `account:${original.accountId}` : `fund:${original.fundId}`,
    isReimbursement: original.type === "reimbursement",
    reimbursementForMovementId: original.reimbursementForMovementId,
    sharedWithFamily: original.isSharedWithHousehold,
    householdId: original.householdId,
    notes: original.notes
  };
}

function toMovementPayload(userId: string, input: MovementFormInput, isCreate: boolean) {
  return {
    owner_user_id: userId,
    household_id: input.sharedWithFamily ? input.householdId : null,
    account_id: input.accountId,
    fund_id: input.fundId,
    category_id: input.categoryId,
    type: input.isReimbursement ? "reimbursement" : input.type,
    amount: input.amount,
    occurred_on: input.occurredOn,
    description: input.description,
    shared_with_family: input.sharedWithFamily,
    reimbursement_for_movement_id: input.isReimbursement ? input.reimbursementForMovementId : null,
    notes: input.notes,
    created_by: isCreate ? userId : undefined,
    updated_by: userId
  };
}

function mapMovementListRow(row: MovementRow): MovementListItem & { rawCategory?: MovementRow } {
  const category = asRecord(row.categories);
  const macro = asRecord(category?.macro_categories);
  const account = asRecord(row.accounts);
  const fund = asRecord(row.funds);

  return {
    ...mapMovementRow(row),
    accountName: account?.name ? String(account.name) : null,
    categoryName: String(category?.name ?? "Senza categoria"),
    fundName: fund?.name ? String(fund.name) : null,
    macroCategoryName: String(macro?.name ?? ""),
    rawCategory: category ?? undefined
  };
}

function stripRawCategory(item: MovementListItem & { rawCategory?: MovementRow }): MovementListItem {
  const { rawCategory: _rawCategory, ...movement } = item;
  return movement;
}

function mapMovementRow(row: MovementRow): Movement {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    householdId: row.household_id ? String(row.household_id) : null,
    accountId: row.account_id ? String(row.account_id) : null,
    fundId: row.fund_id ? String(row.fund_id) : null,
    categoryId: row.category_id ? String(row.category_id) : null,
    type: row.type as Movement["type"],
    amount: String(row.amount),
    occurredOn: String(row.occurred_on),
    description: String(row.description ?? ""),
    notes: String(row.notes ?? ""),
    isSharedWithHousehold: Boolean(row.shared_with_family),
    reimbursementForMovementId: row.reimbursement_for_movement_id ? String(row.reimbursement_for_movement_id) : null,
    importBatchId: row.import_batch_id ? String(row.import_batch_id) : null,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null
  };
}

function asRecord(value: unknown): MovementRow | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as MovementRow;
  }

  return null;
}
