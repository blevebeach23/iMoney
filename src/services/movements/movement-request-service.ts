import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovementRequest } from "@/types/domain";
import type { MovementRequestDecisionInput, MovementRequestFormInput } from "@/lib/movements/validation";
import {
  notifyMovementRequestAccepted,
  notifyMovementRequestCancelled,
  notifyMovementRequestCreated,
  notifyMovementRequestRejected
} from "@/services/notifications/notification-service";

type Row = Record<string, unknown>;

export async function createMovementRequest(supabase: SupabaseClient, userId: string, input: MovementRequestFormInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_movement_request", {
    target_household_id: input.householdId,
    target_recipient_user_id: input.recipientUserId,
    request_description: input.description,
    request_movement_type: input.isReimbursement ? "reimbursement" : input.type,
    request_amount: input.amount,
    request_category_id: input.categoryId,
    request_category_label: input.categoryLabel,
    request_movement_date: input.occurredOn,
    request_notes: input.notes,
    request_shared_with_family: input.sharedWithFamily,
    request_reimbursement_for_movement_id: input.isReimbursement ? input.reimbursementForMovementId : null
  });

  if (error) {
    throw error;
  }

  const requestId = extractRpcId(data, "request_id");
  await notifyMovementRequestCreated(supabase, { amount: input.amount, householdId: input.householdId, id: requestId, recipientUserId: input.recipientUserId }, userId);
  return requestId;
}

export async function getMovementRequestsForHousehold(supabase: SupabaseClient, householdId: string): Promise<MovementRequest[]> {
  const { data, error } = await supabase.rpc("get_movement_requests_for_display", {
    target_household_id: householdId
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapMovementRequestRow);
}

export async function getMovementRequestById(supabase: SupabaseClient, requestId: string): Promise<MovementRequest | null> {
  const { data, error } = await supabase.rpc("get_movement_request_for_display", {
    target_request_id: requestId
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows[0] ? mapMovementRequestRow(rows[0]) : null;
}

export async function acceptMovementRequest(supabase: SupabaseClient, _userId: string, request: MovementRequest, input: MovementRequestDecisionInput): Promise<string> {
  const { data, error } = await supabase.rpc("accept_movement_request", {
    target_request_id: input.requestId,
    accepted_account_id: input.accountId,
    accepted_fund_id: input.fundId,
    accepted_category_id: input.categoryId,
    accepted_reimbursement_for_movement_id: request.movementType === "reimbursement" ? input.reimbursementForMovementId : null
  });

  if (error) {
    throw error;
  }

  const acceptedMovementId = extractRpcId(data, "accepted_movement_id");
  await notifyMovementRequestAccepted(
    supabase,
    {
      acceptedMovementId,
      amount: request.amount,
      creatorUserId: request.createdByUserId,
      householdId: request.householdId,
      id: request.id,
      sharedWithFamily: request.sharedWithFamily
    },
    _userId
  );
  return acceptedMovementId;
}

export async function rejectMovementRequest(supabase: SupabaseClient, _userId: string, request: MovementRequest): Promise<void> {
  const { data, error } = await supabase.rpc("reject_movement_request", {
    target_request_id: request.id
  });

  if (error) {
    throw error;
  }

  await notifyMovementRequestRejected(
    supabase,
    {
      amount: request.amount,
      creatorUserId: request.createdByUserId,
      householdId: request.householdId,
      id: request.id
    },
    _userId
  );
}

export async function cancelMovementRequest(supabase: SupabaseClient, _userId: string, request: MovementRequest): Promise<void> {
  const { data, error } = await supabase.rpc("cancel_movement_request", {
    target_request_id: request.id
  });

  if (error) {
    throw error;
  }

  await notifyMovementRequestCancelled(
    supabase,
    {
      householdId: request.householdId,
      id: request.id,
      recipientUserId: request.recipientUserId
    },
    _userId
  );
}

function extractRpcId(data: unknown, key: string) {
  const first = Array.isArray(data) ? asRecord(data[0]) : asRecord(data);
  const value = first?.[key];

  if (!value) {
    throw new Error("Risposta richiesta movimento non valida");
  }

  return String(value);
}

function mapMovementRequestRow(row: Row): MovementRequest {
  return {
    id: String(row.id),
    householdId: String(row.household_id),
    createdByUserId: String(row.created_by_user_id),
    creatorName: String(row.creator_name ?? "Membro"),
    recipientUserId: String(row.recipient_user_id),
    recipientName: String(row.recipient_name ?? "Membro"),
    description: String(row.description ?? ""),
    movementType: row.movement_type as MovementRequest["movementType"],
    amount: String(row.amount),
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryLabel: row.category_label ? String(row.category_label) : null,
    movementDate: String(row.movement_date),
    notes: String(row.notes ?? ""),
    sharedWithFamily: Boolean(row.shared_with_family),
    reimbursementForMovementId: row.reimbursement_for_movement_id ? String(row.reimbursement_for_movement_id) : null,
    status: row.status as MovementRequest["status"],
    acceptedMovementId: row.accepted_movement_id ? String(row.accepted_movement_id) : null,
    createdAt: String(row.created_at),
    respondedAt: row.responded_at ? String(row.responded_at) : null
  };
}

function asRecord(value: unknown): Row | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }

  return null;
}
