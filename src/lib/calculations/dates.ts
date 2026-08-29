export function currentMonthRange(today = new Date()): { monthStart: string; monthEnd: string; today: string } {
  const year = today.getFullYear();
  const month = today.getMonth();

  return {
    monthStart: formatDate(new Date(year, month, 1)),
    monthEnd: formatDate(new Date(year, month + 1, 0)),
    today: formatDate(today)
  };
}

export function monthRangeFromYearMonth(yearMonth: string, today = new Date()): { monthStart: string; monthEnd: string; today: string; yearMonth: string } {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return { ...currentMonthRange(today), yearMonth: formatYearMonth(today) };
  }

  const [year, month] = yearMonth.split("-").map(Number);
  const monthIndex = month - 1;

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return { ...currentMonthRange(today), yearMonth: formatYearMonth(today) };
  }

  return {
    monthStart: formatDate(new Date(year, monthIndex, 1)),
    monthEnd: formatDate(new Date(year, monthIndex + 1, 0)),
    today: formatDate(today),
    yearMonth
  };
}

export function formatMonthLabel(monthStart: string): string {
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${monthStart}T00:00:00`));
}

export function previousMonthStart(monthStart: string): string {
  const date = new Date(`${monthStart}T00:00:00`);
  return formatDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

export function formatYearMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
