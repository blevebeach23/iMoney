"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";

const publicPrefixes = ["/login", "/register", "/forgot-password", "/auth"];

export function AppChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const hideNav = publicPrefixes.some((prefix) => pathname.startsWith(prefix)) || pathname.startsWith("/onboarding");

  return (
    <>
      {!hideNav && (
        <Link href="/notifications" className="fixed right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-white/95 text-primary shadow-panel backdrop-blur" aria-label="Notifiche">
          <Bell aria-hidden className="h-5 w-5" />
        </Link>
      )}
      {children}
      {!hideNav && <BottomNav />}
    </>
  );
}
