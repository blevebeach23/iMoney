export function currentMonthRange(today = new Date()): { monthStart: string; monthEnd: string; today: string } {
  const year = today.getFullYear();
  const month = today.getMonth();

  return {
    monthStart: formatDate(new Date(year, month, 1)),
    monthEnd: formatDate(new Date(year, month + 1, 0)),
    today: formatDate(today)
  };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
