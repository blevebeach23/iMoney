import { NextResponse } from "next/server";
import { runFutureExpenseReminderJob } from "@/services/notifications/future-expense-reminder-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFutureExpenseReminderJob();
    console.info("[cron] Future expense reminders", result);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron] Future expense reminders failed", {
      message: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json({ ok: false, message: "Future expense reminder job failed" }, { status: 500 });
  }
}

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}
