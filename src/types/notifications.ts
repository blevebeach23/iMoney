export type NotificationType =
  | "family_invite"
  | "family_invite_accepted"
  | "family_invite_rejected"
  | "family_member_joined"
  | "family_member_removed"
  | "family_role_changed"
  | "movement_shared_created"
  | "movement_shared_updated"
  | "movement_shared_deleted"
  | "movement_request_created"
  | "movement_request_accepted"
  | "movement_request_rejected"
  | "movement_request_cancelled"
  | "reimbursement_shared_created"
  | "fund_shared_created"
  | "fund_shared_updated"
  | "fund_target_reached"
  | "fund_target_exceeded"
  | "fund_unshared"
  | "budget_household_created"
  | "budget_household_updated"
  | "budget_exceeded"
  | "transfer_shared";

export interface AppNotification {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  householdId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  destinationUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PushSubscriptionInput {
  auth: string;
  endpoint: string;
  p256dh: string;
  userAgent?: string | null;
}
