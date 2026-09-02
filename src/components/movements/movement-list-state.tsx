"use client";

import { useEffect } from "react";

const STORAGE_PREFIX = "imoney:movements:scroll:";

function storageKey() {
  return `${STORAGE_PREFIX}${window.location.pathname}${window.location.search}`;
}

function saveScrollPosition() {
  try {
    sessionStorage.setItem(storageKey(), String(window.scrollY));
  } catch {
    // Storage can be unavailable in private modes; scroll restoration is best-effort.
  }
}

export function MovementListStateRestorer() {
  useEffect(() => {
    const key = storageKey();

    try {
      const storedY = Number(sessionStorage.getItem(key) ?? "0");
      if (storedY > 0) {
        requestAnimationFrame(() => window.scrollTo({ top: storedY }));
      }
    } catch {
      // Best-effort only.
    }

    const handleClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }

      const href = new URL(link.href, window.location.origin);
      if (href.origin === window.location.origin && (href.pathname.startsWith("/movements/") || href.pathname.startsWith("/transfers/"))) {
        saveScrollPosition();
      }
    };

    window.addEventListener("pagehide", saveScrollPosition);
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener("pagehide", saveScrollPosition);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  return null;
}
