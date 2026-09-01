"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { deletePushSubscriptionAction, savePushSubscriptionAction } from "@/lib/notifications/actions";

interface PushSettingsProps {
  activeSubscriptionCount: number;
  vapidPublicKey: string;
}

type PushState = "unsupported" | "blocked" | "active" | "inactive";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

export function PushSettings({ activeSubscriptionCount, vapidPublicKey }: Readonly<PushSettingsProps>) {
  const [message, setMessage] = useState<string | null>(null);
  const [state, setState] = useState<PushState>("inactive");
  const [isPending, startTransition] = useTransition();
  const isConfigured = vapidPublicKey.length > 0;
  const label = useMemo(() => {
    if (!isConfigured) {
      return "Non configurate";
    }
    if (state === "unsupported") {
      return "Non supportate";
    }
    if (state === "blocked") {
      return "Bloccate dal browser/dispositivo";
    }
    return state === "active" ? "Attive" : "Non attive";
  }, [isConfigured, state]);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription || activeSubscriptionCount > 0 ? "active" : "inactive"))
      .catch(() => setState(activeSubscriptionCount > 0 ? "active" : "inactive"));
  }, [activeSubscriptionCount]);

  function activate() {
    if (!isConfigured) {
      setMessage("Notifiche push non configurate sul server.");
      return;
    }

    startTransition(async () => {
      setMessage(null);

      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        setMessage("Questo browser non supporta le notifiche push PWA.");
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission === "denied") {
        setState("blocked");
        setMessage("Le notifiche sono bloccate dal browser o dal dispositivo.");
        return;
      }

      if (permission !== "granted") {
        setState("inactive");
        setMessage("Permesso notifiche non concesso.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        }));
      const result = await savePushSubscriptionAction({
        ...subscription.toJSON(),
        userAgent: navigator.userAgent
      });

      setState(result.ok ? "active" : "inactive");
      setMessage(result.message);
    });
  }

  function deactivate() {
    startTransition(async () => {
      setMessage(null);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        const result = await deletePushSubscriptionAction(subscription.endpoint);
        setMessage(result.message);
      } else {
        setMessage("Nessuna subscription push attiva su questo dispositivo.");
      }

      setState("inactive");
    });
  }

  return (
    <section className="mt-6 rounded-md border border-border bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Notifiche push</h2>
          <p className="mt-1 text-sm text-zinc-600">{label}</p>
        </div>
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold">{activeSubscriptionCount}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={activate}
          disabled={isPending || state === "unsupported" || state === "blocked"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Bell aria-hidden className="h-4 w-4" />
          Attiva
        </button>
        <button
          type="button"
          onClick={deactivate}
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold"
        >
          <BellOff aria-hidden className="h-4 w-4" />
          Disattiva
        </button>
      </div>
      {message && <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{message}</p>}
    </section>
  );
}
