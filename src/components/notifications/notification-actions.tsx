"use client";

import { useEffect, useMemo, useRef } from "react";
import { markDisplayedNotificationsReadAction } from "@/lib/notifications/actions";

export function AutoMarkDisplayedNotificationsRead({ notificationIds }: Readonly<{ notificationIds: string[] }>) {
  const markedKeyRef = useRef<string | null>(null);
  const notificationKey = useMemo(() => notificationIds.join(","), [notificationIds]);

  useEffect(() => {
    if (!notificationKey || markedKeyRef.current === notificationKey) {
      return;
    }

    markedKeyRef.current = notificationKey;

    markDisplayedNotificationsReadAction(notificationIds).catch(() => undefined);
  }, [notificationIds, notificationKey]);

  return null;
}
