import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src", "components", "family", "family-settings.tsx"), "utf8");

describe("family settings UI", () => {
  it("renders the current user first and exposes the self leave action", () => {
    expect(source).toContain("sortHouseholdMembersForDisplay(members, currentUserId)");
    expect(source).toContain("Interrompi condivisione");
    expect(source).toContain("leaveHouseholdAction");
  });

  it("does not render promote/remove controls on the current user branch", () => {
    const selfBranch = source.slice(source.indexOf("{isCurrentUser ?"), source.indexOf(") : (", source.indexOf("{isCurrentUser ?")));

    expect(selfBranch).toContain("Interrompi condivisione");
    expect(selfBranch).not.toContain("Rendi admin");
    expect(selfBranch).not.toContain("Rimuovi");
  });

  it("uses real member names and translated statuses instead of raw enum rendering", () => {
    expect(source).toContain("member.fullName");
    expect(source).toContain("member.username");
    expect(source).toContain("householdMemberStatusLabel(member.status)");
    expect(source).toContain("householdInviteStatusLabel(invite.status)");
    expect(source).not.toContain("{member.status}");
    expect(source).not.toContain("{invite.status}");
  });

  it("shows admin controls only for other members and never promotes an existing admin", () => {
    expect(source).toContain("canManageMember");
    expect(source).toContain("showPromote");
    expect(source).toContain("Rendi admin");
    expect(source).toContain("Rimuovi");
    expect(source).toContain("Admin");
  });

  it("allows cancelling only pending invites", () => {
    expect(source).toContain("invite.status === \"PENDING\"");
    expect(source).toContain("Cancella invito");
    expect(source).toContain("cancelHouseholdInviteAction");
  });
});
