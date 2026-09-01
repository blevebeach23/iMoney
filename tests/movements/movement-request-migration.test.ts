import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase", "migrations", "030_movement_requests.sql"), "utf8");

describe("movement request migration", () => {
  it("keeps pending requests outside accounting movements until acceptance", () => {
    expect(migration).toContain("create table public.movement_requests");
    expect(migration).toContain("status public.movement_request_status not null default 'PENDING'");
    expect(migration).toContain("create or replace function public.accept_movement_request");
    expect(migration).toContain("insert into public.movements");
  });

  it("enforces creator, recipient and active household rules", () => {
    expect(migration).toContain("created_by_user_id <> recipient_user_id");
    expect(migration).toContain("public.is_active_household_member(household_id, auth.uid())");
    expect(migration).toContain("public.is_active_household_member(target_household_id, target_recipient_user_id)");
    expect(migration).toContain("target_request.recipient_user_id <> auth.uid()");
    expect(migration).toContain("target_request.created_by_user_id <> auth.uid()");
    expect(migration).not.toContain("for insert with check");
  });

  it("makes accept idempotent and blocks closed request mutation", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("if target_request.status = 'ACCEPTED' then");
    expect(migration).toContain("return query select target_request.id, target_request.accepted_movement_id");
    expect(migration).toContain("if target_request.status <> 'PENDING' then");
  });

  it("does not expose recipient accounts or funds during request creation", () => {
    expect(migration).toContain("accepted_account_id uuid");
    expect(migration).toContain("public.user_can_access_account(accepted_account_id, auth.uid(), target_request.household_id)");
    expect(migration).toContain("public.user_can_access_fund(accepted_fund_id, auth.uid(), target_request.household_id)");
    expect(migration).not.toContain("accepted_account_id uuid,\n  request_description");
  });

  it("adds Italian notification types and audit events", () => {
    expect(migration).toContain("movement_request_created");
    expect(migration).toContain("movement_request_accepted");
    expect(migration).toContain("movement_request_rejected");
    expect(migration).toContain("movement_request_cancelled");
    expect(migration).toContain("'movement_request'");
    expect(migration).toContain("'created'");
    expect(migration).toContain("'accepted'");
    expect(migration).toContain("'rejected'");
    expect(migration).toContain("'cancelled'");
  });
});
