import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { categoryFormSchema, macroCategoryFormSchema } from "@/lib/master-data/validation";
import type { Category, MacroCategory } from "@/types/domain";

type MacroCategoryInput = z.infer<typeof macroCategoryFormSchema>;
type CategoryInput = z.infer<typeof categoryFormSchema>;

export interface CategoryTreeItem extends MacroCategory {
  categories: CategoryListItem[];
  deletion: CategoryDeletionInfo;
}

export interface CategoryDeletionInfo {
  canDelete: boolean;
  reasons: string[];
}

export type CategoryListItem = Category & {
  deletion: CategoryDeletionInfo;
};

export async function getCategoryTree(supabase: SupabaseClient, userId: string, options: { includeDeleted?: boolean; includeDeletionInfo?: boolean } = {}): Promise<CategoryTreeItem[]> {
  let macroQuery = supabase
    .from("macro_categories")
    .select("*")
    .eq("owner_user_id", userId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options.includeDeleted) {
    macroQuery = macroQuery.is("deleted_at", null);
  }

  const { data: macros, error: macroError } = await macroQuery;

  if (macroError) {
    throw macroError;
  }

  const macroRows = (macros ?? []).map(mapMacroCategoryRow);

  if (macroRows.length === 0) {
    return [];
  }

  let categoryQuery = supabase
    .from("categories")
    .select("*")
    .in(
      "macro_category_id",
      macroRows.map((macro) => macro.id)
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options.includeDeleted) {
    categoryQuery = categoryQuery.is("deleted_at", null);
  }

  const { data: categories, error: categoryError } = await categoryQuery;

  if (categoryError) {
    throw categoryError;
  }

  const categoryRows = (categories ?? []).map(mapCategoryRow);
  const deletionInfo = options.includeDeletionInfo ? await getCategoryDeletionInfo(supabase, categoryRows, macroRows) : emptyDeletionInfo(categoryRows, macroRows);

  const categoriesByMacro = new Map<string, CategoryListItem[]>();
  for (const category of categoryRows) {
    const list = categoriesByMacro.get(category.macroCategoryId) ?? [];
    list.push({ ...category, deletion: deletionInfo.categories.get(category.id) ?? deletable() });
    categoriesByMacro.set(category.macroCategoryId, list);
  }

  return macroRows.map((macro) => ({
    ...macro,
    categories: categoriesByMacro.get(macro.id) ?? [],
    deletion: deletionInfo.macros.get(macro.id) ?? deletable()
  }));
}

export async function createMacroCategory(supabase: SupabaseClient, userId: string, input: MacroCategoryInput) {
  const { error } = await supabase.from("macro_categories").insert({
    owner_user_id: userId,
    name: input.name,
    sort_order: input.sortOrder
  });

  if (error) {
    throw error;
  }
}

export async function updateMacroCategory(supabase: SupabaseClient, userId: string, input: Required<MacroCategoryInput>) {
  const { error } = await supabase
    .from("macro_categories")
    .update({
      name: input.name,
      sort_order: input.sortOrder
    })
    .eq("id", input.id)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function deactivateMacroCategory(supabase: SupabaseClient, userId: string, macroCategoryId: string) {
  const { error } = await supabase
    .from("macro_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", macroCategoryId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function createCategory(supabase: SupabaseClient, input: CategoryInput) {
  const { error } = await supabase.from("categories").insert({
    macro_category_id: input.macroCategoryId,
    name: input.name,
    sort_order: input.sortOrder
  });

  if (error) {
    throw error;
  }
}

export async function updateCategory(supabase: SupabaseClient, input: Required<CategoryInput>) {
  const { error } = await supabase
    .from("categories")
    .update({
      macro_category_id: input.macroCategoryId,
      name: input.name,
      sort_order: input.sortOrder
    })
    .eq("id", input.id)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }
}

export async function deactivateCategory(supabase: SupabaseClient, categoryId: string) {
  const { error } = await supabase.rpc("deactivate_category", {
    target_category_id: categoryId
  });

  if (error) {
    throw error;
  }
}

export async function deleteCategoryPermanently(supabase: SupabaseClient, categoryId: string) {
  const { error } = await supabase.rpc("delete_category_if_unused", {
    target_category_id: categoryId
  });

  if (error) {
    throw error;
  }
}

export async function deleteMacroCategoryPermanently(supabase: SupabaseClient, macroCategoryId: string) {
  const { error } = await supabase.rpc("delete_macro_category_if_unused", {
    target_macro_category_id: macroCategoryId
  });

  if (error) {
    throw error;
  }
}

async function getCategoryDeletionInfo(supabase: SupabaseClient, categories: Category[], macros: MacroCategory[]) {
  const categoryInfo = new Map<string, CategoryDeletionInfo>();
  const macroInfo = new Map<string, CategoryDeletionInfo>();

  for (const category of categories) {
    const reasons: string[] = [];
    if (await hasReference(supabase, "movements", "category_id", category.id)) {
      reasons.push("movimenti");
    }
    if (await hasReference(supabase, "fixed_expenses", "category_id", category.id)) {
      reasons.push("ricorrenze");
    }
    if (await hasReference(supabase, "budgets", "category_id", category.id)) {
      reasons.push("budget");
    }
    if (await hasReference(supabase, "movement_requests", "category_id", category.id)) {
      reasons.push("richieste movimenti");
    }
    if (await hasReference(supabase, "fixed_expense_requests", "category_id", category.id)) {
      reasons.push("richieste ricorrenze");
    }
    categoryInfo.set(category.id, reasons.length === 0 ? deletable() : blocked(reasons));
  }

  for (const macro of macros) {
    const reasons: string[] = [];
    if (await hasReference(supabase, "categories", "macro_category_id", macro.id)) {
      reasons.push("categorie figlie");
    }
    if (await hasReference(supabase, "budgets", "macro_category_id", macro.id)) {
      reasons.push("budget");
    }
    macroInfo.set(macro.id, reasons.length === 0 ? deletable() : blocked(reasons));
  }

  return { categories: categoryInfo, macros: macroInfo };
}

function emptyDeletionInfo(categories: Category[], macros: MacroCategory[]) {
  return {
    categories: new Map(categories.map((category) => [category.id, deletable()])),
    macros: new Map(macros.map((macro) => [macro.id, deletable()]))
  };
}

async function hasReference(supabase: SupabaseClient, table: string, column: string, value: string) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(column, value);

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
}

function deletable(): CategoryDeletionInfo {
  return { canDelete: true, reasons: [] };
}

function blocked(reasons: string[]): CategoryDeletionInfo {
  return { canDelete: false, reasons };
}

function mapMacroCategoryRow(row: Record<string, unknown>): MacroCategory {
  return {
    id: String(row.id),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    householdId: row.household_id ? String(row.household_id) : null,
    name: String(row.name),
    sortOrder: Number(row.sort_order),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null
  };
}

function mapCategoryRow(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    macroCategoryId: String(row.macro_category_id),
    name: String(row.name),
    sortOrder: Number(row.sort_order),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null
  };
}
