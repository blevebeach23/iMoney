import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { synchronizeFinancialAutomation } from "@/services/automation/financial-automation-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const supabase = createSupabaseAdminClient();
    let owners = 0;
    let created = 0;
    // Keyset pagination also covers users who have not opened the app recently.
    let after: string | undefined;
    while (true) {
      let query = supabase.from("profiles").select("id").order("id").limit(100);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data) {
        created += await synchronizeFinancialAutomation(supabase, String(row.id));
        owners += 1;
      }
      after = String(data[data.length - 1].id);
    }
    return NextResponse.json({ ok: true, owners, created });
  } catch (error) {
    console.error("[cron] Financial automation failed", { message: error instanceof Error ? error.message : "Database error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
