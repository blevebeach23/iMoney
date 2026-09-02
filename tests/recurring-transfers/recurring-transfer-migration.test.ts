import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "037_recurring_transfers.sql"), "utf8");

describe("recurring transfers migration", () => {
  it("creates recurring transfer rules and idempotent generated transfers", () => {
    expect(migration).toContain("create table public.recurring_transfers");
    expect(migration).toContain("add column if not exists recurring_transfer_id uuid references public.recurring_transfers");
    expect(migration).toContain("transfers_recurring_transfer_occurrence_idx");
  });

  it("keeps RLS owner-only for writes and shared Family read for active members", () => {
    expect(migration).toContain("alter table public.recurring_transfers enable row level security");
    expect(migration).toContain("recurring_transfers_owner_or_shared_select");
    expect(migration).toContain("owner_user_id = auth.uid()");
    expect(migration).toContain("public.is_active_household_member(household_id, auth.uid())");
    expect(migration).toContain("for update using (owner_user_id = auth.uid())");
  });
});
