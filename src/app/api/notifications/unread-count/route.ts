import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUnreadNotificationCount } from "@/services/notifications/notification-service";

export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ count: 0 }, { status: 401 });
  }

  const count = await getUnreadNotificationCount(supabase, user.id);
  return NextResponse.json({ count });
}
