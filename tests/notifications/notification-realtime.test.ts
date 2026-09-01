import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dedupeNotifications, nextUnreadCount } from "@/components/notifications/notification-provider";
import type { AppNotification } from "@/types/notifications";

const root = process.cwd();

function notification(partial: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "notification-1",
    recipientUserId: "user-1",
    actorUserId: null,
    householdId: null,
    type: "movement_shared_created",
    title: "Nuovo movimento condiviso",
    body: "Vito ha aggiunto un movimento condiviso di € 45,00.",
    entityType: "movement",
    entityId: "10000000-0000-4000-8000-000000000001",
    destinationUrl: "/family/movements/10000000-0000-4000-8000-000000000001",
    isRead: false,
    readAt: null,
    metadata: {},
    createdAt: "2026-09-01T10:00:00.000Z",
    ...partial
  };
}

describe("notification realtime state", () => {
  it("increments unread count when a realtime INSERT arrives", () => {
    expect(nextUnreadCount(0, "INSERT", notification(), null)).toBe(1);
  });

  it("updates badge counts when a notification changes read state", () => {
    expect(nextUnreadCount(3, "UPDATE", notification({ isRead: true }), notification({ isRead: false }))).toBe(2);
    expect(nextUnreadCount(2, "UPDATE", notification({ isRead: false }), notification({ isRead: true }))).toBe(3);
  });

  it("does not duplicate notifications or double count repeated realtime events", () => {
    const unread = notification();
    const duplicateUnread = notification({ title: "Titolo aggiornato" });

    expect(dedupeNotifications([unread, duplicateUnread])).toHaveLength(1);
    expect(nextUnreadCount(1, "INSERT", duplicateUnread, unread)).toBe(1);
  });

  it("centralizes one filtered Supabase Realtime subscription and cleans it up", () => {
    const provider = readFileSync(join(root, "src", "components", "notifications", "notification-provider.tsx"), "utf8");
    const topRightActions = readFileSync(join(root, "src", "components", "layout", "top-right-actions.tsx"), "utf8");

    expect(provider).toContain(".channel(`notifications:${userId}`)");
    expect(provider).toContain("event: \"*\"");
    expect(provider).toContain("table: \"notifications\"");
    expect(provider).toContain("filter: `recipient_user_id=eq.${userId}`");
    expect(provider).toContain("supabase.removeChannel(channel)");
    expect(provider).toContain("supabase.auth.onAuthStateChange");
    expect(provider).toContain("subscription.unsubscribe()");
    expect(topRightActions).toContain("useNotifications()");
    expect(topRightActions).not.toContain("supabase.channel");
    expect(topRightActions).not.toContain("/api/notifications/unread-count");
  });

  it("renders the notification page list from the shared realtime provider", () => {
    const page = readFileSync(join(root, "src", "app", "notifications", "page.tsx"), "utf8");
    const center = readFileSync(join(root, "src", "components", "notifications", "notification-center.tsx"), "utf8");
    const actions = readFileSync(join(root, "src", "components", "notifications", "notification-actions.tsx"), "utf8");

    expect(page).toContain("<NotificationCenter initialNotifications={notifications} initialUnreadCount={unreadCount} />");
    expect(center).toContain("seedNotifications(initialNotifications, initialUnreadCount)");
    expect(center).toContain("notifications.map");
    expect(center).toContain("AutoMarkDisplayedNotificationsRead");
    expect(actions).toContain("markDisplayedNotificationsReadAction(notificationIds)");
    expect(actions).not.toContain("router.refresh()");
  });

  it("enables notifications on the Supabase Realtime publication", () => {
    const migration = readFileSync(join(root, "supabase", "migrations", "031_notifications_realtime.sql"), "utf8");

    expect(migration).toContain("pubname = 'supabase_realtime'");
    expect(migration).toContain("alter publication supabase_realtime add table public.notifications");
  });
});
