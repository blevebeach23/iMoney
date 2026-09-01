import { describe, expect, it } from "vitest";
import { resolveNotificationDestination, sanitizeNotificationDestination } from "@/lib/notifications/routes";
import type { AppNotification } from "@/types/notifications";

function notification(partial: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "notification-1",
    recipientUserId: "user-1",
    actorUserId: null,
    householdId: "household-1",
    type: "movement_shared_created",
    title: "Notifica",
    body: "Corpo",
    entityType: "movement",
    entityId: "10000000-0000-4000-8000-000000000001",
    destinationUrl: null,
    isRead: false,
    readAt: null,
    metadata: {},
    createdAt: "2026-09-01T10:00:00Z",
    ...partial
  };
}

describe("notification route mapping", () => {
  it("opens shared movement push notifications on the family movement detail route", () => {
    expect(resolveNotificationDestination(notification({ entityType: "movement", entityId: "10000000-0000-4000-8000-000000000001" }))).toBe(
      "/family/movements/10000000-0000-4000-8000-000000000001"
    );
  });

  it("opens transfer and fund notifications on existing detail routes", () => {
    expect(resolveNotificationDestination(notification({ type: "transfer_shared", entityType: "transfer", entityId: "10000000-0000-4000-8000-000000000002" }))).toBe(
      "/transfers/10000000-0000-4000-8000-000000000002"
    );
    expect(resolveNotificationDestination(notification({ type: "fund_target_reached", entityType: "fund", entityId: "10000000-0000-4000-8000-000000000003" }))).toBe(
      "/funds/10000000-0000-4000-8000-000000000003"
    );
  });

  it("opens budget notifications on the month route when metadata is available", () => {
    expect(resolveNotificationDestination(notification({ type: "budget_exceeded", entityType: "budget", entityId: "budget-1", metadata: { year: "2026", month: "09" } }))).toBe(
      "/budgets/2026/09"
    );
  });

  it("falls back to notifications when no specific destination is available", () => {
    expect(resolveNotificationDestination(notification({ destinationUrl: null, entityId: null, entityType: null }))).toBe("/notifications");
  });

  it("does not open deleted/unshared entity detail routes", () => {
    expect(
      resolveNotificationDestination(
        notification({
          type: "movement_shared_deleted",
          entityType: "movement",
          entityId: "10000000-0000-4000-8000-000000000001",
          destinationUrl: "/movements/10000000-0000-4000-8000-000000000001"
        })
      )
    ).toBe("/notifications");
    expect(
      resolveNotificationDestination(
        notification({
          type: "fund_unshared",
          entityType: "fund",
          entityId: "10000000-0000-4000-8000-000000000003",
          destinationUrl: "/funds/10000000-0000-4000-8000-000000000003"
        })
      )
    ).toBe("/notifications");
  });

  it("keeps family invite notifications in the notification center", () => {
    expect(resolveNotificationDestination(notification({ type: "family_invite", entityType: "household", entityId: "household-1" }))).toBe("/notifications");
  });

  it("rejects external and unknown destinations", () => {
    expect(sanitizeNotificationDestination("https://evil.example/movements/1")).toBe("/notifications");
    expect(sanitizeNotificationDestination("/movement/movement-1")).toBe("/notifications");
    expect(sanitizeNotificationDestination("/movements/movement-1")).toBe("/notifications");
    expect(sanitizeNotificationDestination("/family/movements/movement-1")).toBe("/notifications");
    expect(sanitizeNotificationDestination("/movements/10000000-0000-4000-8000-000000000001")).toBe("/movements/10000000-0000-4000-8000-000000000001");
    expect(sanitizeNotificationDestination("/family/movements/10000000-0000-4000-8000-000000000001")).toBe("/family/movements/10000000-0000-4000-8000-000000000001");
  });

  it("rejects malformed destinations", () => {
    expect(sanitizeNotificationDestination("http://[malformed")).toBe("/notifications");
  });
});
