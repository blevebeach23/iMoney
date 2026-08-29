import type { FixedExpense } from "@/types/domain";

export interface FixedExpenseOccurrence {
  fixedExpenseId: string;
  occurredOn: string;
}

export function monthIsActive(rule: Pick<FixedExpense, "activeMonths">, month: number): boolean {
  return rule.activeMonths.includes(month);
}

export function occurrenceDateForMonth(year: number, month: number, dayOfMonth: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(dayOfMonth, lastDay);

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isOccurrenceInDateRange(rule: Pick<FixedExpense, "startsOn" | "endsOn">, occurredOn: string): boolean {
  return occurredOn >= rule.startsOn && (!rule.endsOn || occurredOn <= rule.endsOn);
}

export function buildFixedExpenseOccurrences(rule: FixedExpense, fromMonthStart: string, toMonthStart: string): FixedExpenseOccurrence[] {
  const from = new Date(`${fromMonthStart}T00:00:00`);
  const to = new Date(`${toMonthStart}T00:00:00`);
  const occurrences: FixedExpenseOccurrence[] = [];

  for (let cursor = new Date(from.getFullYear(), from.getMonth(), 1); cursor <= to; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const month = cursor.getMonth() + 1;
    if (!monthIsActive(rule, month)) {
      continue;
    }

    const occurredOn = occurrenceDateForMonth(cursor.getFullYear(), month, rule.dayOfMonth);
    if (isOccurrenceInDateRange(rule, occurredOn)) {
      occurrences.push({ fixedExpenseId: rule.id, occurredOn });
    }
  }

  return occurrences;
}

export function excludeExistingOccurrences(
  occurrences: FixedExpenseOccurrence[],
  existing: Array<{ fixedExpenseId: string | null | undefined; occurredOn: string }>
): FixedExpenseOccurrence[] {
  const existingKeys = new Set(existing.filter((item) => item.fixedExpenseId).map((item) => `${item.fixedExpenseId}:${item.occurredOn}`));

  return occurrences.filter((occurrence) => !existingKeys.has(`${occurrence.fixedExpenseId}:${occurrence.occurredOn}`));
}
