"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/notifications/actions";
import { emitNotificationUnreadCountChanged } from "@/lib/notifications/unread-events";

export function MarkNotificationReadButton({ id, className }: Readonly<{ id: string; className?: string }>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      className={className}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await markNotificationReadAction(id);
          emitNotificationUnreadCountChanged(result.unreadCount);
          router.refresh();
        });
      }}
    >
      Segna come letta
    </Button>
  );
}

export function MarkAllNotificationsReadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          emitNotificationUnreadCountChanged(result.unreadCount);
          router.refresh();
        });
      }}
    >
      Segna tutte come lette
    </Button>
  );
}
