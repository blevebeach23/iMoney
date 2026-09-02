import { describe, expect, it } from "vitest";
import { safeMovementsReturnTo } from "@/lib/navigation/return-to";

describe("movements returnTo", () => {
  it("keeps movements query params and hash for safe internal paths", () => {
    expect(safeMovementsReturnTo("/movements?period=2026-09&type=transfer#row-1")).toBe("/movements?period=2026-09&type=transfer#row-1");
  });

  it("falls back for external, protocol-relative, and unrelated paths", () => {
    expect(safeMovementsReturnTo("https://evil.example/movements")).toBe("/movements");
    expect(safeMovementsReturnTo("//evil.example/movements")).toBe("/movements");
    expect(safeMovementsReturnTo("/settings")).toBe("/movements");
  });
});
