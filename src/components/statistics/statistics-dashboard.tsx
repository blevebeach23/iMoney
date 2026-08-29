"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import type { StatisticsReport } from "@/lib/calculations/statistics";
import type { ActiveHouseholdOption } from "@/services/households/household-service";

interface StatisticsDashboardProps {
  report: StatisticsReport;
  households: ActiveHouseholdOption[];
  selectedHouseholdId: string | null;
}

const currencyFormatter = new Intl.NumberFormat("it-IT", {
  currency: "EUR",
  maximumFractionDigits: 0,
  style: "currency"
});

export function StatisticsDashboard({ households, report, selectedHouseholdId }: Readonly<StatisticsDashboardProps>) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-5">
        <p className="text-sm font-semibold text-primary">Statistiche</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Analisi</h1>
      </header>

      <StatisticsFilters report={report} households={households} selectedHouseholdId={selectedHouseholdId} />

      <section className="mt-6 grid grid-cols-2 gap-3">
        <StatCard label="Entrate" value={report.summary.income} tone="good" />
        <StatCard label="Spese nette" value={report.summary.netExpenses} />
        <StatCard label="Rimborsi" value={report.summary.reimbursements} tone="info" />
        <StatCard label="Bilancio" value={report.summary.economicBalance} tone={Number(report.summary.economicBalance) >= 0 ? "good" : "bad"} />
      </section>

      <ChartSection title="Entrate vs spese nette">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={report.monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => currencyFormatter.format(Number(value))} width={48} />
            <Tooltip formatter={(value) => currencyFormatter.format(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Entrate" fill="#059669" radius={[4, 4, 0, 0]} />
            <Bar dataKey="netExpenses" name="Spese nette" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>

      <ChartSection title="Andamento mensile">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={report.monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => currencyFormatter.format(Number(value))} width={48} />
            <Tooltip formatter={(value) => currencyFormatter.format(Number(value))} />
            <Line type="monotone" dataKey="economicBalance" name="Bilancio" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartSection>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Spese per macro-categoria</h2>
        {report.macroCategories.length === 0 ? (
          <EmptyState text="Nessuna spesa nel periodo selezionato." />
        ) : (
          report.macroCategories.map((macro) => (
            <Link
              key={macro.macroCategoryId}
              href={`/movements?macroCategoryId=${macro.macroCategoryId}`}
              className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel"
            >
              <span className="font-medium">{macro.macroCategoryName}</span>
              <span className="font-semibold tabular-nums">EUR {macro.netExpenses}</span>
            </Link>
          ))
        )}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Spese per categoria</h2>
        {report.categories.length === 0 ? (
          <EmptyState text="Nessuna categoria nel periodo selezionato." />
        ) : (
          report.categories.map((category) => (
            <Link
              key={category.categoryId}
              href={`/movements?categoryId=${category.categoryId}`}
              className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel"
            >
              <span>
                <span className="block font-medium">{category.categoryName}</span>
                <span className="block text-xs font-semibold text-zinc-500">{category.macroCategoryName}</span>
              </span>
              <span className="font-semibold tabular-nums">EUR {category.netExpenses}</span>
            </Link>
          ))
        )}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Rimborsi</h2>
        {report.reimbursements.length === 0 ? (
          <EmptyState text="Nessun rimborso nel periodo." />
        ) : (
          report.reimbursements.map((movement) => (
            <Link key={movement.id} href={`/movements/${movement.id}`} className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
              <span>
                <span className="block font-medium">{movement.description}</span>
                <span className="block text-xs font-semibold text-zinc-500">{movement.occurredOn}</span>
              </span>
              <span className="font-semibold tabular-nums text-sky-700">EUR {movement.amount}</span>
            </Link>
          ))
        )}
      </section>

      <section className="mt-6 rounded-md border border-border bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Budget</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {report.budgetReport.general
                ? `EUR ${report.budgetReport.general.usage.used} / EUR ${report.budgetReport.general.usage.budgetAmount}`
                : "Budget mensile non impostato"}
            </p>
          </div>
          {report.budgetReport.general && (
            <span className="text-sm font-semibold text-primary">{Math.round(report.budgetReport.general.usage.usedPercentage)}%</span>
          )}
        </div>
        {report.budgetReport.general && (
          <div className="mt-4">
            <BudgetProgress usage={report.budgetReport.general.usage} />
          </div>
        )}
      </section>

      <ChartSection title="Confronto anni">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={report.yearComparison}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => currencyFormatter.format(Number(value))} width={48} />
            <Tooltip formatter={(value) => currencyFormatter.format(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Entrate" fill="#059669" radius={[4, 4, 0, 0]} />
            <Bar dataKey="netExpenses" name="Spese nette" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>

      <section className="mt-6 grid grid-cols-3 gap-2">
        {report.monthlyTrend.map((point) => (
          <Link key={point.month} href={`/months/${point.month}`} className="rounded-md border border-border bg-white p-3 text-center text-sm font-semibold shadow-panel">
            {point.label}
          </Link>
        ))}
      </section>
    </main>
  );
}

function StatisticsFilters({
  households,
  report,
  selectedHouseholdId
}: Readonly<{
  households: ActiveHouseholdOption[];
  report: StatisticsReport;
  selectedHouseholdId: string | null;
}>) {
  return (
    <form className="space-y-3 rounded-md border border-border bg-white p-4 shadow-panel">
      <div className="grid grid-cols-2 gap-2">
        <label className="min-h-11">
          <input type="radio" name="scope" value="personal" defaultChecked={report.scope === "personal"} className="peer sr-only" />
          <span className="flex min-h-11 items-center justify-center rounded-md border border-border text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white">
            Personale
          </span>
        </label>
        <label className="min-h-11">
          <input type="radio" name="scope" value="family" defaultChecked={report.scope === "family"} className="peer sr-only" />
          <span className="flex min-h-11 items-center justify-center rounded-md border border-border text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white">
            Famiglia
          </span>
        </label>
      </div>
      {households.length > 0 && (
        <select name="householdId" defaultValue={selectedHouseholdId ?? ""} className="h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
          {households.map((household) => (
            <option key={household.id} value={household.id}>
              {household.name}
            </option>
          ))}
        </select>
      )}
      <select name="period" defaultValue={report.periodKind} className="h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
        <option value="month">Mese</option>
        <option value="year">Anno</option>
        <option value="custom">Intervallo</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input name="month" type="month" defaultValue={report.selectedMonth} className="h-11 rounded-md border border-border bg-white px-3 text-sm" />
        <input name="year" type="number" min="2000" max="2100" defaultValue={report.selectedYear} className="h-11 rounded-md border border-border bg-white px-3 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="start" type="date" defaultValue={report.startDate} className="h-11 rounded-md border border-border bg-white px-3 text-sm" />
        <input name="end" type="date" defaultValue={report.endDate} className="h-11 rounded-md border border-border bg-white px-3 text-sm" />
      </div>
      <button type="submit" className="min-h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-white">
        Applica
      </button>
    </form>
  );
}

function ChartSection({ children, title }: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section className="mt-6 rounded-md border border-border bg-white p-4 shadow-panel">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function StatCard({ label, tone = "neutral", value }: Readonly<{ label: string; tone?: "bad" | "good" | "info" | "neutral"; value: string }>) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "info" ? "text-sky-700" : "text-foreground";

  return (
    <div className="rounded-md border border-border bg-white p-4 shadow-panel">
      <p className="text-sm font-semibold text-zinc-500">{label}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${toneClass}`}>EUR {value}</p>
    </div>
  );
}

function EmptyState({ text }: Readonly<{ text: string }>) {
  return <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">{text}</p>;
}
