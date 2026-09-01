"use client";

import type { LucideIcon } from "lucide-react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NOTIFICATION_RECEIVED_FROM_SERVICE_WORKER, NOTIFICATION_UNREAD_COUNT_CHANGED, updatePwaAppBadge } from "@/lib/notifications/unread-events";

interface TopRightAction {
  href: string;
  icon: LucideIcon;
  label: string;
}

interface TopRightActionsProps {
  action?: TopRightAction;
}

const actionClassName =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-white/95 text-primary shadow-panel backdrop-blur transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-primary/20 active:scale-[0.99]";

export function TopRightActions({ action }: Readonly<TopRightActionsProps>) {
  const ActionIcon = action?.icon;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let isActive = true;

    function refreshUnreadCount() {
      return fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { count: 0 }))
      .then((data: { count?: number }) => {
        if (isActive) {
          const nextUnreadCount = Number(data.count ?? 0);
          setUnreadCount(nextUnreadCount);
          updatePwaAppBadge(nextUnreadCount);
        }
      })
      .catch(() => undefined);
    }

    function handleUnreadCountChanged(event: Event) {
      const detail = (event as CustomEvent<{ count?: number }>).detail;

      if (typeof detail?.count === "number") {
        setUnreadCount(detail.count);
        updatePwaAppBadge(detail.count);
        return;
      }

      void refreshUnreadCount();
    }

    function handleServiceWorkerMessage(event: MessageEvent<{ type?: string }>) {
      if (event.data?.type === NOTIFICATION_RECEIVED_FROM_SERVICE_WORKER) {
        void refreshUnreadCount();
      }
    }

    void refreshUnreadCount();
    window.addEventListener(NOTIFICATION_UNREAD_COUNT_CHANGED, handleUnreadCountChanged);
    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    return () => {
      isActive = false;
      window.removeEventListener(NOTIFICATION_UNREAD_COUNT_CHANGED, handleUnreadCountChanged);
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, []);

  return (
    <nav
      className="fixed z-30 flex items-center gap-2"
      style={{
        right: "calc(env(safe-area-inset-right, 0px) + 1rem)",
        top: "calc(env(safe-area-inset-top, 0px) + 1rem)"
      }}
      aria-label="Azioni rapide"
    >
      <Link href="/notifications" className={`${actionClassName} relative`} aria-label="Notifiche" title="Notifiche">
        <Bell aria-hidden className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>
      {action && ActionIcon && (
        <Link href={action.href} className={actionClassName} aria-label={action.label} title={action.label}>
          <ActionIcon aria-hidden className="h-5 w-5" />
        </Link>
      )}
    </nav>
  );
}
