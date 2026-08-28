import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { categoryFormSchema, macroCategoryFormSchema } from "@/lib/master-data/validation";
import type { Category, MacroCategory } from "@/types/domain";

type MacroCategoryInput = z.infer<typeof macroCategoryFormSchema>;
type CategoryInput = z.infer<typeof categoryFormSchema>;

export interface CategoryTreeItem extends MacroCategory {
  categories: Category[];
}

export async function getCategoryTree(supabase: SupabaseClient, userId: string): Promise<CategoryTreeItem[]> {
  const { data: macros, error: macroError } = await supabase
    .from("macro_categories")
    .select("*")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (macroError) {
    throw macroError;
  }

  const macroRows = (macros ?? []).map(mapMacroCategoryRow);

  if (macroRows.length === 0) {
    return [];
  }

  const { data: categories, error: categoryError } = await supabase
    .from("categories")
    .select("*")
    .in(
      "macro_category_id",
      macroRows.map((macro) => macro.id)
    )
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (categoryError) {
    throw categoryError;
  }

  const categoriesByMacro = new Map<string, Category[]>();
  for (const category of (categories ?? []).map(mapCategoryRow)) {
    const list = categoriesByMacro.get(category.macroCategoryId) ?? [];
    list.push(category);
    categoriesByMacro.set(category.macroCategoryId, list);
  }

  return macroRows.map((macro) => ({
    ...macro,
    categories: categoriesByMacro.get(macro.id) ?? []
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
