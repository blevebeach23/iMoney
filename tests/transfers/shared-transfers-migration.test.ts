import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "036_shared_transfers.sql"), "utf8");

describe("shared transfers migration", () => {
  it("adds the family sharing flag and shared household index", () => {
    expect(migration).toContain("add column if not exists shared_with_family boolean not null default false");
    expect(migration).toContain("transfers_shared_household_month_idx");
    expect(migration).toContain("where deleted_at is null and shared_with_family = true and household_id is not null");
  });

  it("keeps private transfers out of Family and allows only active household members to read shared transfers", () => {
    expect(migration).toContain("create policy transfers_owner_or_family_select");
    expect(migration).toContain("owner_user_id = auth.uid()");
    expect(migration).toContain("shared_with_family = true");
    expect(migration).toContain("public.is_active_household_member(household_id, auth.uid())");
  });

  it("keeps transfer mutations owner-only and validates shared transfer household membership", () => {
    expect(migration).toContain("for update using (owner_user_id = auth.uid())");
    expect(migration).toContain("(coalesce(target_shared_with_family, false) = false and target_household_id is null)");
    expect(migration).toContain("target_shared_with_family = true");
    expect(migration).toContain("public.is_active_household_member(target_household_id, target_user_id)");
  });
});
