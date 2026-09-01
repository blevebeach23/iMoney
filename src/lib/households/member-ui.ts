import type { HouseholdMemberListItem } from "@/services/households/household-service";
import type { HouseholdRole } from "@/types/domain";

export function isHouseholdAdminRole(role: HouseholdRole) {
  return role === "owner" || role === "admin";
}

export function sortHouseholdMembersForDisplay(members: HouseholdMemberListItem[], currentUserId: string) {
  return [...members].sort((a, b) => {
    if (a.userId === currentUserId) {
      return -1;
    }

    if (b.userId === currentUserId) {
      return 1;
    }

    const adminDelta = Number(isHouseholdAdminRole(b.role)) - Number(isHouseholdAdminRole(a.role));

    if (adminDelta !== 0) {
      return adminDelta;
    }

    return a.fullName.localeCompare(b.fullName, "it");
  });
}

export function canCurrentUserManageMember(currentUserRole: HouseholdRole | null, currentUserId: string, member: HouseholdMemberListItem) {
  return Boolean(currentUserRole && isHouseholdAdminRole(currentUserRole) && member.userId !== currentUserId);
}

export function shouldShowPromoteToAdmin(currentUserRole: HouseholdRole | null, currentUserId: string, member: HouseholdMemberListItem) {
  return canCurrentUserManageMember(currentUserRole, currentUserId, member) && !isHouseholdAdminRole(member.role);
}
