"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/bottom-nav";

const publicPrefixes = ["/login", "/register", "/forgot-password", "/auth"];

export function AppChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const hideNav = publicPrefixes.some((prefix) => pathname.startsWith(prefix)) || pathname.startsWith("/onboarding");

  return (
    <>
      {children}
      {!hideNav && <BottomNav />}
    </>
  );
}
