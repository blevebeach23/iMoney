export const NOTIFICATION_UNREAD_COUNT_CHANGED = "imoney:notification-unread-count-changed";
export const NOTIFICATION_RECEIVED_FROM_SERVICE_WORKER = "imoney:notification-received";

declare global {
  interface Navigator {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  }
}

export function updatePwaAppBadge(unreadCount: number) {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) {
    return;
  }

  if (unreadCount > 0) {
    void navigator.setAppBadge?.(unreadCount).catch(() => undefined);
    return;
  }

  void navigator.clearAppBadge?.().catch(() => undefined);
}

export function emitNotificationUnreadCountChanged(count?: number) {
  if (typeof count === "number") {
    updatePwaAppBadge(count);
  }

  window.dispatchEvent(
    new CustomEvent<{ count?: number }>(NOTIFICATION_UNREAD_COUNT_CHANGED, {
      detail: { count }
    })
  );
}
