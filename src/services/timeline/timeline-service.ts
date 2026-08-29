import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import type { MovementListItem } from "@/services/movements/movement-service";
import type { TransferListItem } from "@/services/transfers/transfer-service";

export type TimelineItem =
  | {
      id: string;
      kind: "movement";
      occurredOn: string;
      movement: MovementListItem;
    }
  | {
      id: string;
      kind: "transfer";
      occurredOn: string;
      transfer: TransferListItem;
    };

export function buildMovementTimeline(movements: MovementListItem[], transfers: TransferListItem[]): TimelineItem[] {
  return [
    ...movements.map((movement) => ({
      id: movement.id,
      kind: "movement" as const,
      occurredOn: movement.occurredOn,
      movement
    })),
    ...transfers.map((transfer) => ({
      id: transfer.id,
      kind: "transfer" as const,
      occurredOn: transfer.occurredOn,
      transfer
    }))
  ].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

export function transfersCanBeShownWithMovementFilters(filters: {
  type?: "all" | "income" | "expense" | "reimbursement";
  macroCategoryId?: string;
  categoryId?: string;
  reimbursement?: "all" | "yes" | "no";
  shared?: "all" | "yes" | "no";
}): boolean {
  return (
    (!filters.type || filters.type === "all") &&
    !filters.macroCategoryId &&
    !filters.categoryId &&
    (!filters.reimbursement || filters.reimbursement === "all") &&
    (!filters.shared || filters.shared === "all")
  );
}

export function calculateTimelineEconomicSummary(items: TimelineItem[]) {
  return calculateMonthlySummary(items.filter((item) => item.kind === "movement").map((item) => item.movement));
}
