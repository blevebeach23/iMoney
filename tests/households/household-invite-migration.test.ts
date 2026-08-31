import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("household invite database guards", () => {
  const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "026_household_invite_idempotency.sql"), "utf8");

  it("blocks pending invites for emails already tied to valid household members", () => {
    expect(migration).toContain("household_email_has_valid_member");
    expect(migration).toContain("join auth.users u on u.id = hm.user_id");
    expect(migration).toContain("hm.status in ('ACTIVE', 'INVITED')");
    expect(migration).toContain("Questo utente fa già parte della famiglia.");
    expect(migration).toContain("household_invites_prevent_existing_member");
  });

  it("keeps invite acceptance idempotent when membership already exists", () => {
    expect(migration).toContain("if target_invite.status <> 'PENDING' then");
    expect(migration).toContain("set status = 'EXPIRED'");
    expect(migration).toContain("existing_member.status = 'ACTIVE'");
    expect(migration).toContain("when public.household_members.status = 'ACTIVE' then public.household_members.role");
    expect(migration).toContain("set status = 'ACCEPTED'");
  });
});
