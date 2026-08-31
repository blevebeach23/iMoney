import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deletePushSubscription,
  markAllNotificationsRead,
  markNotificationRead,
  notifyHouseholdBudget,
  notifySharedFund,
  notifySharedMovement,
  savePushSubscription
} from "@/services/notifications/notification-service";
import type { Fund } from "@/types/domain";

function rpcSupabase() {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  return { rpc } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

function fund(partial: Partial<Fund> = {}): Fund {
  return {
    id: "fund-1",
    ownerUserId: "user-1",
    householdId: "household-1",
    name: "Vacanze",
    type: "holiday",
    openingBalance: "100.00",
    openingBalanceDate: "2026-08-01",
    cachedBalance: "2500.00",
    cachedAt: null,
    targetAmount: "2500.00",
    targetDate: null,
    isSharedWithHousehold: true,
    deletedAt: null,
    ...partial
  };
}

describe("notification service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a household notification for a shared movement", async () => {
    const supabase = rpcSupabase();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await notifySharedMovement(
      supabase,
      {
        amount: "52.00",
        categoryName: "Spesa alimentare",
        description: "Spesa",
        householdId: "household-1",
        id: "10000000-0000-0000-0000-000000000001",
        isSharedWithHousehold: true,
        type: "expense"
      },
      "created"
    );

    expect(supabase.rpc).toHaveBeenCalledWith("create_household_notifications", expect.objectContaining({
      target_household_id: "household-1",
      notification_type: "movement_shared_created",
      notification_title: "Nuovo movimento condiviso",
      dedupe_scope: "movement:10000000-0000-0000-0000-000000000001:created"
    }));
  });

  it("does not create notifications for private movements", async () => {
    const supabase = rpcSupabase();

    await expect(
      notifySharedMovement(
        supabase,
        {
          amount: "52.00",
          description: "Spesa",
          householdId: null,
          id: "10000000-0000-0000-0000-000000000001",
          isSharedWithHousehold: false,
          type: "expense"
        },
        "created"
      )
    ).resolves.toEqual([]);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("uses the reimbursement notification type for shared reimbursements", async () => {
    const supabase = rpcSupabase();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await notifySharedMovement(
      supabase,
      {
        amount: "30.00",
        categoryName: "Asilo",
        description: "Rimborso",
        householdId: "household-1",
        id: "10000000-0000-0000-0000-000000000002",
        isSharedWithHousehold: true,
        type: "reimbursement"
      },
      "created"
    );

    expect(supabase.rpc).toHaveBeenCalledWith("create_household_notifications", expect.objectContaining({
      notification_type: "reimbursement_shared_created",
      notification_title: "Rimborso condiviso"
    }));
  });

  it("creates fund target notifications", async () => {
    const supabase = rpcSupabase();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await notifySharedFund(supabase, fund(), "target_reached");

    expect(supabase.rpc).toHaveBeenCalledWith("create_household_notifications", expect.objectContaining({
      notification_type: "fund_target_reached",
      notification_title: "Obiettivo fondo raggiunto",
      dedupe_scope: "fund:fund-1:target_reached"
    }));
  });

  it("creates budget exceeded notifications idempotently", async () => {
    const supabase = rpcSupabase();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await notifyHouseholdBudget(supabase, "household-1", { id: "10000000-0000-0000-0000-000000000003", amount: "300.00", categoryName: "Spesa alimentare" }, "exceeded");

    expect(supabase.rpc).toHaveBeenCalledWith("create_household_notifications", expect.objectContaining({
      notification_type: "budget_exceeded",
      notification_title: "Budget superato",
      dedupe_scope: "budget:10000000-0000-0000-0000-000000000003:exceeded"
    }));
  });

  it("marks one notification and all notifications as read", async () => {
    const chain: { eq: ReturnType<typeof vi.fn>; error: null } = {
      eq: vi.fn(() => chain),
      error: null
    };
    const update = vi.fn().mockReturnValue(chain);
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as unknown as SupabaseClient;

    await markNotificationRead(supabase, "user-1", "notification-1");
    await markAllNotificationsRead(supabase, "user-1");

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_read: true, read_at: expect.any(String) }));
  });

  it("creates and removes push subscriptions for the current user only", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteBuilder = { eq: vi.fn().mockReturnValue({ eq: deleteEq }) };
    const from = vi.fn().mockReturnValue({ upsert, delete: vi.fn().mockReturnValue(deleteBuilder) });
    const supabase = { from } as unknown as SupabaseClient;

    await savePushSubscription(supabase, "user-1", { endpoint: "https://push.example/1", p256dh: "key", auth: "auth", userAgent: "ua" });
    await deletePushSubscription(supabase, "user-1", "https://push.example/1");

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1", endpoint: "https://push.example/1" }), { onConflict: "endpoint" });
    expect(deleteBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
