import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createHouseholdNotification, deliverPushForNotifications } from "@/services/notifications/notification-service";
import { sendWebPush } from "@/services/notifications/web-push";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn()
}));
vi.mock("@/services/notifications/web-push", () => ({
  sendWebPush: vi.fn()
}));

const notificationRow = {
  id: "notification-1",
  recipient_user_id: "recipient-1",
  actor_user_id: "actor-1",
  household_id: "household-1",
  type: "movement_shared_created",
  title: "Nuovo movimento condiviso",
  body: "Vito ha aggiunto un movimento condiviso di € 45,00.",
  entity_type: "movement",
  entity_id: "10000000-0000-4000-8000-000000000001",
  destination_url: "/family/movements/10000000-0000-4000-8000-000000000001",
  is_read: false,
  read_at: null,
  metadata: {},
  created_at: "2026-09-01T10:00:00.000Z"
};

function adminSupabase(subscriptionRows = [pushSubscriptionRow()]) {
  const notificationIn = vi.fn().mockResolvedValue({ data: [notificationRow], error: null });
  const notificationSelect = vi.fn().mockReturnValue({ in: notificationIn });
  const subscriptionEq = vi.fn().mockResolvedValue({ data: subscriptionRows, error: null });
  const subscriptionSelect = vi.fn().mockReturnValue({ eq: subscriptionEq });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const deleteSubscription = vi.fn().mockReturnValue({ eq: deleteEq });
  const from = vi.fn((table: string) => {
    if (table === "notifications") {
      return { select: notificationSelect };
    }

    return {
      delete: deleteSubscription,
      select: subscriptionSelect,
      update
    };
  });

  return {
    client: { from } as unknown as SupabaseClient,
    deleteEq,
    deleteSubscription,
    from,
    notificationIn,
    subscriptionEq,
    update,
    updateEq
  };
}

function pushSubscriptionRow() {
  return {
    endpoint: "https://push.example/subscription-1",
    p256dh: "p256dh-key",
    auth: "auth-token",
    user_agent: "iPhone PWA"
  };
}

describe("web push delivery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends web push immediately after the database notification is created", async () => {
    const admin = adminSupabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin.client);
    vi.mocked(sendWebPush).mockResolvedValue("sent");
    const rpc = vi.fn().mockResolvedValue({
      data: [{ notification_id: "notification-1", recipient_user_id: "recipient-1" }],
      error: null
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const created = await createHouseholdNotification(supabase, {
      body: "Vito ha aggiunto un movimento condiviso di € 45,00.",
      entityId: "10000000-0000-4000-8000-000000000001",
      entityType: "movement",
      householdId: "household-1",
      title: "Nuovo movimento condiviso",
      type: "movement_shared_created"
    });

    expect(created).toEqual([{ notification_id: "notification-1", recipient_user_id: "recipient-1" }]);
    expect(rpc).toHaveBeenCalledWith("create_household_notifications", expect.any(Object));
    expect(sendWebPush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://push.example/subscription-1" }), expect.objectContaining({ id: "notification-1" }));
    expect(admin.update).toHaveBeenCalledWith(expect.objectContaining({ last_used_at: expect.any(String) }));
  });

  it("keeps the main notification creation successful when push delivery fails", async () => {
    const admin = adminSupabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin.client);
    vi.mocked(sendWebPush).mockResolvedValue("failed");
    const rpc = vi.fn().mockResolvedValue({
      data: [{ notification_id: "notification-1", recipient_user_id: "recipient-1" }],
      error: null
    });

    await expect(
      createHouseholdNotification({ rpc } as unknown as SupabaseClient, {
        body: "Body",
        householdId: "household-1",
        title: "Titolo",
        type: "family_member_joined"
      })
    ).resolves.toEqual([{ notification_id: "notification-1", recipient_user_id: "recipient-1" }]);
    expect(admin.deleteSubscription).not.toHaveBeenCalled();
    expect(admin.update).not.toHaveBeenCalled();
  });

  it("deletes expired 404 or 410 push subscriptions", async () => {
    const admin = adminSupabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin.client);
    vi.mocked(sendWebPush).mockResolvedValue("gone");

    await deliverPushForNotifications(["notification-1"]);

    expect(admin.deleteSubscription).toHaveBeenCalled();
    expect(admin.deleteEq).toHaveBeenCalledWith("endpoint", "https://push.example/subscription-1");
    expect(admin.update).not.toHaveBeenCalled();
  });

  it("keeps valid push subscriptions registered", async () => {
    const admin = adminSupabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin.client);
    vi.mocked(sendWebPush).mockResolvedValue("sent");

    await deliverPushForNotifications(["notification-1"]);

    expect(admin.updateEq).toHaveBeenCalledWith("endpoint", "https://push.example/subscription-1");
    expect(admin.deleteSubscription).not.toHaveBeenCalled();
  });
});
