import type { Fund, HouseholdMember, Movement } from "@/types/domain";

export function isActiveHouseholdMember(memberships: Pick<HouseholdMember, "householdId" | "status">[], householdId: string): boolean {
  return memberships.some((membership) => membership.householdId === householdId && membership.status === "ACTIVE");
}

export function isMovementVisibleInFamily(movement: Movement, householdId: string): boolean {
  return movement.deletedAt === null && movement.householdId === householdId && movement.isSharedWithHousehold;
}

export function filterFamilySharedMovements<T extends Movement>(movements: T[], householdId: string): T[] {
  return movements.filter((movement) => isMovementVisibleInFamily(movement, householdId));
}

export function isFundVisibleInFamily(fund: Fund, householdId: string): boolean {
  return fund.deletedAt === null && fund.householdId === householdId && fund.isSharedWithHousehold;
}

export function filterFamilySharedFunds<T extends Fund>(funds: T[], householdId: string): T[] {
  return funds.filter((fund) => isFundVisibleInFamily(fund, householdId));
}
