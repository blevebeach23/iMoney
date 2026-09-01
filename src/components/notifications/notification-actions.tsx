"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { markDisplayedNotificationsReadAction } from "@/lib/notifications/actions";
import { emitNotificationUnreadCountChanged } from "@/lib/notifications/unread-events";

export function AutoMarkDisplayedNotificationsRead({ notificationIds }: Readonly<{ notificationIds: string[] }>) {
  const router = useRouter();
  const markedKeyRef = useRef<string | null>(null);
  const notificationKey = useMemo(() => notificationIds.join(","), [notificationIds]);

  useEffect(() => {
    if (!notificationKey || markedKeyRef.current === notificationKey) {
      return;
    }

    markedKeyRef.current = notificationKey;

    markDisplayedNotificationsReadAction(notificationIds)
      .then((result) => {
        emitNotificationUnreadCountChanged(result.unreadCount);
        router.refresh();
      })
      .catch(() => undefined);
  }, [notificationIds, notificationKey, router]);

  return null;
}
