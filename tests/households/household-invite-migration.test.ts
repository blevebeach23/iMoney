import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("household invite database guards", () => {
  const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "026_household_invite_idempotency.sql"), "utf8");
  const enumMigration = readFileSync(join(process.cwd(), "supabase", "migrations", "028_family_member_invite_ux.sql"), "utf8");
  const uxMigration = readFileSync(join(process.cwd(), "supabase", "migrations", "029_family_member_invite_ux_functions.sql"), "utf8");

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

  it("adds cancellable invites and blocks cancelled invite acceptance", () => {
    expect(enumMigration).toContain("add value if not exists 'CANCELLED'");
    expect(uxMigration).toContain("cancel_household_invite");
    expect(uxMigration).toContain("set status = 'CANCELLED'");
    expect(uxMigration).toContain("Invito cancellato");
  });

  it("returns only member display profile fields through a guarded RPC", () => {
    expect(uxMigration).toContain("get_household_members_for_display");
    expect(uxMigration).toContain("and hm.user_id = auth.uid()");
    expect(uxMigration).toContain("and hm.status = 'ACTIVE'");
    expect(uxMigration).toContain("p.full_name");
    expect(uxMigration).toContain("p.username");
    expect(uxMigration).not.toContain("p.phone");
  });

  it("prevents the only admin from leaving a household with other members", () => {
    expect(uxMigration).toContain("leave_household");
    expect(uxMigration).toContain("active_admins <= 1");
    expect(uxMigration).toContain("Nomina prima un altro admin");
  });
});
