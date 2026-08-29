import type { BudgetUsage } from "@/lib/calculations/budget";

function progressTone(percentage: number) {
  if (percentage >= 100) {
    return "bg-red-600";
  }

  if (percentage >= 80) {
    return "bg-amber-500";
  }

  return "bg-emerald-500";
}

export function BudgetProgress({ usage }: Readonly<{ usage: BudgetUsage }>) {
  const width = `${Math.min(Math.max(usage.usedPercentage, 0), 100)}%`;

  return (
    <div className="space-y-2">
      <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full rounded-full ${progressTone(usage.usedPercentage)}`} style={{ width }} />
      </div>
      <div className="flex items-center justify-between text-xs font-semibold text-zinc-500">
        <span>{Math.round(usage.usedPercentage)}%</span>
        <span>Residuo EUR {usage.remaining}</span>
      </div>
    </div>
  );
}
