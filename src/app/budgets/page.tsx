import { redirect } from "next/navigation";
import { BudgetMonthContent } from "@/app/budgets/budget-month-content";
import { formatYearMonth } from "@/lib/calculations/dates";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function BudgetsPage({ searchParams }: Readonly<{ searchParams: Record<string, string | string[] | undefined> }>) {
  const month = firstParam(searchParams.month);

  if (month) {
    const [year, monthNumber] = month.split("-");
    redirect(`/budgets/${year}/${monthNumber}`);
  }

  return <BudgetMonthContent yearMonth={formatYearMonth(new Date())} />;
}
