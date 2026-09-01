import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { acceptMovementRequest, cancelMovementRequest, createMovementRequest, rejectMovementRequest } from "@/services/movements/movement-request-service";
import type { MovementRequest } from "@/types/domain";

function rpcSupabase() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { full_name: "Vito Bleve", username: "vito" }, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn((name: string) => {
    if (name === "create_movement_request") {
      return Promise.resolve({ data: [{ request_id: "10000000-0000-4000-8000-000000000010" }], error: null });
    }

    if (name === "accept_movement_request") {
      return Promise.resolve({ data: [{ request_id: "10000000-0000-4000-8000-000000000010", accepted_movement_id: "10000000-0000-4000-8000-000000000011" }], error: null });
    }

    if (name === "reject_movement_request" || name === "cancel_movement_request") {
      return Promise.resolve({ data: [{ request_id: "10000000-0000-4000-8000-000000000010" }], error: null });
    }

    return Promise.resolve({ data: null, error: null });
  });

  return { from, rpc } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

function request(partial: Partial<MovementRequest> = {}): MovementRequest {
  return {
    acceptedMovementId: null,
    amount: "45.00",
    categoryId: "20000000-0000-4000-8000-000000000010",
    categoryLabel: "Casa / Spesa",
    createdAt: "2026-09-01T10:00:00Z",
    createdByUserId: "creator-1",
    creatorName: "Vito",
    description: "Spesa",
    householdId: "30000000-0000-4000-8000-000000000010",
    id: "10000000-0000-4000-8000-000000000010",
    movementDate: "2026-09-01",
    movementType: "expense",
    notes: "",
    recipientName: "Anna",
    recipientUserId: "recipient-1",
    reimbursementForMovementId: null,
    respondedAt: null,
    sharedWithFamily: true,
    status: "PENDING",
    ...partial
  };
}

describe("movement request service", () => {
  it("creates a pending request and notifies only the recipient", async () => {
    const supabase = rpcSupabase();

    await createMovementRequest(
      supabase,
      "creator-1",
      {
        amount: "45.00",
        categoryId: "20000000-0000-4000-8000-000000000010",
        categoryLabel: "Casa / Spesa",
        description: "Spesa",
        householdId: "30000000-0000-4000-8000-000000000010",
        isReimbursement: false,
        notes: "",
        occurredOn: "2026-09-01",
        recipientUserId: "40000000-0000-4000-8000-000000000010",
        reimbursementForMovementId: null,
        sharedWithFamily: true,
        type: "expense"
      }
    );

    expect(supabase.rpc).toHaveBeenCalledWith("create_movement_request", expect.objectContaining({
      target_recipient_user_id: "40000000-0000-4000-8000-000000000010",
      request_amount: "45.00"
    }));
    expect(supabase.rpc).toHaveBeenCalledWith("create_direct_notification", expect.objectContaining({
      target_recipient_user_id: "40000000-0000-4000-8000-000000000010",
      notification_type: "movement_request_created",
      notification_body: "Vito ha inserito un movimento per tuo conto di € 45,00.",
      destination_url: "/family/movement-requests/10000000-0000-4000-8000-000000000010"
    }));
  });

  it("accepts with the recipient container and notifies the creator", async () => {
    const supabase = rpcSupabase();
    const acceptedMovementId = await acceptMovementRequest(supabase, "recipient-1", request(), {
      accountId: "50000000-0000-4000-8000-000000000010",
      categoryId: "20000000-0000-4000-8000-000000000011",
      containerId: "account:50000000-0000-4000-8000-000000000010",
      fundId: null,
      reimbursementForMovementId: null,
      requestId: "10000000-0000-4000-8000-000000000010"
    });

    expect(acceptedMovementId).toBe("10000000-0000-4000-8000-000000000011");
    expect(supabase.rpc).toHaveBeenCalledWith("accept_movement_request", expect.objectContaining({
      accepted_account_id: "50000000-0000-4000-8000-000000000010",
      accepted_fund_id: null
    }));
    expect(supabase.rpc).toHaveBeenCalledWith("create_direct_notification", expect.objectContaining({
      target_recipient_user_id: "creator-1",
      notification_type: "movement_request_accepted",
      notification_body: "Vito ha accettato il movimento di € 45,00.",
      destination_url: "/family/movements/10000000-0000-4000-8000-000000000011"
    }));
  });

  it("rejects without creating a movement and notifies the creator", async () => {
    const supabase = rpcSupabase();
    await rejectMovementRequest(supabase, "recipient-1", request());

    expect(supabase.rpc).toHaveBeenCalledWith("reject_movement_request", { target_request_id: "10000000-0000-4000-8000-000000000010" });
    expect(supabase.rpc).not.toHaveBeenCalledWith("accept_movement_request", expect.anything());
    expect(supabase.rpc).toHaveBeenCalledWith("create_direct_notification", expect.objectContaining({
      target_recipient_user_id: "creator-1",
      notification_type: "movement_request_rejected",
      notification_body: "Vito ha rifiutato il movimento di € 45,00."
    }));
  });

  it("cancels a pending request from the creator and notifies the recipient", async () => {
    const supabase = rpcSupabase();
    await cancelMovementRequest(supabase, "creator-1", request());

    expect(supabase.rpc).toHaveBeenCalledWith("cancel_movement_request", { target_request_id: "10000000-0000-4000-8000-000000000010" });
    expect(supabase.rpc).toHaveBeenCalledWith("create_direct_notification", expect.objectContaining({
      target_recipient_user_id: "recipient-1",
      notification_type: "movement_request_cancelled",
      notification_body: "Vito ha annullato una richiesta di movimento."
    }));
  });
});
