"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deletePushSubscription, getUnreadNotificationCount, markNotificationsRead, savePushSubscription } from "@/services/notifications/notification-service";

const endpointSchema = z.string().trim().url();

const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    auth: z.string().trim().min(1),
    p256dh: z.string().trim().min(1)
  }),
  userAgent: z.string().trim().optional()
});

async function requireUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function markDisplayedNotificationsReadAction(notificationIds: string[]) {
  const ids = z.array(z.string().trim().min(1)).max(100).parse(notificationIds);
  const { supabase, user } = await requireUser();
  await markNotificationsRead(supabase, user.id, ids);
  const unreadCount = await getUnreadNotificationCount(supabase, user.id);
  revalidatePath("/notifications");
  return { ok: true, unreadCount };
}

export async function savePushSubscriptionAction(payload: unknown) {
  const parsed = pushSubscriptionSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, message: "Subscription push non valida." };
  }

  const { supabase, user } = await requireUser();
  await savePushSubscription(supabase, user.id, {
    endpoint: parsed.data.endpoint,
    auth: parsed.data.keys.auth,
    p256dh: parsed.data.keys.p256dh,
    userAgent: parsed.data.userAgent ?? null
  });
  revalidatePath("/settings/profile");
  return { ok: true, message: "Notifiche push attive." };
}

export async function deletePushSubscriptionAction(endpoint: string) {
  const parsed = endpointSchema.safeParse(endpoint);

  if (!parsed.success) {
    return { ok: false, message: "Subscription push non valida." };
  }

  const { supabase, user } = await requireUser();
  await deletePushSubscription(supabase, user.id, parsed.data);
  revalidatePath("/settings/profile");
  return { ok: true, message: "Notifiche push disattivate." };
}
