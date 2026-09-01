import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deletePushSubscription,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsRead,
  notifyHouseholdBudget,
  notifySharedFund,
  notifySharedMovement,
  savePushSubscription
} from "@/services/notifications/notification-service";
import type { Fund } from "@/types/domain";

function rpcSupabase() {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: { full_name: "Vito Bleve", username: "vito" }, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, rpc } as unknown as SupabaseClient & { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };
}

function fund(partial: Partial<Fund> = {}): Fund {
  return {
    id: "10000000-0000-4000-8000-000000000004",
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
        id: "10000000-0000-4000-8000-000000000001",
        isSharedWithHousehold: true,
        type: "expense"
      },
      "created",
      "actor-1"
    );

    expect(supabase.rpc).toHaveBeenCalledWith("create_household_notifications", expect.objectContaining({
      target_household_id: "household-1",
      notification_type: "movement_shared_created",
      notification_title: "Nuovo movimento condiviso",
      notification_body: "Vito ha aggiunto un movimento condiviso di € 52,00.",
      destination_url: "/movements/10000000-0000-4000-8000-000000000001",
      dedupe_scope: "movement:10000000-0000-4000-8000-000000000001:created"
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
        id: "10000000-0000-4000-8000-000000000002",
        isSharedWithHousehold: true,
        type: "reimbursement"
      },
      "created",
      "actor-1"
    );

    expect(supabase.rpc).toHaveBeenCalledWith("create_household_notifications", expect.objectContaining({
      notification_type: "reimbursement_shared_created",
      notification_title: "Rimborso condiviso",
      notification_body: "Vito ha registrato un rimborso condiviso di € 30,00."
    }));
  });

  it("creates fund target notifications", async () => {
    const supabase = rpcSupabase();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await notifySharedFund(supabase, fund(), "created", "actor-1");

    expect(supabase.rpc).toHaveBeenCalledWith("create_household_notifications", expect.objectContaining({
      notification_type: "fund_shared_created",
      notification_title: "Nuovo fondo condiviso",
      notification_body: "Vito ha creato il fondo condiviso Vacanze.",
      destination_url: "/funds/10000000-0000-4000-8000-000000000004"
    }));
  });

  it("creates budget exceeded notifications idempotently", async () => {
    const supabase = rpcSupabase();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await notifyHouseholdBudget(supabase, "household-1", { id: "10000000-0000-4000-8000-000000000003", amount: "300.00", categoryName: "Spesa alimentare" }, "exceeded", "actor-1");

    expect(supabase.rpc).toHaveBeenCalledWith("create_household_notifications", expect.objectContaining({
      notification_type: "budget_exceeded",
      notification_title: "Budget superato",
      notification_body: "Vito ha superato il budget famiglia per Spesa alimentare.",
      destination_url: "/notifications",
      dedupe_scope: "budget:10000000-0000-4000-8000-000000000003:exceeded"
    }));
  });

  it("falls back to a generic actor name when the profile is unavailable", async () => {
    const supabase = rpcSupabase();
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    await notifySharedMovement(
      supabase,
      {
        amount: "35.00",
        description: "Spesa",
        householdId: "household-1",
        id: "10000000-0000-4000-8000-000000000005",
        isSharedWithHousehold: true,
        type: "expense"
      },
      "created",
      "actor-1"
    );

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_household_notifications",
      expect.objectContaining({
        notification_body: "Un membro della famiglia ha aggiunto un movimento condiviso di € 35,00."
      })
    );
  });

  it("uses neutral wording when a family invite is accepted", async () => {
    const supabase = rpcSupabase();

    const { notifyFamilyEvent } = await import("@/services/notifications/notification-service");
    await notifyFamilyEvent(
      supabase,
      "household-1",
      "family_member_joined",
      "Nuovo membro in famiglia",
      "Un nuovo membro ha accettato l'invito famiglia.",
      "invite:token:accepted",
      "actor-1"
    );

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_household_notifications",
      expect.objectContaining({
        notification_body: "Vito ora fa parte della famiglia."
      })
    );
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

  it("marks displayed unread notifications as read in one DB update", async () => {
    const inFilter = vi.fn().mockResolvedValue({ error: null });
    const chain = {
      eq: vi.fn(() => chain),
      in: inFilter
    };
    const update = vi.fn().mockReturnValue(chain);
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as unknown as SupabaseClient;

    await markNotificationsRead(supabase, "user-1", ["notification-1", "notification-2"]);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_read: true, read_at: expect.any(String) }));
    expect(chain.eq).toHaveBeenCalledWith("recipient_user_id", "user-1");
    expect(chain.eq).toHaveBeenCalledWith("is_read", false);
    expect(inFilter).toHaveBeenCalledWith("id", ["notification-1", "notification-2"]);
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
