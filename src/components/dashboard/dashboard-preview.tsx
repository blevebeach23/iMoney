import { CreditCard, Landmark, Plus, WalletCards } from "lucide-react";
import { calculateBudgetUsage } from "@/lib/calculations/budget";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import type { Movement } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { StatTile } from "./stat-tile";

const sampleMovements: Movement[] = [
  {
    id: "1",
    ownerUserId: "demo",
    householdId: null,
    accountId: "bank",
    fundId: null,
    categoryId: "salary",
    type: "income",
    amount: "2450.00",
    occurredOn: "2026-08-01",
    description: "Stipendio",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null
  },
  {
    id: "2",
    ownerUserId: "demo",
    householdId: "family",
    accountId: "credit-card",
    fundId: null,
    categoryId: "groceries",
    type: "expense",
    amount: "410.00",
    occurredOn: "2026-08-15",
    description: "Spesa e casa",
    isSharedWithHousehold: true,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null
  },
  {
    id: "3",
    ownerUserId: "demo",
    householdId: "family",
    accountId: "bank",
    fundId: null,
    categoryId: "nursery",
    type: "expense",
    amount: "500.00",
    occurredOn: "2026-08-20",
    description: "Asilo",
    isSharedWithHousehold: true,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null
  },
  {
    id: "4",
    ownerUserId: "demo",
    householdId: "family",
    accountId: "bank",
    fundId: null,
    categoryId: "nursery",
    type: "reimbursement",
    amount: "300.00",
    occurredOn: "2026-08-28",
    description: "Rimborso regione",
    isSharedWithHousehold: true,
    reimbursementForMovementId: "3",
    importBatchId: null,
    deletedAt: null
  }
];

export function DashboardPreview() {
  const summary = calculateMonthlySummary(sampleMovements);
  const budget = calculateBudgetUsage("1800.00", sampleMovements);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">Agosto 2026</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-foreground">Rendiconto</h1>
        </div>
        <Button variant="secondary" className="h-11 px-3" aria-label="Aggiungi movimento">
          <Plus aria-hidden className="h-5 w-5" />
        </Button>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <StatTile label="Entrate" value={`EUR ${summary.income}`} tone="good" />
        <StatTile label="Spese nette" value={`EUR ${summary.netExpenses}`} />
        <StatTile label="Rimborsi" value={`EUR ${summary.reimbursements}`} />
        <StatTile label="Saldo econ." value={`EUR ${summary.economicBalance}`} tone="good" />
      </section>

      <section className="mt-6 rounded-md border border-border bg-white p-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Budget mensile</p>
            <p className="mt-1 text-sm text-zinc-500">Uso calcolato su spese meno rimborsi.</p>
          </div>
          <p className="text-right text-sm font-bold tabular-nums">{budget.usedPercentage}%</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(budget.usedPercentage, 100)}%` }} />
        </div>
        <div className="mt-3 flex justify-between text-sm tabular-nums text-zinc-600">
          <span>EUR {budget.used}</span>
          <span>EUR {budget.budgetAmount}</span>
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Conti</h2>
        {[
          { name: "Conto corrente", value: "EUR 2850.00", icon: Landmark },
          { name: "Carta credito", value: "EUR -410.00", icon: CreditCard },
          { name: "Fondo vacanze", value: "EUR 1200.00", icon: WalletCards }
        ].map((account) => {
          const Icon = account.icon;
          return (
            <div key={account.name} className="flex min-h-16 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
              <div className="flex items-center gap-3">
                <Icon aria-hidden className="h-5 w-5 text-primary" />
                <span className="font-medium">{account.name}</span>
              </div>
              <span className="font-semibold tabular-nums">{account.value}</span>
            </div>
          );
        })}
      </section>
    </main>
  );
}


