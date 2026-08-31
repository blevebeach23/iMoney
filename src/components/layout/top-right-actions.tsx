"use client";

import type { LucideIcon } from "lucide-react";
import { Bell } from "lucide-react";
import Link from "next/link";

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

  return (
    <nav
      className="fixed z-30 flex items-center gap-2"
      style={{
        right: "calc(env(safe-area-inset-right, 0px) + 1rem)",
        top: "calc(env(safe-area-inset-top, 0px) + 1rem)"
      }}
      aria-label="Azioni rapide"
    >
      <Link href="/notifications" className={actionClassName} aria-label="Notifiche" title="Notifiche">
        <Bell aria-hidden className="h-5 w-5" />
      </Link>
      {action && ActionIcon && (
        <Link href={action.href} className={actionClassName} aria-label={action.label} title={action.label}>
          <ActionIcon aria-hidden className="h-5 w-5" />
        </Link>
      )}
    </nav>
  );
}
