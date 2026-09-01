"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/types/notifications";
import {
  NOTIFICATION_RECEIVED_FROM_SERVICE_WORKER,
  NOTIFICATION_UNREAD_COUNT_CHANGED,
  updatePwaAppBadge
} from "@/lib/notifications/unread-events";

type NotificationRow = Record<string, unknown>;

interface NotificationContextValue {
  notifications: AppNotification[];
  seedNotifications: (notifications: AppNotification[], unreadCount: number) => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: Readonly<{ children: ReactNode }>) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsRef = useRef<AppNotification[]>([]);

  const setUnread = useCallback((count: number) => {
    const nextCount = Math.max(0, count);
    setUnreadCount(nextCount);
    updatePwaAppBadge(nextCount);
  }, []);

  const refreshUnreadCount = useCallback(() => {
    return fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { count: 0 }))
      .then((data: { count?: number }) => setUnread(Number(data.count ?? 0)))
      .catch(() => undefined);
  }, [setUnread]);

  const seedNotifications = useCallback(
    (initialNotifications: AppNotification[], initialUnreadCount: number) => {
      const nextNotifications = dedupeNotifications(initialNotifications);
      notificationsRef.current = nextNotifications;
      setNotifications(nextNotifications);
      setUnread(initialUnreadCount);
    },
    [setUnread]
  );

  const applyRealtimeChange = useCallback(
    (payload: RealtimePostgresChangesPayload<NotificationRow>) => {
      const notification = mapNotificationRow(payload.new);

      if (!notification) {
        void refreshUnreadCount();
        return;
      }

      const previous = notificationsRef.current.find((item) => item.id === notification.id) ?? mapNotificationRow(payload.old);

      setNotifications((current) => {
        if (payload.eventType === "INSERT") {
          const nextNotifications = dedupeNotifications([notification, ...current]);
          notificationsRef.current = nextNotifications;
          return nextNotifications;
        }

        if (payload.eventType === "UPDATE") {
          const exists = current.some((item) => item.id === notification.id);
          const nextNotifications = dedupeNotifications(exists ? current.map((item) => (item.id === notification.id ? notification : item)) : [notification, ...current]);
          notificationsRef.current = nextNotifications;
          return nextNotifications;
        }

        return current;
      });

      if (payload.eventType === "UPDATE" && !previous) {
        void refreshUnreadCount();
        return;
      }

      setUnreadCount((currentCount) => {
        const nextCount = nextUnreadCount(currentCount, payload.eventType, notification, previous);
        updatePwaAppBadge(nextCount);
        return nextCount;
      });
    },
    [refreshUnreadCount]
  );

  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let activeUserId: string | null = null;

    function removeRealtimeChannel() {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }

      activeUserId = null;
    }

    function subscribeToUser(userId: string) {
      if (activeUserId === userId) {
        return;
      }

      removeRealtimeChannel();
      activeUserId = userId;

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_user_id=eq.${userId}`
          },
          applyRealtimeChange
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("[notifications] Realtime subscription failed", { status });
          }
        });
    }

    void refreshUnreadCount();

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      if (data.user) {
        subscribeToUser(data.user.id);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      const userId = session?.user.id ?? null;

      if (userId) {
        subscribeToUser(userId);
        void refreshUnreadCount();
        return;
      }

      removeRealtimeChannel();
      notificationsRef.current = [];
      setNotifications([]);
      setUnread(0);
    });

    function handleUnreadCountChanged(event: Event) {
      const detail = (event as CustomEvent<{ count?: number }>).detail;

      if (typeof detail?.count === "number") {
        setUnread(detail.count);
        return;
      }

      void refreshUnreadCount();
    }

    function handleServiceWorkerMessage(event: MessageEvent<{ type?: string }>) {
      if (event.data?.type === NOTIFICATION_RECEIVED_FROM_SERVICE_WORKER) {
        void refreshUnreadCount();
      }
    }

    window.addEventListener(NOTIFICATION_UNREAD_COUNT_CHANGED, handleUnreadCountChanged);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener(NOTIFICATION_UNREAD_COUNT_CHANGED, handleUnreadCountChanged);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
      removeRealtimeChannel();
    };
  }, [applyRealtimeChange, refreshUnreadCount, setUnread, supabase]);

  const value = useMemo(
    () => ({
      notifications,
      seedNotifications,
      unreadCount
    }),
    [notifications, seedNotifications, unreadCount]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotifications must be used inside NotificationProvider");
  }

  return context;
}

export function dedupeNotifications(notifications: AppNotification[]) {
  const byId = new Map<string, AppNotification>();

  for (const notification of notifications) {
    byId.set(notification.id, notification);
  }

  return Array.from(byId.values()).sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

export function nextUnreadCount(
  currentCount: number,
  eventType: "INSERT" | "UPDATE" | "DELETE",
  next: AppNotification,
  previous: AppNotification | null
) {
  if (eventType === "INSERT") {
    if (previous) {
      return currentCount;
    }

    return next.isRead ? currentCount : currentCount + 1;
  }

  if (eventType !== "UPDATE") {
    return currentCount;
  }

  if (previous?.isRead === false && next.isRead) {
    return Math.max(0, currentCount - 1);
  }

  if (previous?.isRead === true && !next.isRead) {
    return currentCount + 1;
  }

  return currentCount;
}

function mapNotificationRow(row: unknown): AppNotification | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const record = row as NotificationRow;

  if (!record.id || !record.recipient_user_id) {
    return null;
  }

  return {
    id: String(record.id),
    recipientUserId: String(record.recipient_user_id),
    actorUserId: record.actor_user_id ? String(record.actor_user_id) : null,
    householdId: record.household_id ? String(record.household_id) : null,
    type: record.type as AppNotification["type"],
    title: String(record.title ?? ""),
    body: String(record.body ?? ""),
    entityType: record.entity_type ? String(record.entity_type) : null,
    entityId: record.entity_id ? String(record.entity_id) : null,
    destinationUrl: record.destination_url ? String(record.destination_url) : null,
    isRead: Boolean(record.is_read),
    readAt: record.read_at ? String(record.read_at) : null,
    metadata: record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? (record.metadata as Record<string, unknown>) : {},
    createdAt: String(record.created_at ?? "")
  };
}
