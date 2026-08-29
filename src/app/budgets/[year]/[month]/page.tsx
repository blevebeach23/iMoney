import { BudgetMonthContent } from "@/app/budgets/budget-month-content";

export const dynamic = "force-dynamic";

export default function BudgetMonthPage({ params }: Readonly<{ params: { year: string; month: string } }>) {
  return <BudgetMonthContent yearMonth={`${params.year}-${params.month}`} />;
}
