import type { HouseholdMember, Movement } from "@/types/domain";

export function isActiveHouseholdMember(memberships: Pick<HouseholdMember, "householdId" | "status">[], householdId: string): boolean {
  return memberships.some((membership) => membership.householdId === householdId && membership.status === "ACTIVE");
}

export function isMovementVisibleInFamily(movement: Movement, householdId: string): boolean {
  return movement.deletedAt === null && movement.householdId === householdId && movement.isSharedWithHousehold;
}

export function filterFamilySharedMovements<T extends Movement>(movements: T[], householdId: string): T[] {
  return movements.filter((movement) => isMovementVisibleInFamily(movement, householdId));
}
