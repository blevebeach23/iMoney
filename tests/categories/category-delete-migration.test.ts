import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "040_safe_category_delete.sql"), "utf8");

describe("safe category delete migration", () => {
  it("blocks category delete when accounting or planning references exist", () => {
    expect(migration).toContain("public.delete_category_if_unused");
    expect(migration).toContain("from public.movements where category_id = target_category_id");
    expect(migration).toContain("from public.fixed_expenses where category_id = target_category_id");
    expect(migration).toContain("from public.budgets where category_id = target_category_id");
    expect(migration).toContain("from public.movement_requests where category_id = target_category_id");
    expect(migration).toContain("from public.fixed_expense_requests where category_id = target_category_id");
  });

  it("blocks macro-category delete when children or budgets exist", () => {
    expect(migration).toContain("public.delete_macro_category_if_unused");
    expect(migration).toContain("from public.categories where macro_category_id = target_macro_category_id");
    expect(migration).toContain("Elimina o sposta prima le categorie figlie");
    expect(migration).toContain("from public.budgets where macro_category_id = target_macro_category_id");
  });

  it("uses authenticated RPCs with explicit ownership checks", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("mc.owner_user_id = auth.uid()");
    expect(migration).toContain("public.is_household_admin(mc.household_id, auth.uid())");
    expect(migration).toContain("grant execute on function public.delete_category_if_unused(uuid) to authenticated");
    expect(migration).toContain("grant execute on function public.delete_macro_category_if_unused(uuid) to authenticated");
  });
});
