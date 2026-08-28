import Decimal from "decimal.js";

export type DecimalValue = Decimal.Value;

export function toDecimal(value: DecimalValue): Decimal {
  return new Decimal(value);
}

export function assertPositiveMoney(value: DecimalValue, fieldName = "amount"): Decimal {
  const decimal = toDecimal(value);

  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new Error(`${fieldName} must be a positive decimal value`);
  }

  return decimal;
}

export function formatMoney(value: DecimalValue): string {
  return toDecimal(value).toFixed(2);
}

export function sumMoney(values: DecimalValue[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(toDecimal(value)), new Decimal(0));
}
