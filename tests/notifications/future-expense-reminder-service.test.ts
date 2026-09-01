import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRomeNoon,
  runFutureExpenseReminderJob,
  tomorrowInRome
} from "@/services/notifications/future-expense-reminder-service";
import { deliverPushForNotifications } from "@/services/notifications/notification-service";

vi.mock("server-only", () => ({}));
vi.mock("@/services/notifications/notification-service", () => ({
  deliverPushForNotifications: vi.fn()
}));

const movementTomorrow = {
  id: "10000000-0000-4000-8000-000000000001",
  owner_user_id: "owner-1",
  household_id: null,
  shared_with_family: false,
  type: "expense",
  amount: "59.90",
  occurred_on: "2026-09-02",
  description: "Internet",
  created_by: "owner-1"
};

function supabaseMock(input: {
  householdMembers?: Array<Record<string, unknown>>;
  insertedNotifications?: Array<Record<string, unknown>>;
  movements?: Array<Record<string, unknown>>;
}) {
  const movementsOrder = vi.fn().mockResolvedValue({ data: input.movements ?? [], error: null });
  const movementsQuery = {
    eq: vi.fn(() => movementsQuery),
    is: vi.fn(() => movementsQuery),
    order: movementsOrder
  };
  const movementSelect = vi.fn(() => movementsQuery);

  const membersIn = vi.fn().mockResolvedValue({ data: input.householdMembers ?? [], error: null });
  const membersQuery = {
    eq: vi.fn(() => membersQuery),
    in: membersIn
  };
  const memberSelect = vi.fn(() => membersQuery);

  const notificationsSelect = vi.fn().mockResolvedValue({ data: input.insertedNotifications ?? [], error: null });
  const upsert = vi.fn().mockReturnValue({ select: notificationsSelect });

  const from = vi.fn((table: string) => {
    if (table === "movements") {
      return { select: movementSelect };
    }

    if (table === "household_members") {
      return { select: memberSelect };
    }

    return { upsert };
  });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    memberSelect,
    membersIn,
    movementSelect,
    movementsQuery,
    notificationsSelect,
    upsert
  };
}

describe("future expense reminder job", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a reminder notification for an expense movement scheduled tomorrow", async () => {
    vi.mocked(deliverPushForNotifications).mockResolvedValue(undefined);
    const supabase = supabaseMock({
      movements: [movementTomorrow],
      insertedNotifications: [{ id: "notification-1" }]
    });

    const result = await runFutureExpenseReminderJob({
      now: new Date("2026-09-01T10:00:00.000Z"),
      supabase: supabase.client
    });

    expect(supabase.movementSelect).toHaveBeenCalledWith("id, owner_user_id, household_id, shared_with_family, type, amount, occurred_on, description, created_by");
    expect(supabase.movementsQuery.eq).toHaveBeenCalledWith("type", "expense");
    expect(supabase.movementsQuery.eq).toHaveBeenCalledWith("occurred_on", "2026-09-02");
    expect(supabase.movementsQuery.is).toHaveBeenCalledWith("deleted_at", null);
    expect(supabase.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          body: "Domani è previsto il pagamento di € 59,90 per Internet.",
          dedupe_key: "future_expense_reminder:10000000-0000-4000-8000-000000000001:2026-09-02:owner-1",
          destination_url: "/movements/10000000-0000-4000-8000-000000000001",
          recipient_user_id: "owner-1",
          title: "Spesa prevista domani",
          type: "future_expense_reminder"
        })
      ],
      { ignoreDuplicates: true, onConflict: "dedupe_key" }
    );
    expect(deliverPushForNotifications).toHaveBeenCalledWith(["notification-1"]);
    expect(result).toMatchObject({ createdNotifications: 1, movementCandidates: 1, pushAttempted: 1, skippedDuplicates: 0 });
  });

  it("does not query movements outside the Europe/Rome noon window", async () => {
    const supabase = supabaseMock({ movements: [movementTomorrow] });

    const result = await runFutureExpenseReminderJob({
      now: new Date("2026-09-01T09:00:00.000Z"),
      supabase: supabase.client
    });

    expect(result.isDue).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("creates no notification when there are no tomorrow expense candidates", async () => {
    const supabase = supabaseMock({ movements: [] });

    const result = await runFutureExpenseReminderJob({
      now: new Date("2026-09-01T10:00:00.000Z"),
      supabase: supabase.client
    });

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.upsert).not.toHaveBeenCalled();
    expect(deliverPushForNotifications).not.toHaveBeenCalled();
    expect(result).toMatchObject({ createdNotifications: 0, movementCandidates: 0, pushAttempted: 0 });
  });

  it("notifies shared movement owner and active family recipients with correct routes", async () => {
    vi.mocked(deliverPushForNotifications).mockResolvedValue(undefined);
    const sharedMovement = {
      ...movementTomorrow,
      household_id: "household-1",
      owner_user_id: "owner-1",
      shared_with_family: true
    };
    const supabase = supabaseMock({
      householdMembers: [
        { household_id: "household-1", user_id: "owner-1" },
        { household_id: "household-1", user_id: "member-2" }
      ],
      insertedNotifications: [{ id: "notification-owner" }, { id: "notification-member" }],
      movements: [sharedMovement]
    });

    await runFutureExpenseReminderJob({
      now: new Date("2026-09-01T10:00:00.000Z"),
      supabase: supabase.client
    });

    expect(supabase.membersIn).toHaveBeenCalledWith("household_id", ["household-1"]);
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ destination_url: "/movements/10000000-0000-4000-8000-000000000001", recipient_user_id: "owner-1" }),
        expect.objectContaining({ destination_url: "/family/movements/10000000-0000-4000-8000-000000000001", recipient_user_id: "member-2" })
      ]),
      expect.any(Object)
    );
  });

  it("uses dedupe keys so a second run skips duplicates and does not push", async () => {
    const supabase = supabaseMock({
      insertedNotifications: [],
      movements: [movementTomorrow]
    });

    const result = await runFutureExpenseReminderJob({
      now: new Date("2026-09-01T10:00:00.000Z"),
      supabase: supabase.client
    });

    expect(result).toMatchObject({ createdNotifications: 0, skippedDuplicates: 1 });
    expect(deliverPushForNotifications).toHaveBeenCalledWith([]);
  });

  it("does not fail the cron result when push delivery fails", async () => {
    vi.mocked(deliverPushForNotifications).mockRejectedValue(new Error("push provider down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = supabaseMock({
      insertedNotifications: [{ id: "notification-1" }],
      movements: [movementTomorrow]
    });

    await expect(
      runFutureExpenseReminderJob({
        now: new Date("2026-09-01T10:00:00.000Z"),
        supabase: supabase.client
      })
    ).resolves.toMatchObject({ createdNotifications: 1 });
  });

  it("handles Europe/Rome CET and CEST noon with the correct target date", () => {
    expect(isRomeNoon(new Date("2026-01-10T11:00:00.000Z"))).toBe(true);
    expect(tomorrowInRome(new Date("2026-01-10T11:00:00.000Z"))).toBe("2026-01-11");
    expect(isRomeNoon(new Date("2026-07-10T10:00:00.000Z"))).toBe(true);
    expect(tomorrowInRome(new Date("2026-07-10T10:00:00.000Z"))).toBe("2026-07-11");
  });
});
