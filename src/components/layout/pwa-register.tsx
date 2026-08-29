"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration is non-critical: the online app must remain usable without a service worker.
    });
  }, []);

  return null;
}
