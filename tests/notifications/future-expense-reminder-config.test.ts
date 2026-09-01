import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("future expense reminder configuration", () => {
  it("adds the reminder notification type and a targeted candidate index", () => {
    const migration = readFileSync(join(root, "supabase", "migrations", "032_future_expense_reminders.sql"), "utf8");

    expect(migration).toContain("add value if not exists 'future_expense_reminder'");
    expect(migration).toContain("notifications_dedupe_key_full_idx");
    expect(migration).toContain("on public.notifications(dedupe_key)");
    expect(migration).toContain("movements_future_expense_reminder_idx");
    expect(migration).toContain("on public.movements(occurred_on, created_at desc)");
    expect(migration).toContain("where deleted_at is null and type = 'expense'");
  });

  it("configures the minimum daily UTC cron invocations needed for Europe/Rome DST", () => {
    const vercel = readFileSync(join(root, "vercel.json"), "utf8");
    const envExample = readFileSync(join(root, ".env.example"), "utf8");

    expect(vercel).toContain("\"path\": \"/api/cron/future-expense-reminders\"");
    expect(vercel).toContain("\"schedule\": \"0 10,11 * * *\"");
    expect(envExample).toContain("CRON_SECRET=");
  });

  it("uses materialized movements only and does not duplicate fixed expense scheduling logic", () => {
    const service = readFileSync(join(root, "src", "services", "notifications", "future-expense-reminder-service.ts"), "utf8");
    const center = readFileSync(join(root, "src", "components", "notifications", "notification-center.tsx"), "utf8");

    expect(service).toContain(".from(\"movements\")");
    expect(service).not.toContain(".from(\"fixed_expenses\")");
    expect(service).not.toContain(".from(\"fixed_expense_months\")");
    expect(center).toContain("Promemoria");
  });
});
