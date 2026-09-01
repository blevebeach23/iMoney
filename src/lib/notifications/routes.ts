import type { AppNotification } from "@/types/notifications";

export const NOTIFICATION_FALLBACK_URL = "/notifications";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NotificationDestinationInput = Pick<AppNotification, "destinationUrl" | "entityId" | "entityType" | "householdId" | "metadata" | "type">;

export function resolveNotificationDestination(notification: NotificationDestinationInput): string {
  const entityId = notification.entityId && UUID_PATTERN.test(notification.entityId) ? encodeURIComponent(notification.entityId) : null;

  if (notification.entityType === "movement" && notification.type.endsWith("_deleted")) {
    return NOTIFICATION_FALLBACK_URL;
  }

  if (notification.entityType === "movement" && entityId) {
    return `/movements/${entityId}`;
  }

  if (notification.entityType === "transfer" && entityId) {
    return `/transfers/${entityId}`;
  }

  if (notification.entityType === "fund" && notification.type === "fund_unshared") {
    return NOTIFICATION_FALLBACK_URL;
  }

  if (notification.entityType === "fund" && entityId) {
    return `/funds/${entityId}`;
  }

  if (notification.entityType === "budget") {
    const budgetMonthUrl = budgetMonthDestination(notification.metadata);

    if (budgetMonthUrl) {
      return budgetMonthUrl;
    }

    return sanitizeNotificationDestination(notification.destinationUrl);
  }

  if (notification.type === "family_invite") {
    return NOTIFICATION_FALLBACK_URL;
  }

  if (notification.entityType === "household") {
    return "/family";
  }

  return sanitizeNotificationDestination(notification.destinationUrl);
}

export function sanitizeNotificationDestination(destinationUrl: string | null | undefined): string {
  if (!destinationUrl) {
    return NOTIFICATION_FALLBACK_URL;
  }

  try {
    const url = new URL(destinationUrl, "https://imoney.local");

    if (url.origin !== "https://imoney.local") {
      return NOTIFICATION_FALLBACK_URL;
    }

    const path = `${url.pathname}${url.search}`;
    return isKnownNotificationRoute(url.pathname) ? path : NOTIFICATION_FALLBACK_URL;
  } catch {
    return NOTIFICATION_FALLBACK_URL;
  }
}

function budgetMonthDestination(metadata: Record<string, unknown>) {
  const year = typeof metadata.year === "string" ? metadata.year : null;
  const month = typeof metadata.month === "string" ? metadata.month : null;

  if (year && month && /^\d{4}$/.test(year) && /^\d{2}$/.test(month)) {
    return `/budgets/${year}/${month}`;
  }

  return null;
}

function isKnownNotificationRoute(pathname: string) {
  return (
    pathname === NOTIFICATION_FALLBACK_URL ||
    pathname === "/family" ||
    /^\/movements\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname) ||
    /^\/transfers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname) ||
    /^\/funds\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname) ||
    /^\/budgets\/\d{4}\/\d{2}$/.test(pathname)
  );
}
