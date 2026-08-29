"use client";

import { Copy, Save, Trash2 } from "lucide-react";
import { useFormState } from "react-dom";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { FormMessage, PendingButton, SelectField, TextField } from "@/components/master-data/field-controls";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/validation";
import { copyPreviousMonthBudgetsAction, deactivateBudgetAction, saveBudgetAction, saveBudgetFormAction } from "@/lib/budgets/actions";
import type { BudgetReport, BudgetUsage } from "@/lib/calculations/budget";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import type { BudgetListItem } from "@/services/budgets/budget-service";

const initialState: FormState = { ok: false };

function categoryOptions(categoryTree: CategoryTreeItem[]) {
  return categoryTree.flatMap((macro) =>
    macro.categories.map((category) => ({
      value: category.id,
      label: `${macro.name} / ${category.name}`
    }))
  );
}

export function BudgetManager({
  budgets,
  categoryTree,
  monthStart,
  previousMonthStart,
  report
}: Readonly<{
  budgets: BudgetListItem[];
  categoryTree: CategoryTreeItem[];
  monthStart: string;
  previousMonthStart: string;
  report: BudgetReport;
}>) {
  const [state, action] = useFormState(saveBudgetAction, initialState);
  const macroOptions = categoryTree.map((macro) => ({ value: macro.id, label: macro.name }));
  const categories = categoryOptions(categoryTree);

  return (
    <div className="space-y-6">
      <FormMessage state={state} />
      {report.general ? (
        <BudgetCard budget={budgets.find((item) => item.id === report.general?.budget.id)} label={report.general.label} monthStart={monthStart} usage={report.general.usage} />
      ) : (
        <EmptyBudgetCard title="Budget totale non impostato" />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Dettaglio macro-categoria</h2>
        {report.macroCategories.length === 0 ? (
          <EmptyBudgetCard title="Nessun budget per macro-categoria" />
        ) : (
          report.macroCategories.map((item) => (
            <BudgetCard key={item.budget.id} budget={budgets.find((budget) => budget.id === item.budget.id)} label={item.label} monthStart={monthStart} usage={item.usage} />
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Dettaglio categoria</h2>
        {report.categories.length === 0 ? (
          <EmptyBudgetCard title="Nessun budget per categoria" />
        ) : (
          report.categories.map((item) => (
            <BudgetCard key={item.budget.id} budget={budgets.find((budget) => budget.id === item.budget.id)} label={item.label} monthStart={monthStart} usage={item.usage} />
          ))
        )}
      </section>

      <section className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
        <h2 className="text-lg font-semibold text-foreground">Crea o modifica budget</h2>
        <form action={action} className="space-y-4">
          <input type="hidden" name="month" value={monthStart} />
          <SelectField
            label="Ambito"
            name="scopeKind"
            defaultValue="general"
            options={[
              { value: "general", label: "Totale mese" },
              { value: "macro", label: "Macro-categoria" },
              { value: "category", label: "Categoria" }
            ]}
            errors={state.fieldErrors}
          />
          <SelectField label="Macro-categoria" name="macroCategoryId" defaultValue="" options={[{ value: "", label: "Nessuna" }, ...macroOptions]} errors={state.fieldErrors} />
          <SelectField label="Categoria" name="categoryId" defaultValue="" options={[{ value: "", label: "Nessuna" }, ...categories]} errors={state.fieldErrors} />
          <TextField label="Importo budget" name="amount" inputMode="decimal" errors={state.fieldErrors} />
          <PendingButton>
            <Save aria-hidden className="h-4 w-4" />
            Salva budget
          </PendingButton>
        </form>
      </section>

      <form action={copyPreviousMonthBudgetsAction}>
        <input type="hidden" name="previousMonth" value={previousMonthStart} />
        <input type="hidden" name="targetMonth" value={monthStart} />
        <Button type="submit" variant="secondary" className="w-full">
          <Copy aria-hidden className="h-4 w-4" />
          Copia budget dal mese precedente
        </Button>
      </form>
    </div>
  );
}

function BudgetCard({ budget, label, monthStart, usage }: Readonly<{ budget?: BudgetListItem; label: string; monthStart: string; usage: BudgetUsage }>) {
  return (
    <article className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{label}</h3>
          <p className="mt-1 text-sm text-zinc-600">
            EUR {usage.used} / EUR {usage.budgetAmount}
          </p>
        </div>
        <p className="text-right text-sm font-semibold text-zinc-500">{Math.round(usage.usedPercentage)}%</p>
      </div>
      <BudgetProgress usage={usage} />
      {budget && (
        <div className="space-y-3">
          <form action={saveBudgetFormAction} className="flex gap-2">
            <input type="hidden" name="id" value={budget.id} />
            <input type="hidden" name="month" value={monthStart} />
            <input type="hidden" name="scopeKind" value={budget.categoryId ? "category" : budget.macroCategoryId ? "macro" : "general"} />
            <input type="hidden" name="macroCategoryId" value={budget.macroCategoryId ?? ""} />
            <input type="hidden" name="categoryId" value={budget.categoryId ?? ""} />
            <input name="amount" defaultValue={budget.amount} inputMode="decimal" className="h-11 min-w-0 flex-1 rounded-md border border-border bg-white px-3 text-base" />
            <Button type="submit" variant="secondary">
              <Save aria-hidden className="h-4 w-4" />
            </Button>
          </form>
          <form action={deactivateBudgetAction}>
            <input type="hidden" name="id" value={budget.id} />
            <input type="hidden" name="month" value={monthStart} />
            <Button type="submit" variant="ghost" className="w-full text-red-700">
              <Trash2 aria-hidden className="h-4 w-4" />
              Disattiva
            </Button>
          </form>
        </div>
      )}
    </article>
  );
}

function EmptyBudgetCard({ title }: Readonly<{ title: string }>) {
  return (
    <div className="rounded-md border border-dashed border-border bg-white p-4">
      <p className="font-semibold text-foreground">{title}</p>
    </div>
  );
}
