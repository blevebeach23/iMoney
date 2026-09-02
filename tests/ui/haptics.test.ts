import { afterEach, describe, expect, it, vi } from "vitest";
import { hapticTap } from "@/lib/haptics";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator
  });
});

describe("hapticTap", () => {
  it("vibrates lightly when the browser supports it", () => {
    const vibrate = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { vibrate }
    });

    hapticTap();

    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("is a no-op when vibration is unsupported", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {}
    });

    expect(() => hapticTap()).not.toThrow();
  });
});
