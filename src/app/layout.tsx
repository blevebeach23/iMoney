import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppChrome } from "@/components/layout/app-chrome";

export const metadata: Metadata = {
  title: "iMoney",
  description: "Rendiconto personale e familiare",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#1f6f5b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
