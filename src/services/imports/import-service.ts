import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeText } from "@/lib/imports/normalization";
import { rebuildBalanceCaches } from "@/services/balances/balance-service";
import type { ImportBatch, MovementType } from "@/types/domain";

type Row = Record<string, unknown>;

export interface ImportMovementInput {
  occurredOn: string;
  description: string;
  amount: string;
  type: MovementType;
  categoryId: string;
  accountId: string | null;
  fundId: string | null;
  isReimbursement: boolean;
  sharedWithFamily: boolean;
  householdId: string | null;
  notes: string;
  createCategoryName?: string;
}

export interface ConfirmImportInput {
  filename: string;
  rows: ImportMovementInput[];
  macroCategoryIdForNew?: string;
}

export async function getImportBatches(supabase: SupabaseClient, userId: string): Promise<ImportBatch[]> {
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapImportBatchRow);
}

export async function confirmMovementImport(supabase: SupabaseClient, userId: string, input: ConfirmImportInput): Promise<ImportBatch> {
  const rows = await resolveCreatedImportCategories(supabase, userId, input.rows, input.macroCategoryIdForNew);

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert(buildImportBatchPayload(userId, input.filename, rows.length))
    .select("*")
    .single();

  if (batchError) {
    throw batchError;
  }

  if (rows.length > 0) {
    const { error: movementError } = await supabase.from("movements").insert(buildImportedMovementPayloads(userId, String(batch.id), rows));

    if (movementError) {
      throw movementError;
    }
  }

  await rebuildBalanceCaches(supabase, userId);

  return mapImportBatchRow(batch);
}

export async function undoImportBatch(supabase: SupabaseClient, userId: string, batchId: string) {
  const { error: readError } = await supabase
    .from("movements")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("import_batch_id", batchId)
    .is("deleted_at", null);

  if (readError) {
    throw readError;
  }

  const { error } = await supabase
    .from("movements")
    .update(buildUndoImportPatch(userId))
    .eq("owner_user_id", userId)
    .eq("import_batch_id", batchId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  await rebuildBalanceCaches(supabase, userId);
}

export function buildImportBatchPayload(userId: string, filename: string, importedRows: number) {
  return {
    owner_user_id: userId,
    source_filename: filename,
    imported_rows: importedRows
  };
}

export function buildImportedMovementPayloads(userId: string, batchId: string, rows: ImportMovementInput[]) {
  return rows.map((row) => ({
    owner_user_id: userId,
    household_id: row.sharedWithFamily ? row.householdId : null,
    account_id: row.accountId,
    fund_id: row.fundId,
    category_id: row.categoryId,
    type: row.isReimbursement ? "reimbursement" : row.type,
    amount: row.amount,
    occurred_on: row.occurredOn,
    description: row.description,
    shared_with_family: row.sharedWithFamily,
    reimbursement_for_movement_id: null,
    import_batch_id: batchId,
    notes: row.notes,
    created_by: userId,
    updated_by: userId
  }));
}

export function buildUndoImportPatch(userId: string, deletedAt = new Date().toISOString()) {
  return {
    deleted_at: deletedAt,
    updated_by: userId
  };
}

export function getAffectedContainerIds(rows: Pick<ImportMovementInput, "accountId" | "fundId">[]) {
  return {
    accountIds: new Set(rows.map((row) => row.accountId).filter((id): id is string => Boolean(id))),
    fundIds: new Set(rows.map((row) => row.fundId).filter((id): id is string => Boolean(id)))
  };
}

export async function resolveCreatedImportCategories(
  supabase: SupabaseClient,
  userId: string,
  rows: ImportMovementInput[],
  macroCategoryIdForNew: string | undefined
): Promise<ImportMovementInput[]> {
  const newNamesByNormalizedName = new Map<string, string>();
  for (const row of rows) {
    const name = row.createCategoryName?.trim();
    if (name) {
      newNamesByNormalizedName.set(normalizeText(name), name);
    }
  }
  const newNames = [...newNamesByNormalizedName.values()];

  if (newNames.length === 0) {
    return rows;
  }

  const targetMacroCategoryId = macroCategoryIdForNew ?? await ensureImportOtherMacroCategory(supabase, userId);
  const categoryIdByName = await getCategoryIdsByNormalizedName(supabase, targetMacroCategoryId);
  const namesToCreate = newNames.filter((name) => !categoryIdByName.has(normalizeText(name)));

  if (namesToCreate.length > 0) {
    const { error } = await supabase
      .from("categories")
      .insert(namesToCreate.map((name, index) => ({ macro_category_id: targetMacroCategoryId, name, sort_order: 1000 + index })))
      .select("id, name");

    if (error) {
      const existingAfterConflict = await getCategoryIdsByNormalizedName(supabase, targetMacroCategoryId);
      const unresolved = namesToCreate.filter((name) => !existingAfterConflict.has(normalizeText(name)));
      if (unresolved.length > 0) {
        throw error;
      }
      for (const [name, id] of existingAfterConflict.entries()) {
        categoryIdByName.set(name, id);
      }
    } else {
      const created = await getCategoryIdsByNormalizedName(supabase, targetMacroCategoryId);
      for (const [name, id] of created.entries()) {
        categoryIdByName.set(name, id);
      }
    }
  }

  return rows.map((row) => {
    if (!row.createCategoryName) {
      return row;
    }

    const categoryId = categoryIdByName.get(normalizeText(row.createCategoryName));
    return categoryId ? { ...row, categoryId } : row;
  });
}

export async function ensureImportOtherMacroCategory(supabase: SupabaseClient, userId: string): Promise<string> {
  const existingMacroId = await findImportOtherMacroCategoryId(supabase, userId);
  if (existingMacroId) {
    return existingMacroId;
  }

  const { data, error } = await supabase
    .from("macro_categories")
    .insert({ owner_user_id: userId, name: "Altro", sort_order: 1000 })
    .select("id")
    .single();

  if (!error && data) {
    return String((data as Row).id);
  }

  const macroIdAfterConflict = await findImportOtherMacroCategoryId(supabase, userId);
  if (macroIdAfterConflict) {
    return macroIdAfterConflict;
  }

  throw error ?? new Error("Macro-categoria Altro non disponibile");
}

async function findImportOtherMacroCategoryId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("macro_categories")
    .select("id, name")
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  const row = (data ?? []).find((item: Row) => normalizeText(String(item.name ?? "")) === "altro");
  return row ? String(row.id) : null;
}

async function getCategoryIdsByNormalizedName(supabase: SupabaseClient, macroCategoryId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("macro_category_id", macroCategoryId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row: Row) => [normalizeText(String(row.name ?? "")), String(row.id)]));
}

function mapImportBatchRow(row: Row): ImportBatch {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    sourceFilename: String(row.source_filename),
    importedRows: Number(row.imported_rows),
    createdAt: String(row.created_at)
  };
}
