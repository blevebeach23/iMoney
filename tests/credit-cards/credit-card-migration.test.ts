import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "035_credit_card_settings.sql"), "utf8");

describe("credit card settings migration", () => {
  it("creates owner-only credit card settings with account type validation", () => {
    expect(migration).toContain("create table public.credit_card_settings");
    expect(migration).toContain("account_id uuid not null unique references public.accounts");
    expect(migration).toContain("settlement_account_id uuid not null references public.accounts");
    expect(migration).toContain("card_account.type <> 'credit_card'");
    expect(migration).toContain("settlement_account.type <> 'bank'");
    expect(migration).toContain("card_account.owner_user_id <> settlement_account.owner_user_id");
  });

  it("enforces RLS for settings owner and same-user bank/card references", () => {
    expect(migration).toContain("alter table public.credit_card_settings enable row level security");
    expect(migration).toContain("credit_card_settings_owner_select");
    expect(migration).toContain("card.owner_user_id = auth.uid()");
    expect(migration).toContain("bank.owner_user_id = auth.uid()");
  });

  it("adds idempotency metadata to transfers for card settlement cycles", () => {
    expect(migration).toContain("add column credit_card_account_id uuid references public.accounts");
    expect(migration).toContain("add column credit_card_cycle_start_on date");
    expect(migration).toContain("add column credit_card_cycle_end_on date");
    expect(migration).toContain("transfers_credit_card_settlement_cycle_idx");
    expect(migration).toContain("credit_card_account_id must match transfer destination card");
    expect(migration).toContain("credit card settlement source must be an active bank account");
  });
});
