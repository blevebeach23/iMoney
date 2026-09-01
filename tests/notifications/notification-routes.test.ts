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
    entityId: "movement-1",
    destinationUrl: null,
    isRead: false,
    readAt: null,
    metadata: {},
    createdAt: "2026-09-01T10:00:00Z",
    ...partial
  };
}

describe("notification route mapping", () => {
  it("opens shared movement push notifications on an existing movement detail route", () => {
    expect(resolveNotificationDestination(notification({ entityType: "movement", entityId: "movement-1" }))).toBe("/movements/movement-1");
  });

  it("opens transfer and fund notifications on existing detail routes", () => {
    expect(resolveNotificationDestination(notification({ type: "transfer_shared", entityType: "transfer", entityId: "transfer-1" }))).toBe("/transfers/transfer-1");
    expect(resolveNotificationDestination(notification({ type: "fund_target_reached", entityType: "fund", entityId: "fund-1" }))).toBe("/funds/fund-1");
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
    expect(resolveNotificationDestination(notification({ type: "movement_shared_deleted", entityType: "movement", entityId: "movement-1", destinationUrl: "/movements/movement-1" }))).toBe(
      "/notifications"
    );
    expect(resolveNotificationDestination(notification({ type: "fund_unshared", entityType: "fund", entityId: "fund-1", destinationUrl: "/funds/fund-1" }))).toBe("/notifications");
  });

  it("keeps family invite notifications in the notification center", () => {
    expect(resolveNotificationDestination(notification({ type: "family_invite", entityType: "household", entityId: "household-1" }))).toBe("/notifications");
  });

  it("rejects external and unknown destinations", () => {
    expect(sanitizeNotificationDestination("https://evil.example/movements/1")).toBe("/notifications");
    expect(sanitizeNotificationDestination("/movement/movement-1")).toBe("/notifications");
    expect(sanitizeNotificationDestination("/movements/movement-1")).toBe("/movements/movement-1");
  });
});
