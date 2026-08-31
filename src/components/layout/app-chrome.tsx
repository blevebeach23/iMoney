"use client";

import { usePathname } from "next/navigation";
import { Plus, Settings } from "lucide-react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopRightActions } from "@/components/layout/top-right-actions";

const publicPrefixes = ["/login", "/register", "/forgot-password", "/auth"];

export function AppChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const hideNav = publicPrefixes.some((prefix) => pathname.startsWith(prefix)) || pathname.startsWith("/onboarding");
  const topRightAction =
    pathname === "/"
      ? { href: "/add", icon: Plus, label: "Aggiungi movimento" }
      : pathname === "/family"
        ? { href: "/family/settings", icon: Settings, label: "Impostazioni famiglia" }
        : undefined;

  return (
    <>
      {!hideNav && <TopRightActions action={topRightAction} />}
      {children}
      {!hideNav && <BottomNav />}
    </>
  );
}
