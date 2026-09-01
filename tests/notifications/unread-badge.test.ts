import { afterEach, describe, expect, it, vi } from "vitest";
import { emitNotificationUnreadCountChanged, NOTIFICATION_UNREAD_COUNT_CHANGED, updatePwaAppBadge } from "@/lib/notifications/unread-events";

describe("notification unread badge events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emits the updated unread count after one notification is marked read", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    emitNotificationUnreadCountChanged(1);

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: NOTIFICATION_UNREAD_COUNT_CHANGED,
      detail: { count: 1 }
    }));
  });

  it("emits zero unread count after all notifications are marked read", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    emitNotificationUnreadCountChanged(0);

    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: NOTIFICATION_UNREAD_COUNT_CHANGED,
      detail: { count: 0 }
    }));
  });

  it("sets the PWA app badge when unread notifications exist", () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { setAppBadge, clearAppBadge });

    updatePwaAppBadge(3);

    expect(setAppBadge).toHaveBeenCalledWith(3);
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it("clears the PWA app badge when unread notifications are zero", () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { setAppBadge, clearAppBadge });

    updatePwaAppBadge(0);

    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it("does nothing on browsers without Badging API support", () => {
    vi.stubGlobal("navigator", {});

    expect(() => updatePwaAppBadge(2)).not.toThrow();
  });
});
