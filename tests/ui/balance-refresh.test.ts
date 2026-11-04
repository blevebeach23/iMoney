import { afterEach, describe, expect, it, vi } from "vitest";
import { BalanceRefresh } from "@/components/dashboard/balance-refresh";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), cleanup: undefined as (() => void) | undefined }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("react", () => ({ useEffect: (effect: () => () => void) => { mocks.cleanup = effect(); } }));

afterEach(() => {
  mocks.cleanup?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("dashboard balance refresh", () => {
  it("refreshes on resume, reconnection and each visible minute, and cleans up listeners", () => {
    vi.useFakeTimers();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const win = Object.assign(new EventTarget(), { setInterval, clearInterval });
    const nav = { onLine: true };
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", nav);
    BalanceRefresh();
    vi.advanceTimersByTime(60_000);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    doc.visibilityState = "hidden";
    vi.advanceTimersByTime(60_000);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("focus"));
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
    nav.onLine = false;
    vi.advanceTimersByTime(60_000);
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
    nav.onLine = true;
    win.dispatchEvent(new Event("online"));
    expect(mocks.refresh).toHaveBeenCalledTimes(4);
    mocks.cleanup?.();
    mocks.cleanup = undefined;
    vi.advanceTimersByTime(60_000);
    win.dispatchEvent(new Event("focus"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.refresh).toHaveBeenCalledTimes(4);
  });
});
