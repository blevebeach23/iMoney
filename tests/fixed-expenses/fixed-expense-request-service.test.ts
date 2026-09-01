import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/fixed-expenses/fixed-expense-service", () => ({
  generateFixedExpenseMovements: vi.fn().mockResolvedValue(2)
}));

import { generateFixedExpenseMovements } from "@/services/fixed-expenses/fixed-expense-service";
import {
  acceptFixedExpenseRequest,
  cancelFixedExpenseRequest,
  createFixedExpenseRequest,
  rejectFixedExpenseRequest
} from "@/services/fixed-expenses/fixed-expense-request-service";
import type { FixedExpenseRequest } from "@/types/domain";

function rpcSupabase() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { full_name: "Vito Bleve", username: "vito" }, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn((name: string) => {
    if (name === "create_fixed_expense_request") {
      return Promise.resolve({ data: [{ request_id: "10000000-0000-4000-8000-000000000020" }], error: null });
    }
    if (name === "accept_fixed_expense_request") {
      return Promise.resolve({
        data: [{ request_id: "10000000-0000-4000-8000-000000000020", accepted_fixed_expense_id: "10000000-0000-4000-8000-000000000021" }],
        error: null
      });
    }
    if (name === "reject_fixed_expense_request" || name === "cancel_fixed_expense_request") {
      return Promise.resolve({ data: [{ request_id: "10000000-0000-4000-8000-000000000020" }], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  return { from, rpc } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

function request(partial: Partial<FixedExpenseRequest> = {}): FixedExpenseRequest {
  return {
    acceptedFixedExpenseId: null,
    activeMonths: [1, 2, 3],
    amount: "45.00",
    createdAt: "2026-09-01T10:00:00Z",
    createdByUserId: "creator-1",
    creatorName: "Vito",
    dayOfMonth: 10,
    description: "Palestra",
    endsOn: null,
    householdId: "30000000-0000-4000-8000-000000000010",
    id: "10000000-0000-4000-8000-000000000020",
    notes: "",
    recipientName: "Anna",
    recipientUserId: "recipient-1",
    respondedAt: null,
    sharedWithFamily: true,
    startsOn: "2026-09-01",
    status: "PENDING",
    ...partial
  };
}

describe("fixed expense request service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending request and notifies only the recipient", async () => {
    const supabase = rpcSupabase();
    await createFixedExpenseRequest(supabase, "creator-1", {
      activeMonths: [1, 2, 3],
      amount: "45.00",
      dayOfMonth: 10,
      description: "Palestra",
      endsOn: null,
      householdId: "30000000-0000-4000-8000-000000000010",
      notes: "",
      recipientUserId: "40000000-0000-4000-8000-000000000010",
      sharedWithFamily: true,
      startsOn: "2026-09-01"
    });

    expect(supabase.rpc).toHaveBeenCalledWith("create_fixed_expense_request", expect.objectContaining({
      target_recipient_user_id: "40000000-0000-4000-8000-000000000010",
      request_amount: "45.00"
    }));
    expect(supabase.rpc).toHaveBeenCalledWith("create_direct_notification", expect.objectContaining({
      target_recipient_user_id: "40000000-0000-4000-8000-000000000010",
      notification_type: "fixed_expense_request_created",
      destination_url: "/family/fixed-expense-requests/10000000-0000-4000-8000-000000000020"
    }));
  });

  it("accepts with recipient references, generates movements through the existing service and notifies creator", async () => {
    const supabase = rpcSupabase();
    const acceptedFixedExpenseId = await acceptFixedExpenseRequest(supabase, "recipient-1", request(), {
      accountId: "50000000-0000-4000-8000-000000000010",
      categoryId: "20000000-0000-4000-8000-000000000011",
      containerId: "account:50000000-0000-4000-8000-000000000010",
      fundId: null,
      requestId: "10000000-0000-4000-8000-000000000020"
    });

    expect(acceptedFixedExpenseId).toBe("10000000-0000-4000-8000-000000000021");
    expect(supabase.rpc).toHaveBeenCalledWith("accept_fixed_expense_request", expect.objectContaining({
      accepted_account_id: "50000000-0000-4000-8000-000000000010",
      accepted_fund_id: null
    }));
    expect(generateFixedExpenseMovements).toHaveBeenCalledWith(
      supabase,
      "recipient-1",
      "10000000-0000-4000-8000-000000000021",
      expect.stringMatching(/^\d{4}-\d{2}-01$/),
      expect.stringMatching(/^\d{4}-\d{2}-01$/)
    );
    expect(supabase.rpc).toHaveBeenCalledWith("create_direct_notification", expect.objectContaining({
      target_recipient_user_id: "creator-1",
      notification_type: "fixed_expense_request_accepted",
      destination_url: "/family/fixed-expense-requests/10000000-0000-4000-8000-000000000020"
    }));
  });

  it("rejects without creating fixed expenses or movements and notifies the creator", async () => {
    const supabase = rpcSupabase();
    await rejectFixedExpenseRequest(supabase, "recipient-1", request());

    expect(supabase.rpc).toHaveBeenCalledWith("reject_fixed_expense_request", { target_request_id: "10000000-0000-4000-8000-000000000020" });
    expect(supabase.rpc).not.toHaveBeenCalledWith("accept_fixed_expense_request", expect.anything());
    expect(generateFixedExpenseMovements).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("create_direct_notification", expect.objectContaining({
      target_recipient_user_id: "creator-1",
      notification_type: "fixed_expense_request_rejected"
    }));
  });

  it("cancels a pending request from the creator and notifies the recipient", async () => {
    const supabase = rpcSupabase();
    await cancelFixedExpenseRequest(supabase, "creator-1", request());

    expect(supabase.rpc).toHaveBeenCalledWith("cancel_fixed_expense_request", { target_request_id: "10000000-0000-4000-8000-000000000020" });
    expect(supabase.rpc).toHaveBeenCalledWith("create_direct_notification", expect.objectContaining({
      target_recipient_user_id: "recipient-1",
      notification_type: "fixed_expense_request_cancelled"
    }));
  });
});
