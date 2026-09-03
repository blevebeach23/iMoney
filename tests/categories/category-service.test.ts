import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { deleteCategoryPermanently, deleteMacroCategoryPermanently, getCategoryTree } from "@/services/categories/category-service";

describe("category service", () => {
  it("marks categories and macro-categories as blocked when references exist", async () => {
    const supabase = categorySupabase({
      counts: {
        "movements:category_id:category-used": 1,
        "categories:macro_category_id:macro-with-child": 1,
        "budgets:macro_category_id:macro-budget": 1
      }
    });

    const tree = await getCategoryTree(supabase, "user-1", { includeDeleted: true, includeDeletionInfo: true });

    expect(tree.find((macro) => macro.id === "macro-empty")?.deletion.canDelete).toBe(true);
    expect(tree.find((macro) => macro.id === "macro-with-child")?.deletion.reasons).toContain("categorie figlie");
    expect(tree.find((macro) => macro.id === "macro-budget")?.deletion.reasons).toContain("budget");
    expect(tree.flatMap((macro) => macro.categories).find((category) => category.id === "category-used")?.deletion.reasons).toContain("movimenti");
    expect(tree.flatMap((macro) => macro.categories).find((category) => category.id === "category-free")?.deletion.canDelete).toBe(true);
  });

  it("calls safe delete RPCs instead of deleting tables directly", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    await deleteCategoryPermanently(supabase, "category-1");
    await deleteMacroCategoryPermanently(supabase, "macro-1");

    expect(rpc).toHaveBeenCalledWith("delete_category_if_unused", { target_category_id: "category-1" });
    expect(rpc).toHaveBeenCalledWith("delete_macro_category_if_unused", { target_macro_category_id: "macro-1" });
  });
});

function categorySupabase(input: { counts: Record<string, number> }) {
  const macros = [
    macroRow("macro-empty"),
    macroRow("macro-with-child"),
    macroRow("macro-budget")
  ];
  const categories = [
    categoryRow("category-free", "macro-with-child"),
    categoryRow("category-used", "macro-with-child", "2026-09-03T10:00:00.000Z")
  ];

  return {
    from: vi.fn((table: string) => ({
      select: vi.fn((_columns?: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head) {
          return {
            eq: vi.fn((column: string, value: string) =>
              Promise.resolve({
                count: input.counts[`${table}:${column}:${value}`] ?? 0,
                error: null
              })
            )
          };
        }

        const query = {
          data: table === "macro_categories" ? macros : categories,
          error: null,
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          is: vi.fn(() => query),
          order: vi.fn(() => query)
        };
        return query;
      })
    }))
  } as unknown as SupabaseClient;
}

function macroRow(id: string) {
  return {
    id,
    owner_user_id: "user-1",
    household_id: null,
    name: id,
    sort_order: 0,
    deleted_at: null
  };
}

function categoryRow(id: string, macroCategoryId: string, deletedAt: string | null = null) {
  return {
    id,
    macro_category_id: macroCategoryId,
    name: id,
    sort_order: 0,
    deleted_at: deletedAt
  };
}
