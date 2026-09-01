import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMonthRange } from "@/lib/calculations/dates";
import type { FixedExpenseRequestDecisionInput, FixedExpenseRequestFormInput } from "@/lib/fixed-expenses/validation";
import type { FixedExpenseRequest } from "@/types/domain";
import { generateFixedExpenseMovements } from "./fixed-expense-service";
import {
  notifyFixedExpenseRequestAccepted,
  notifyFixedExpenseRequestCancelled,
  notifyFixedExpenseRequestCreated,
  notifyFixedExpenseRequestRejected
} from "@/services/notifications/notification-service";

type Row = Record<string, unknown>;

export interface FixedExpenseRequestRecipientOption {
  householdId: string;
  userId: string;
  fullName: string;
  username: string;
}

export async function getFixedExpenseRequestRecipientOptions(supabase: SupabaseClient, userId: string): Promise<FixedExpenseRequestRecipientOption[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .eq("status", "ACTIVE");

  if (membershipError) {
    throw membershipError;
  }

  const householdIds = [...new Set((memberships ?? []).map((row: Row) => String(row.household_id)))];
  if (householdIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, user_id, profiles(full_name, username)")
    .in("household_id", householdIds)
    .eq("status", "ACTIVE")
    .neq("user_id", userId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: Row) => {
    const profile = asRecord(row.profiles);
    return {
      householdId: String(row.household_id),
      userId: String(row.user_id),
      fullName: profile?.full_name ? String(profile.full_name) : "Membro",
      username: profile?.username ? String(profile.username) : ""
    };
  });
}

export async function createFixedExpenseRequest(supabase: SupabaseClient, userId: string, input: FixedExpenseRequestFormInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_fixed_expense_request", {
    target_household_id: input.householdId,
    target_recipient_user_id: input.recipientUserId,
    request_description: input.description,
    request_amount: input.amount,
    request_starts_on: input.startsOn,
    request_ends_on: input.endsOn,
    request_day_of_month: input.dayOfMonth,
    request_active_months: input.activeMonths,
    request_notes: input.notes,
    request_shared_with_family: input.sharedWithFamily
  });

  if (error) {
    throw error;
  }

  const requestId = extractRpcId(data, "request_id");
  await notifyFixedExpenseRequestCreated(supabase, { amount: input.amount, householdId: input.householdId, id: requestId, recipientUserId: input.recipientUserId }, userId);
  return requestId;
}

export async function getFixedExpenseRequestsForHousehold(supabase: SupabaseClient, householdId: string): Promise<FixedExpenseRequest[]> {
  const { data, error } = await supabase.rpc("get_fixed_expense_requests_for_display", {
    target_household_id: householdId
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapFixedExpenseRequestRow);
}

export async function getFixedExpenseRequestById(supabase: SupabaseClient, requestId: string): Promise<FixedExpenseRequest | null> {
  const { data, error } = await supabase.rpc("get_fixed_expense_request_for_display", {
    target_request_id: requestId
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows[0] ? mapFixedExpenseRequestRow(rows[0]) : null;
}

export async function acceptFixedExpenseRequest(
  supabase: SupabaseClient,
  userId: string,
  request: FixedExpenseRequest,
  input: FixedExpenseRequestDecisionInput
): Promise<string> {
  const { data, error } = await supabase.rpc("accept_fixed_expense_request", {
    target_request_id: input.requestId,
    accepted_account_id: input.accountId,
    accepted_fund_id: input.fundId,
    accepted_category_id: input.categoryId
  });

  if (error) {
    throw error;
  }

  const acceptedFixedExpenseId = extractRpcId(data, "accepted_fixed_expense_id");
  const range = currentMonthRange();
  await generateFixedExpenseMovements(supabase, userId, acceptedFixedExpenseId, range.monthStart, monthStartAfter(range.monthStart, 11));
  await notifyFixedExpenseRequestAccepted(
    supabase,
    {
      acceptedFixedExpenseId,
      amount: request.amount,
      creatorUserId: request.createdByUserId,
      householdId: request.householdId,
      id: request.id
    },
    userId
  );
  return acceptedFixedExpenseId;
}

export async function rejectFixedExpenseRequest(supabase: SupabaseClient, userId: string, request: FixedExpenseRequest): Promise<void> {
  const { error } = await supabase.rpc("reject_fixed_expense_request", {
    target_request_id: request.id
  });

  if (error) {
    throw error;
  }

  await notifyFixedExpenseRequestRejected(supabase, { amount: request.amount, creatorUserId: request.createdByUserId, householdId: request.householdId, id: request.id }, userId);
}

export async function cancelFixedExpenseRequest(supabase: SupabaseClient, userId: string, request: FixedExpenseRequest): Promise<void> {
  const { error } = await supabase.rpc("cancel_fixed_expense_request", {
    target_request_id: request.id
  });

  if (error) {
    throw error;
  }

  await notifyFixedExpenseRequestCancelled(supabase, { householdId: request.householdId, id: request.id, recipientUserId: request.recipientUserId }, userId);
}

function extractRpcId(data: unknown, key: string) {
  const first = Array.isArray(data) ? asRecord(data[0]) : asRecord(data);
  const value = first?.[key];

  if (!value) {
    throw new Error("Risposta richiesta spesa fissa non valida");
  }

  return String(value);
}

function mapFixedExpenseRequestRow(row: Row): FixedExpenseRequest {
  return {
    id: String(row.id),
    householdId: String(row.household_id),
    createdByUserId: String(row.created_by_user_id),
    creatorName: String(row.creator_name ?? "Membro"),
    recipientUserId: String(row.recipient_user_id),
    recipientName: String(row.recipient_name ?? "Membro"),
    description: String(row.description ?? ""),
    amount: String(row.amount),
    startsOn: String(row.starts_on),
    endsOn: row.ends_on ? String(row.ends_on) : null,
    dayOfMonth: Number(row.day_of_month ?? 1),
    activeMonths: Array.isArray(row.active_months) ? row.active_months.map(Number) : [],
    notes: String(row.notes ?? ""),
    sharedWithFamily: Boolean(row.shared_with_family),
    status: row.status as FixedExpenseRequest["status"],
    acceptedFixedExpenseId: row.accepted_fixed_expense_id ? String(row.accepted_fixed_expense_id) : null,
    createdAt: String(row.created_at),
    respondedAt: row.responded_at ? String(row.responded_at) : null
  };
}

function monthStartAfter(monthStart: string, offset: number): string {
  const date = new Date(`${monthStart}T00:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function asRecord(value: unknown): Row | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }
  return null;
}
