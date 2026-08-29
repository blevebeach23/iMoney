import type { Movement, MonthlySummary } from "@/types/domain";
import { calculateMonthlySummary } from "./monthly-summary";
import { formatMoney, toDecimal } from "./money";

export interface AnnualTrendPoint {
  month: string;
  label: string;
  summary: MonthlySummary;
  netFlow: string;
  barValue: number;
}

export function calculateAnnualTrend(movements: Movement[], year: number): AnnualTrendPoint[] {
  const points = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const monthMovements = movements.filter((movement) => movement.occurredOn.startsWith(month));
    const summary = calculateMonthlySummary(monthMovements);
    const netFlow = toDecimal(summary.economicBalance);

    return {
      month,
      label: new Intl.DateTimeFormat("it-IT", { month: "short" }).format(new Date(year, index, 1)),
      summary,
      netFlow: formatMoney(netFlow),
      barValue: netFlow.toNumber()
    };
  });

  const maxAbs = Math.max(1, ...points.map((point) => Math.abs(point.barValue)));

  return points.map((point) => ({
    ...point,
    barValue: Math.round((Math.abs(point.barValue) / maxAbs) * 100)
  }));
}
