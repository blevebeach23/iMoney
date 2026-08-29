import { CreditCard, Landmark, Plus, WalletCards } from "lucide-react";
import Link from "next/link";
import type { MacroCategoryAggregate } from "@/lib/calculations/category-aggregates";
import type { FinancialBalances } from "@/lib/calculations/balances";
import { calculateMonthlySummary } from "@/lib/calculations/monthly-summary";
import type { MonthlySummary, Movement } from "@/types/domain";
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
    notes: "",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
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
    notes: "",
    isSharedWithHousehold: true,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
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
    notes: "",
    isSharedWithHousehold: true,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
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
    notes: "",
    isSharedWithHousehold: true,
    reimbursementForMovementId: "3",
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null
  }
];

interface DashboardPreviewProps {
  balances?: FinancialBalances;
  macroCategoryAggregates?: MacroCategoryAggregate[];
  monthLabel?: string;
  summary?: MonthlySummary;
}

export function DashboardPreview({ balances, macroCategoryAggregates = [], monthLabel = "Agosto 2026", summary }: DashboardPreviewProps) {
  const monthlySummary = summary ?? calculateMonthlySummary(sampleMovements);
  const accountRows = balances
    ? [
        ...balances.cash.map((item) => ({ name: item.name, value: `EUR ${item.balance}`, icon: Landmark })),
        ...balances.bank.map((item) => ({ name: item.name, value: `EUR ${item.balance}`, icon: Landmark })),
        ...balances.funds.map((item) => ({ name: item.name, value: `EUR ${item.balance}`, icon: WalletCards })),
        ...balances.creditCardsDue.map((item) => ({ name: `${item.name} da addebitare`, value: `EUR ${item.due}`, icon: CreditCard })),
        ...balances.forecastMonthEnd.map((item) => ({ name: `${item.name} fine mese`, value: `EUR ${item.balance}`, icon: WalletCards }))
      ]
    : [
        { name: "Conto corrente", value: "EUR 2850.00", icon: Landmark },
        { name: "Carta credito", value: "EUR -410.00", icon: CreditCard },
        { name: "Fondo vacanze", value: "EUR 1200.00", icon: WalletCards }
      ];

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">{monthLabel}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-foreground">Rendiconto</h1>
        </div>
        <Link href="/movements/new" className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-3" aria-label="Aggiungi movimento">
          <Plus aria-hidden className="h-5 w-5" />
        </Link>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <StatTile label="Entrate" value={`EUR ${monthlySummary.income}`} tone="good" />
        <StatTile label="Spese lorde" value={`EUR ${monthlySummary.grossExpenses}`} />
        <StatTile label="Rimborsi" value={`EUR ${monthlySummary.reimbursements}`} />
        <StatTile label="Bilancio" value={`EUR ${monthlySummary.economicBalance}`} tone="good" />
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Saldi</h2>
        {accountRows.map((account) => {
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

      {macroCategoryAggregates.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Macro-categorie</h2>
          {macroCategoryAggregates.slice(0, 5).map((macro) => (
            <div key={macro.macroCategoryId} className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
              <span className="font-medium">{macro.macroCategoryName}</span>
              <span className="font-semibold tabular-nums">EUR {macro.netExpenses}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}


