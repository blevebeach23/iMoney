import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/future-expense-reminders/route";
import { runFutureExpenseReminderJob } from "@/services/notifications/future-expense-reminder-service";

vi.mock("@/services/notifications/future-expense-reminder-service", () => ({
  runFutureExpenseReminderJob: vi.fn()
}));

describe("future expense reminder cron endpoint", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects requests without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "secret");

    const response = await GET(new Request("https://imoney.local/api/cron/future-expense-reminders"));

    expect(response.status).toBe(401);
    expect(runFutureExpenseReminderJob).not.toHaveBeenCalled();
  });

  it("runs the reminder job for authorized cron requests", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.mocked(runFutureExpenseReminderJob).mockResolvedValue({
      createdNotifications: 1,
      isDue: true,
      movementCandidates: 1,
      pushAttempted: 1,
      skippedDuplicates: 0,
      targetDate: "2026-09-02",
      timestamp: "2026-09-01T10:00:00.000Z"
    });

    const response = await GET(
      new Request("https://imoney.local/api/cron/future-expense-reminders", {
        headers: { authorization: "Bearer secret" }
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, createdNotifications: 1 });
    expect(runFutureExpenseReminderJob).toHaveBeenCalled();
  });
});
