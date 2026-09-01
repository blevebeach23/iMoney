import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverPushForNotifications } from "@/services/notifications/notification-service";

type Row = Record<string, unknown>;

interface FutureExpenseMovement {
  amount: string;
  createdBy: string | null;
  description: string;
  householdId: string | null;
  id: string;
  occurredOn: string;
  ownerUserId: string;
  sharedWithFamily: boolean;
}

interface ReminderRecipient {
  destinationUrl: string;
  movement: FutureExpenseMovement;
  recipientUserId: string;
}

export interface FutureExpenseReminderResult {
  createdNotifications: number;
  isDue: boolean;
  movementCandidates: number;
  pushAttempted: number;
  skippedDuplicates: number;
  targetDate: string;
  timestamp: string;
}

export async function runFutureExpenseReminderJob(input: {
  now?: Date;
  supabase?: SupabaseClient;
} = {}): Promise<FutureExpenseReminderResult> {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const targetDate = tomorrowInRome(now);
  const baseResult = {
    createdNotifications: 0,
    isDue: isRomeNoon(now),
    movementCandidates: 0,
    pushAttempted: 0,
    skippedDuplicates: 0,
    targetDate,
    timestamp
  };

  if (!baseResult.isDue) {
    return baseResult;
  }

  const supabase = input.supabase ?? createSupabaseAdminClient();
  const movements = await getFutureExpenseMovements(supabase, targetDate);

  if (movements.length === 0) {
    return { ...baseResult, movementCandidates: 0 };
  }

  const recipients = await getReminderRecipients(supabase, movements);

  if (recipients.length === 0) {
    return { ...baseResult, movementCandidates: movements.length };
  }

  const notificationRows = recipients.map((recipient) => toNotificationInsert(recipient));
  const { data: insertedNotifications, error } = await supabase
    .from("notifications")
    .upsert(notificationRows, { ignoreDuplicates: true, onConflict: "dedupe_key" })
    .select("id");

  if (error) {
    throw error;
  }

  const notificationIds = (insertedNotifications ?? []).map((row: Row) => String(row.id));

  try {
    await deliverPushForNotifications(notificationIds);
  } catch (error) {
    console.error("[cron] Future expense reminder push failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return {
    ...baseResult,
    createdNotifications: notificationIds.length,
    movementCandidates: movements.length,
    pushAttempted: notificationIds.length,
    skippedDuplicates: recipients.length - notificationIds.length
  };
}

export function isRomeNoon(now: Date) {
  return Number(romeDatePart(now, "hour")) === 12;
}

export function tomorrowInRome(now: Date) {
  const parts = romeParts(now);
  const romeMiddayUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  romeMiddayUtc.setUTCDate(romeMiddayUtc.getUTCDate() + 1);
  const tomorrow = romeParts(romeMiddayUtc);

  return `${tomorrow.year}-${String(tomorrow.month).padStart(2, "0")}-${String(tomorrow.day).padStart(2, "0")}`;
}

async function getFutureExpenseMovements(supabase: SupabaseClient, targetDate: string) {
  const { data, error } = await supabase
    .from("movements")
    .select("id, owner_user_id, household_id, shared_with_family, type, amount, occurred_on, description, created_by")
    .eq("type", "expense")
    .eq("occurred_on", targetDate)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapMovementRow);
}

async function getReminderRecipients(supabase: SupabaseClient, movements: FutureExpenseMovement[]) {
  const householdIds = [
    ...new Set(
      movements
        .filter((movement) => movement.sharedWithFamily && movement.householdId)
        .map((movement) => String(movement.householdId))
    )
  ];
  const membersByHousehold = new Map<string, string[]>();

  if (householdIds.length > 0) {
    const { data, error } = await supabase
      .from("household_members")
      .select("household_id, user_id")
      .eq("status", "ACTIVE")
      .in("household_id", householdIds);

    if (error) {
      throw error;
    }

    for (const row of data ?? []) {
      const householdId = String((row as Row).household_id);
      const members = membersByHousehold.get(householdId) ?? [];
      members.push(String((row as Row).user_id));
      membersByHousehold.set(householdId, members);
    }
  }

  const recipients: ReminderRecipient[] = [];

  for (const movement of movements) {
    recipients.push({
      destinationUrl: `/movements/${movement.id}`,
      movement,
      recipientUserId: movement.ownerUserId
    });

    if (!movement.sharedWithFamily || !movement.householdId) {
      continue;
    }

    const householdMembers = membersByHousehold.get(movement.householdId) ?? [];

    for (const memberUserId of householdMembers) {
      if (memberUserId === movement.ownerUserId || memberUserId === movement.createdBy) {
        continue;
      }

      recipients.push({
        destinationUrl: `/family/movements/${movement.id}`,
        movement,
        recipientUserId: memberUserId
      });
    }
  }

  return recipients;
}

function toNotificationInsert(recipient: ReminderRecipient) {
  const eventKey = `future_expense_reminder:${recipient.movement.id}:${recipient.movement.occurredOn}:${recipient.recipientUserId}`;

  return {
    recipient_user_id: recipient.recipientUserId,
    actor_user_id: null,
    household_id: recipient.movement.sharedWithFamily ? recipient.movement.householdId : null,
    type: "future_expense_reminder",
    title: "Spesa prevista domani",
    body: reminderBody(recipient.movement),
    entity_type: "movement",
    entity_id: recipient.movement.id,
    destination_url: recipient.destinationUrl,
    metadata: {
      eventKey,
      movementDate: recipient.movement.occurredOn
    },
    dedupe_key: eventKey
  };
}

function reminderBody(movement: FutureExpenseMovement) {
  const amount = formatEuro(movement.amount);
  const description = movement.description.trim();

  if (!description) {
    return `Domani è prevista una spesa di ${amount}.`;
  }

  return `Domani è previsto il pagamento di ${amount} per ${description}.`;
}

function mapMovementRow(row: Row): FutureExpenseMovement {
  return {
    amount: String(row.amount),
    createdBy: row.created_by ? String(row.created_by) : null,
    description: String(row.description ?? ""),
    householdId: row.household_id ? String(row.household_id) : null,
    id: String(row.id),
    occurredOn: String(row.occurred_on),
    ownerUserId: String(row.owner_user_id),
    sharedWithFamily: Boolean(row.shared_with_family)
  };
}

function formatEuro(value: string) {
  return `€ ${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
}

function romeDatePart(date: Date, part: Intl.DateTimeFormatPartTypes) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  })
    .formatToParts(date)
    .find((item) => item.type === part)?.value;
}

function romeParts(date: Date) {
  return {
    day: Number(romeDatePart(date, "day")),
    month: Number(romeDatePart(date, "month")),
    year: Number(romeDatePart(date, "year"))
  };
}
