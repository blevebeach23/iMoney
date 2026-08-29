import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppChrome } from "@/components/layout/app-chrome";
import { PwaRegister } from "@/components/layout/pwa-register";

export const metadata: Metadata = {
  applicationName: "iMoney",
  title: "iMoney",
  description: "Rendiconto personale e familiare",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "iMoney"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.svg", sizes: "180x180", type: "image/svg+xml" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#1f6f5b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <PwaRegister />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
