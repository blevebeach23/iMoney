import type { MonthlySummary, Movement } from "@/types/domain";
import { formatMoney, sumMoney } from "./money";

function isActiveMovement(movement: Movement): boolean {
  return movement.deletedAt === null;
}

export function calculateMonthlySummary(movements: Movement[]): MonthlySummary {
  const activeMovements = movements.filter(isActiveMovement);

  const income = sumMoney(
    activeMovements.filter((movement) => movement.type === "income").map((movement) => movement.amount)
  );
  const grossExpenses = sumMoney(
    activeMovements.filter((movement) => movement.type === "expense").map((movement) => movement.amount)
  );
  const reimbursements = sumMoney(
    activeMovements.filter((movement) => movement.type === "reimbursement").map((movement) => movement.amount)
  );
  const netExpenses = grossExpenses.minus(reimbursements);
  const economicBalance = income.minus(netExpenses);

  return {
    income: formatMoney(income),
    grossExpenses: formatMoney(grossExpenses),
    reimbursements: formatMoney(reimbursements),
    netExpenses: formatMoney(netExpenses),
    economicBalance: formatMoney(economicBalance)
  };
}
