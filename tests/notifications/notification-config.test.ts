import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("notification and push configuration", () => {
  it("stores notifications and push subscriptions with RLS", () => {
    const migration = readFileSync(join(root, "supabase", "migrations", "027_notifications_and_push.sql"), "utf8");

    expect(migration).toContain("create table public.notifications");
    expect(migration).toContain("create table public.push_subscriptions");
    expect(migration).toContain("alter table public.notifications enable row level security");
    expect(migration).toContain("recipient_user_id = auth.uid()");
    expect(migration).toContain("hm.user_id <> auth.uid()");
    expect(migration).toContain("on conflict (dedupe_key)");
  });

  it("excludes the notification actor from household movement notifications", () => {
    const migration = readFileSync(join(root, "supabase", "migrations", "027_notifications_and_push.sql"), "utf8");
    const service = readFileSync(join(root, "src", "services", "notifications", "notification-service.ts"), "utf8");

    expect(migration).toContain("hm.user_id <> auth.uid()");
    expect(service).toContain("await deliverPushForNotifications(created.map((item) => item.notification_id))");
  });

  it("keeps push subscription RLS scoped to the authenticated owner", () => {
    const migration = readFileSync(join(root, "supabase", "migrations", "027_notifications_and_push.sql"), "utf8");

    expect(migration).toContain("create policy push_subscriptions_select_own on public.push_subscriptions");
    expect(migration).toContain("for select using (user_id = auth.uid())");
    expect(migration).toContain("create policy push_subscriptions_insert_own on public.push_subscriptions");
    expect(migration).toContain("for insert with check (user_id = auth.uid())");
    expect(migration).toContain("create policy push_subscriptions_update_own on public.push_subscriptions");
    expect(migration).toContain("for update using (user_id = auth.uid()) with check (user_id = auth.uid())");
    expect(migration).toContain("create policy push_subscriptions_delete_own on public.push_subscriptions");
    expect(migration).toContain("for delete using (user_id = auth.uid())");
    expect(migration).toContain("endpoint text not null unique");
  });

  it("adds push and notification click handlers to the service worker", () => {
    const serviceWorker = readFileSync(join(root, "public", "sw.js"), "utf8");

    expect(serviceWorker).toContain("self.addEventListener(\"push\"");
    expect(serviceWorker).toContain("showNotification");
    expect(serviceWorker).toContain("client.postMessage");
    expect(serviceWorker).toContain("imoney:notification-received");
    expect(serviceWorker).toContain("self.addEventListener(\"notificationclick\"");
    expect(serviceWorker).toContain("notificationCenterUrl");
    expect(serviceWorker).toContain("new URL(\"/notifications\", self.location.origin)");
    expect(serviceWorker).toContain("client.navigate(targetUrl)");
    expect(serviceWorker).toContain("clients.openWindow(targetUrl)");
    expect(serviceWorker).toContain("/icons/icon-192.png");
  });

  it("opens notificationclick targets from safe same-origin payload urls", () => {
    const serviceWorker = readFileSync(join(root, "public", "sw.js"), "utf8");
    const clickHandler = serviceWorker.slice(serviceWorker.indexOf("self.addEventListener(\"notificationclick\""));

    expect(serviceWorker).toContain("function notificationTargetUrl(data)");
    expect(serviceWorker).toContain("url.origin === self.location.origin ? url.toString() : notificationCenterUrl()");
    expect(clickHandler).toContain("const targetUrl = notificationTargetUrl(event.notification.data)");
    expect(clickHandler).toContain("client.navigate(targetUrl)");
    expect(clickHandler).toContain("clients.openWindow(targetUrl)");
    expect(clickHandler).not.toContain("destination_url");
    expect(clickHandler).not.toContain("entity_type");
    expect(clickHandler).not.toContain("entity_id");
    expect(clickHandler).not.toContain("metadata");
  });

  it("versions the service worker cache so old notificationclick handlers are replaced", () => {
    const serviceWorker = readFileSync(join(root, "public", "sw.js"), "utf8");

    expect(serviceWorker).toContain("const CACHE_NAME = \"imoney-v3-notification-routes\"");
    expect(serviceWorker).toContain("self.skipWaiting()");
    expect(serviceWorker).toContain("self.clients.claim()");
    expect(serviceWorker).toContain("keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))");
  });

  it("keeps VAPID private configuration out of public client env vars", () => {
    const envExample = readFileSync(join(root, ".env.example"), "utf8");
    const pushSettings = readFileSync(join(root, "src", "components", "notifications", "push-settings.tsx"), "utf8");
    const webPush = readFileSync(join(root, "src", "services", "notifications", "web-push.ts"), "utf8");

    expect(envExample).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    expect(envExample).not.toContain("NEXT_PUBLIC_VAPID_PRIVATE_KEY");
    expect(pushSettings).toContain("vapidPublicKey");
    expect(pushSettings).not.toContain("VAPID_PRIVATE_KEY");
    expect(webPush).toContain("process.env.VAPID_PRIVATE_KEY");
  });

  it("removes expired push subscriptions and does not fail main notification creation on push errors", () => {
    const service = readFileSync(join(root, "src", "services", "notifications", "notification-service.ts"), "utf8");
    const webPush = readFileSync(join(root, "src", "services", "notifications", "web-push.ts"), "utf8");

    expect(webPush).toContain("response.status === 404 || response.status === 410");
    expect(service).toContain("result === \"gone\"");
    expect(service).toContain(".delete().eq(\"endpoint\"");
    expect(service).toContain("return []");
  });

  it("saves PWA subscriptions through the server action without returning a 500 on RLS upsert conflicts", () => {
    const actions = readFileSync(join(root, "src", "lib", "notifications", "actions.ts"), "utf8");
    const service = readFileSync(join(root, "src", "services", "notifications", "notification-service.ts"), "utf8");
    const pushSettings = readFileSync(join(root, "src", "components", "notifications", "push-settings.tsx"), "utf8");

    expect(actions).toContain("const { supabase, user } = await requireUser()");
    expect(actions).toContain("await savePushSubscription(supabase, user.id");
    expect(actions).toContain("catch (error)");
    expect(actions).toContain("return { ok: false, message: \"Impossibile attivare le notifiche push. Riprova tra poco.\" }");
    expect(service).toContain("isRlsPolicyViolation(error)");
    expect(service).toContain("savePushSubscriptionWithAdmin(userId, input)");
    expect(service).toContain("createSupabaseAdminClient()");
    expect(pushSettings).toContain("registration.pushManager.getSubscription()");
    expect(pushSettings).toContain("existingSubscription ??");
  });

  it("does not expose the technical push subscription counter in the settings UI", () => {
    const pushSettings = readFileSync(join(root, "src", "components", "notifications", "push-settings.tsx"), "utf8");

    expect(pushSettings).toContain("activeSubscriptionCount");
    expect(pushSettings).not.toContain("{activeSubscriptionCount}</span>");
  });

  it("updates the top-right unread badge from the shared realtime notification provider", () => {
    const topRightActions = readFileSync(join(root, "src", "components", "layout", "top-right-actions.tsx"), "utf8");
    const provider = readFileSync(join(root, "src", "components", "notifications", "notification-provider.tsx"), "utf8");
    const notificationActions = readFileSync(join(root, "src", "components", "notifications", "notification-actions.tsx"), "utf8");

    expect(topRightActions).toContain("useNotifications()");
    expect(provider).toContain("NOTIFICATION_UNREAD_COUNT_CHANGED");
    expect(provider).toContain("NOTIFICATION_RECEIVED_FROM_SERVICE_WORKER");
    expect(provider).toContain("filter: `recipient_user_id=eq.${userId}`");
    expect(provider).toContain("supabase.auth.onAuthStateChange");
    expect(provider).toContain("updatePwaAppBadge(nextCount)");
    expect(provider).toContain("navigator.serviceWorker?.addEventListener(\"message\"");
    expect(notificationActions).toContain("AutoMarkDisplayedNotificationsRead");
    expect(notificationActions).toContain("markDisplayedNotificationsReadAction(notificationIds)");
    expect(notificationActions).not.toContain("router.refresh()");
  });

  it("uses the Badging API with feature detection and keeps unsupported browsers safe", () => {
    const unreadEvents = readFileSync(join(root, "src", "lib", "notifications", "unread-events.ts"), "utf8");

    expect(unreadEvents).toContain("\"setAppBadge\" in navigator");
    expect(unreadEvents).toContain("navigator.setAppBadge?.(unreadCount)");
    expect(unreadEvents).toContain("navigator.clearAppBadge?.()");
    expect(unreadEvents).toContain("catch(() => undefined)");
  });

  it("marks displayed notifications as read automatically and removes manual read controls", () => {
    const page = readFileSync(join(root, "src", "app", "notifications", "page.tsx"), "utf8");
    const center = readFileSync(join(root, "src", "components", "notifications", "notification-center.tsx"), "utf8");
    const actions = readFileSync(join(root, "src", "lib", "notifications", "actions.ts"), "utf8");

    expect(page).toContain("NotificationCenter");
    expect(center).toContain("AutoMarkDisplayedNotificationsRead");
    expect(center).toContain("unreadNotificationIds");
    expect(page).not.toContain("Segna come letta");
    expect(page).not.toContain("Segna tutte come lette");
    expect(actions).toContain("markNotificationsRead(supabase, user.id, ids)");
    expect(actions).not.toContain("respondToHouseholdInvite");
  });
});
