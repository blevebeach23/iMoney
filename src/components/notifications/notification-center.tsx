"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { AutoMarkDisplayedNotificationsRead } from "@/components/notifications/notification-actions";
import { useNotifications } from "@/components/notifications/notification-provider";
import { resolveNotificationDestination } from "@/lib/notifications/routes";
import type { AppNotification } from "@/types/notifications";

interface NotificationCenterProps {
  initialNotifications: AppNotification[];
  initialUnreadCount: number;
}

export function NotificationCenter({ initialNotifications, initialUnreadCount }: Readonly<NotificationCenterProps>) {
  const { notifications, seedNotifications, unreadCount } = useNotifications();

  useEffect(() => {
    seedNotifications(initialNotifications, initialUnreadCount);
  }, [initialNotifications, initialUnreadCount, seedNotifications]);

  const unreadNotificationIds = useMemo(() => notifications.filter((notification) => !notification.isRead).map((notification) => notification.id), [notifications]);

  return (
    <>
      <AutoMarkDisplayedNotificationsRead notificationIds={unreadNotificationIds} />
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Notifiche</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Centro notifiche</h1>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-600">{unreadCount === 1 ? "1 notifica non letta" : `${unreadCount} notifiche non lette`}</p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Aggiornamenti</h2>
        {notifications.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessuna notifica.</p>
        ) : (
          notifications.map((notification) => (
            <article key={notification.id} className={`rounded-md border bg-white p-4 shadow-panel ${notification.isRead ? "border-border" : "border-primary/40"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold">{notificationTypeLabel(notification.type)}</span>
                  <h3 className="mt-2 font-semibold text-foreground">{notification.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">{notification.body}</p>
                </div>
                {!notification.isRead && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Non letta" />}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Link href={resolveNotificationDestination(notification)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-white">
                  Apri
                </Link>
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function notificationTypeLabel(type: string) {
  if (type === "future_expense_reminder") {
    return "Promemoria";
  }

  if (type.startsWith("movement_")) {
    return "Movimenti";
  }
  if (type.startsWith("budget_")) {
    return "Budget";
  }
  if (type.startsWith("fund_")) {
    return "Fondi";
  }
  if (type.startsWith("reimbursement_")) {
    return "Rimborsi";
  }

  return "Family";
}
