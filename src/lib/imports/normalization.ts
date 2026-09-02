import type { MovementType } from "@/types/domain";
import { formatMoney, toDecimal } from "@/lib/calculations/money";

export function parseCsvDate(value: string): string | null {
  const trimmed = safeString(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const european = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (european) {
    return validDate(Number(european[3]), Number(european[2]), Number(european[1]));
  }

  return null;
}

export function parseCsvAmount(value: string): { amount: string; sign: 1 | -1 } | null {
  const compact = safeString(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/[€$£]/g, "");

  if (!compact || !/^[+-]?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?$/.test(compact)) {
    return null;
  }

  const commaIndex = compact.lastIndexOf(",");
  const dotIndex = compact.lastIndexOf(".");
  const normalized =
    commaIndex >= 0 && dotIndex >= 0
      ? commaIndex > dotIndex
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "")
      : compact.replace(",", ".");

  let decimal: ReturnType<typeof toDecimal>;
  try {
    decimal = toDecimal(normalized);
  } catch {
    return null;
  }

  if (!decimal.isFinite() || decimal.isZero()) {
    return null;
  }

  return {
    amount: formatMoney(decimal.abs()),
    sign: decimal.isNegative() ? -1 : 1
  };
}

export function inferMovementType(typeValue: string | undefined, amountSign: 1 | -1): MovementType {
  const normalized = normalizeText(typeValue ?? "");

  if (["rimborso", "reimbursement", "refund"].includes(normalized)) {
    return "reimbursement";
  }

  if (["spesa", "expense", "uscita", "debit"].includes(normalized)) {
    return "expense";
  }

  if (["entrata", "income", "credito", "credit"].includes(normalized)) {
    return "income";
  }

  return amountSign < 0 ? "expense" : "income";
}

export function normalizeDescription(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeText(value: string): string {
  try {
    return safeString(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  } catch {
    return safeString(value).trim().toLowerCase();
  }
}

export function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/[\s_-]+/g, "_");
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
