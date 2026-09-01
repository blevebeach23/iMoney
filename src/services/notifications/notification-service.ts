import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveNotificationDestination } from "@/lib/notifications/routes";
import type { BudgetListItem } from "@/services/budgets/budget-service";
import type { Fund } from "@/types/domain";
import type { AppNotification, NotificationType, PushSubscriptionInput } from "@/types/notifications";
import { sendWebPush } from "./web-push";

type Row = Record<string, unknown>;

interface HouseholdNotificationInput {
  body: string;
  dedupeScope?: string;
  destinationUrl?: string;
  entityId?: string;
  entityType?: string;
  householdId: string;
  metadata?: Record<string, unknown>;
  title: string;
  type: NotificationType;
}

interface CreatedNotificationRow {
  notification_id: string;
  recipient_user_id: string;
}

export interface NotificationActor {
  id: string;
  displayName: string;
}

export async function getNotifications(supabase: SupabaseClient, userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapNotificationRow);
}

export async function getUnreadNotificationCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .eq("is_read", false);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function markNotificationRead(supabase: SupabaseClient, userId: string, notificationId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", userId);

  if (error) {
    throw error;
  }
}

export async function markNotificationsRead(supabase: SupabaseClient, userId: string, notificationIds: string[]) {
  if (notificationIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", userId)
    .eq("is_read", false)
    .in("id", notificationIds);

  if (error) {
    throw error;
  }
}

export async function markAllNotificationsRead(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", userId)
    .eq("is_read", false);

  if (error) {
    throw error;
  }
}

export async function savePushSubscription(supabase: SupabaseClient, userId: string, input: PushSubscriptionInput) {
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    throw error;
  }
}

export async function deletePushSubscription(supabase: SupabaseClient, userId: string, endpoint: string) {
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);

  if (error) {
    throw error;
  }
}

export async function getPushSubscriptionCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function createHouseholdNotification(supabase: SupabaseClient, input: HouseholdNotificationInput) {
  const destinationUrl = resolveNotificationDestination({
    destinationUrl: input.destinationUrl ?? null,
    entityId: input.entityId ?? null,
    entityType: input.entityType ?? null,
    householdId: input.householdId,
    metadata: input.metadata ?? {},
    type: input.type
  });
  const { data, error } = await supabase.rpc("create_household_notifications", {
    target_household_id: input.householdId,
    notification_type: input.type,
    notification_title: input.title,
    notification_body: input.body,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    destination_url: destinationUrl,
    notification_metadata: input.metadata ?? {},
    dedupe_scope: input.dedupeScope ?? null
  });

  if (error) {
    console.error("[notifications] DB notification creation failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    return [];
  }

  const created = (data ?? []) as CreatedNotificationRow[];
  await deliverPushForNotifications(created.map((item) => item.notification_id));
  return created;
}

export async function getNotificationActor(supabase: SupabaseClient, userId: string): Promise<NotificationActor> {
  const { data, error } = await supabase.from("profiles").select("full_name, username").eq("id", userId).maybeSingle();

  if (error) {
    console.error("[notifications] Actor profile lookup failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
  }

  const row: Row = isRecord(data) ? data : {};

  return {
    id: userId,
    displayName: shortDisplayName(row.full_name, row.username)
  };
}

export async function notifySharedMovement(
  supabase: SupabaseClient,
  movement: { amount: string; categoryName?: string; description: string; householdId: string | null; id: string; isSharedWithHousehold: boolean; type: string },
  action: "created" | "updated" | "deleted",
  actorUserId?: string
) {
  if (!movement.isSharedWithHousehold || !movement.householdId) {
    return [];
  }

  const actor = actorUserId ? await getNotificationActor(supabase, actorUserId) : defaultNotificationActor();
  const isReimbursement = movement.type === "reimbursement";
  const title =
    action === "deleted"
      ? "Movimento condiviso eliminato"
      : isReimbursement
        ? "Rimborso condiviso"
        : action === "created"
          ? "Nuovo movimento condiviso"
          : "Movimento condiviso aggiornato";
  const body = movementNotificationBody(actor.displayName, movement.amount, isReimbursement, action);
  const type: NotificationType = isReimbursement ? "reimbursement_shared_created" : action === "created" ? "movement_shared_created" : action === "updated" ? "movement_shared_updated" : "movement_shared_deleted";

  return createHouseholdNotification(supabase, {
    householdId: movement.householdId,
    type,
    title,
    body,
    entityType: "movement",
    entityId: movement.id,
    destinationUrl: action === "deleted" ? "/notifications" : `/family/movements/${movement.id}`,
    dedupeScope: `movement:${movement.id}:${action}`
  });
}

export async function notifySharedFund(supabase: SupabaseClient, fund: Fund, action: "created" | "updated" | "target_reached" | "target_exceeded" | "unshared", actorUserId?: string) {
  if (!fund.householdId) {
    return [];
  }

  const actor = actorUserId ? await getNotificationActor(supabase, actorUserId) : defaultNotificationActor();
  const titles: Record<typeof action, string> = {
    created: "Nuovo fondo condiviso",
    updated: "Fondo condiviso aggiornato",
    target_reached: "Obiettivo fondo raggiunto",
    target_exceeded: "Obiettivo fondo superato",
    unshared: "Fondo non più condiviso"
  };
  const body = fundNotificationBody(actor.displayName, fund, action);

  return createHouseholdNotification(supabase, {
    householdId: fund.householdId,
    type: action === "created" ? "fund_shared_created" : action === "updated" ? "fund_shared_updated" : action === "target_reached" ? "fund_target_reached" : action === "target_exceeded" ? "fund_target_exceeded" : "fund_unshared",
    title: titles[action],
    body,
    entityType: "fund",
    entityId: fund.id,
    destinationUrl: `/funds/${fund.id}`,
    dedupeScope: action.startsWith("target") ? `fund:${fund.id}:${action}` : undefined
  });
}

export async function notifyHouseholdBudget(
  supabase: SupabaseClient,
  householdId: string,
  budget: BudgetListItem | { id: string; amount: string; categoryName?: string | null; macroCategoryName?: string | null; month?: string },
  action: "created" | "updated" | "exceeded",
  actorUserId?: string
) {
  const actor = actorUserId ? await getNotificationActor(supabase, actorUserId) : defaultNotificationActor();
  const scope = budget.categoryName ?? budget.macroCategoryName ?? "Famiglia";
  const title = action === "exceeded" ? "Budget superato" : action === "created" ? "Nuovo budget famiglia" : "Budget famiglia aggiornato";
  const body =
    action === "exceeded"
      ? `${actor.displayName} ha superato il budget famiglia per ${scope}.`
      : `${actor.displayName} ha ${action === "created" ? "creato" : "modificato"} il budget famiglia.`;
  const metadata = "month" in budget && typeof budget.month === "string" ? budgetMonthMetadata(budget.month) : {};

  return createHouseholdNotification(supabase, {
    householdId,
    type: action === "created" ? "budget_household_created" : action === "updated" ? "budget_household_updated" : "budget_exceeded",
    title,
    body,
    entityType: "budget",
    entityId: budget.id,
    destinationUrl: "/notifications",
    metadata,
    dedupeScope: action === "exceeded" ? `budget:${budget.id}:exceeded` : undefined
  });
}

export async function notifyFamilyEvent(
  supabase: SupabaseClient,
  householdId: string,
  type: "family_invite_accepted" | "family_invite_rejected" | "family_member_joined" | "family_member_removed" | "family_role_changed",
  title: string,
  body: string,
  dedupeScope?: string,
  actorUserId?: string
) {
  const actor = actorUserId ? await getNotificationActor(supabase, actorUserId) : defaultNotificationActor();

  return createHouseholdNotification(supabase, {
    householdId,
    type,
    title,
    body: familyNotificationBody(actor.displayName, type, body),
    entityType: "household",
    entityId: householdId,
    destinationUrl: "/family",
    dedupeScope
  });
}

async function deliverPushForNotifications(notificationIds: string[]) {
  if (notificationIds.length === 0) {
    return;
  }

  let admin: SupabaseClient;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    console.error("[push] Admin client unavailable", { message: error instanceof Error ? error.message : String(error) });
    return;
  }

  const { data: notifications, error } = await admin.from("notifications").select("*").in("id", notificationIds);

  if (error) {
    console.error("[push] Notification lookup failed", { message: error.message });
    return;
  }

  for (const notification of (notifications ?? []).map(mapNotificationRow)) {
    await deliverPushForNotification(admin, notification);
  }
}

async function deliverPushForNotification(admin: SupabaseClient, notification: AppNotification) {
  const { data, error } = await admin.from("push_subscriptions").select("*").eq("user_id", notification.recipientUserId);

  if (error) {
    console.error("[push] Subscription lookup failed", { message: error.message });
    return;
  }

  for (const row of data ?? []) {
    const subscription = mapPushSubscriptionRow(row);
    const result = await sendWebPush(subscription, notification);

    if (result === "sent") {
      await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("endpoint", subscription.endpoint);
    } else if (result === "gone") {
      await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    }
  }
}

function mapPushSubscriptionRow(row: Row): PushSubscriptionInput {
  return {
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    userAgent: row.user_agent ? String(row.user_agent) : null
  };
}

function mapNotificationRow(row: Row): AppNotification {
  return {
    id: String(row.id),
    recipientUserId: String(row.recipient_user_id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    householdId: row.household_id ? String(row.household_id) : null,
    type: row.type as AppNotification["type"],
    title: String(row.title),
    body: String(row.body),
    entityType: row.entity_type ? String(row.entity_type) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    destinationUrl: row.destination_url ? String(row.destination_url) : null,
    isRead: Boolean(row.is_read),
    readAt: row.read_at ? String(row.read_at) : null,
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: String(row.created_at)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function defaultNotificationActor(): NotificationActor {
  return {
    id: "",
    displayName: "Un membro della famiglia"
  };
}

function shortDisplayName(fullName: unknown, username: unknown) {
  const name = typeof fullName === "string" ? fullName.trim() : "";

  if (name) {
    return name.split(/\s+/)[0] || name;
  }

  const handle = typeof username === "string" ? username.trim() : "";
  return handle || "Un membro della famiglia";
}

function movementNotificationBody(actorName: string, amount: string, isReimbursement: boolean, action: "created" | "updated" | "deleted") {
  if (action === "deleted") {
    return `${actorName} ha eliminato un movimento condiviso.`;
  }

  if (action === "updated") {
    return `${actorName} ha modificato ${isReimbursement ? "un rimborso" : "un movimento"} condiviso.`;
  }

  if (isReimbursement) {
    return `${actorName} ha registrato un rimborso condiviso di ${formatEuro(amount)}.`;
  }

  return `${actorName} ha aggiunto un movimento condiviso di ${formatEuro(amount)}.`;
}

function fundNotificationBody(actorName: string, fund: Fund, action: "created" | "updated" | "target_reached" | "target_exceeded" | "unshared") {
  if (action === "created") {
    return `${actorName} ha creato il fondo condiviso ${fund.name}.`;
  }

  if (action === "updated") {
    return `${actorName} ha modificato il fondo condiviso ${fund.name}.`;
  }

  if (action === "unshared") {
    return `${actorName} ha interrotto la condivisione del fondo ${fund.name}.`;
  }

  return `${actorName} ha aggiornato il fondo condiviso ${fund.name}: obiettivo ${action === "target_reached" ? "raggiunto" : "superato"}.`;
}

function familyNotificationBody(actorName: string, type: NotificationType, fallbackBody: string) {
  if (type === "family_member_joined" || type === "family_invite_accepted") {
    return `${actorName} ora fa parte della famiglia.`;
  }

  if (type === "family_invite_rejected") {
    return `${actorName} ha rifiutato l'invito famiglia.`;
  }

  if (type === "family_role_changed") {
    return `${actorName} ${fallbackBody}`;
  }

  return fallbackBody;
}

function budgetMonthMetadata(monthStart: string) {
  const match = /^(\d{4})-(\d{2})-01$/.exec(monthStart);

  if (!match) {
    return {};
  }

  return {
    year: match[1],
    month: match[2]
  };
}

function formatEuro(value: string) {
  return `€ ${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}
