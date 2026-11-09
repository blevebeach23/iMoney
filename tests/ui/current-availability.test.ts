import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrentAvailability } from "@/components/dashboard/current-availability";
import { calculateFinancialBalances } from "@/lib/calculations/balances";
import { calculateLiquiditySummary } from "@/lib/calculations/liquidity";
import type { Account } from "@/types/domain";

afterEach(() => vi.unstubAllGlobals());

describe("availability displayed in Home", () => {
  it("shows the signed bank balance, liquidity, card debt and net availability with separate labels", () => {
    // Vitest's TSX transform uses classic JSX; Next uses its own JSX runtime.
    vi.stubGlobal("React", React);
    const accounts = [
      { id: "cash", name: "Cash", type: "cash", openingBalance: "1000.00" },
      { id: "bank", name: "Bank", type: "bank", openingBalance: "-300.00" },
      { id: "card", name: "Card", type: "credit_card", openingBalance: "200.00" }
    ] as Account[];
    const balances = calculateFinancialBalances(accounts, [], [], [], "2026-11-09", "2026-11-30");
    const summary = calculateLiquiditySummary(accounts, balances);
    const html = renderToStaticMarkup(React.createElement(CurrentAvailability, { summary, cards: balances.creditCardsDue, forecasts: [] }));
    expect(html).toContain("Liquidità netta attuale");
    expect(html).toContain("inclusi quelli negativi");
    expect(html).toContain("EUR -300.00");
    expect(html).toContain("EUR 700.00");
    expect(html).toContain("debito residuo");
    expect(html).toContain("EUR 200.00");
    expect(html).toContain("Disponibilità netta");
    expect(html).toContain("EUR 500.00");
  });
});
