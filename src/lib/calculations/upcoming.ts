import type { Movement } from "@/types/domain";

export function getUpcomingMovements(movements: Movement[], today: string, limit = 5): Movement[] {
  return movements
    .filter((movement) => movement.deletedAt === null && movement.occurredOn >= today)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
    .slice(0, limit);
}
