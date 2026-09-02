import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { confirmImportSchema } from "@/lib/imports/validation";
import {
  buildImportBatchPayload,
  buildImportedMovementPayloads,
  buildUndoImportPatch,
  ensureImportOtherMacroCategory,
  getAffectedContainerIds,
  resolveCreatedImportCategories
} from "@/services/imports/import-service";
import type { ImportMovementInput } from "@/services/imports/import-service";

const rows: ImportMovementInput[] = [
  {
    occurredOn: "2026-08-15",
    description: "Supermercato",
    amount: "25.00",
    type: "expense",
    categoryId: "00000000-0000-4000-8000-000000000001",
    accountId: "00000000-0000-4000-8000-000000000002",
    fundId: null,
    isReimbursement: false,
    sharedWithFamily: false,
    householdId: null,
    notes: "Carta"
  },
  {
    occurredOn: "2026-08-16",
    description: "Rimborso spesa",
    amount: "10.00",
    type: "income",
    categoryId: "00000000-0000-4000-8000-000000000001",
    accountId: null,
    fundId: "00000000-0000-4000-8000-000000000003",
    isReimbursement: true,
    sharedWithFamily: true,
    householdId: "00000000-0000-4000-8000-000000000004",
    notes: ""
  }
];

describe("import service payloads", () => {
  it("builds an import batch record", () => {
    expect(buildImportBatchPayload("user-1", "movimenti.csv", 2)).toEqual({
      owner_user_id: "user-1",
      source_filename: "movimenti.csv",
      imported_rows: 2
    });
  });

  it("links every imported movement to the batch", () => {
    const payloads = buildImportedMovementPayloads("user-1", "batch-1", rows);

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({
      owner_user_id: "user-1",
      import_batch_id: "batch-1",
      account_id: "00000000-0000-4000-8000-000000000002",
      fund_id: null,
      type: "expense",
      amount: "25.00"
    });
    expect(payloads[1]).toMatchObject({
      household_id: "00000000-0000-4000-8000-000000000004",
      shared_with_family: true,
      import_batch_id: "batch-1",
      type: "reimbursement"
    });
  });

  it("builds a soft-delete patch for undo import", () => {
    expect(buildUndoImportPatch("user-1", "2026-08-29T10:00:00.000Z")).toEqual({
      deleted_at: "2026-08-29T10:00:00.000Z",
      updated_by: "user-1"
    });
  });

  it("collects affected accounts and funds once for balance cache rebuild", () => {
    const affected = getAffectedContainerIds([...rows, rows[0]]);

    expect([...affected.accountIds]).toEqual(["00000000-0000-4000-8000-000000000002"]);
    expect([...affected.fundIds]).toEqual(["00000000-0000-4000-8000-000000000003"]);
  });

  it("validates import confirmation payloads server-side", () => {
    expect(() => confirmImportSchema.parse({ filename: "movimenti.csv", rows })).not.toThrow();
    expect(() =>
      confirmImportSchema.parse({
        filename: "movimenti.csv",
        rows: [{ ...rows[0], fundId: "00000000-0000-4000-8000-000000000003" }]
      })
    ).toThrow();
  });

  it("creates the Altro macro category automatically when missing", async () => {
    const supabase = categorySupabase({ macros: [], categories: [] });

    await expect(ensureImportOtherMacroCategory(supabase.client, "user-1")).resolves.toBe("macro-altro");
    expect(supabase.macroInserts).toEqual([{ owner_user_id: "user-1", name: "Altro", sort_order: 1000 }]);
  });

  it("reuses an existing Altro macro category without duplicates", async () => {
    const supabase = categorySupabase({ macros: [{ id: "macro-existing", name: "Altro" }], categories: [] });

    await expect(ensureImportOtherMacroCategory(supabase.client, "user-1")).resolves.toBe("macro-existing");
    expect(supabase.macroInserts).toEqual([]);
  });

  it("creates missing categories in Altro and reuses them for repeated rows", async () => {
    const supabase = categorySupabase({ macros: [{ id: "macro-altro", name: "Altro" }], categories: [] });
    const resolved = await resolveCreatedImportCategories(
      supabase.client,
      "user-1",
      [
        { ...rows[0], categoryId: "category-other", createCategoryName: "Bar" },
        { ...rows[0], categoryId: "category-other", createCategoryName: "Bar" }
      ],
      undefined
    );

    expect(supabase.categoryInserts).toEqual([[{ macro_category_id: "macro-altro", name: "Bar", sort_order: 1000 }]]);
    expect(resolved.map((row) => row.categoryId)).toEqual(["category-bar", "category-bar"]);
  });

  it("normalizes category names to avoid duplicates", async () => {
    const supabase = categorySupabase({
      macros: [{ id: "macro-altro", name: " Altro " }],
      categories: [{ id: "category-bar", macro_category_id: "macro-altro", name: "Bar" }]
    });
    const resolved = await resolveCreatedImportCategories(supabase.client, "user-1", [{ ...rows[0], categoryId: "category-other", createCategoryName: " BAR " }], undefined);

    expect(supabase.categoryInserts).toEqual([]);
    expect(resolved[0]?.categoryId).toBe("category-bar");
  });

  it("creates import categories through the normal editable categories table", async () => {
    const supabase = categorySupabase({ macros: [{ id: "macro-altro", name: "Altro" }], categories: [] });

    await resolveCreatedImportCategories(supabase.client, "user-1", [{ ...rows[0], categoryId: "category-other", createCategoryName: "Auto" }], undefined);

    expect(supabase.categoryInserts[0]?.[0]).toEqual({
      macro_category_id: "macro-altro",
      name: "Auto",
      sort_order: 1000
    });
  });
});

function categorySupabase(input: {
  macros: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; macro_category_id: string; name: string }>;
}) {
  const macros = [...input.macros];
  const categories = [...input.categories];
  const macroInserts: Array<Record<string, unknown>> = [];
  const categoryInserts: Array<Array<Record<string, unknown>>> = [];

  function from(table: string) {
    if (table === "macro_categories") {
      return {
        insert(payload: Record<string, unknown>) {
          macroInserts.push(payload);
          macros.push({ id: "macro-altro", name: String(payload.name) });
          return {
            select() {
              return {
                single: () => Promise.resolve({ data: { id: "macro-altro" }, error: null })
              };
            }
          };
        },
        select() {
          return {
            eq() {
              return {
                is: () => Promise.resolve({ data: macros, error: null })
              };
            }
          };
        }
      };
    }

    if (table === "categories") {
      return {
        insert(payload: Array<Record<string, unknown>>) {
          categoryInserts.push(payload);
          for (const item of payload) {
            categories.push({
              id: `category-${String(item.name).trim().toLowerCase()}`,
              macro_category_id: String(item.macro_category_id),
              name: String(item.name)
            });
          }
          return {
            select: () => Promise.resolve({ data: payload, error: null })
          };
        },
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                is: () => Promise.resolve({ data: categories.filter((category) => category.macro_category_id === value), error: null })
              };
            }
          };
        }
      };
    }

    throw new Error(`Unexpected table ${table}`);
  }

  return {
    categoryInserts,
    client: { from } as unknown as SupabaseClient,
    macroInserts
  };
}
