import type { Account, Category, Fund, Movement, MovementType } from "@/types/domain";
import { normalizeDescription, normalizeText, parseCsvAmount, parseCsvDate, inferMovementType } from "./normalization";

export type ImportColumnKey = "date" | "description" | "amount" | "type" | "category" | "container" | "reimbursement" | "shared" | "notes";
export type MissingCategoryStrategy = "default" | "create" | "skip";

export interface ImportMapping {
  columns: Partial<Record<ImportColumnKey, string>>;
  defaults: {
    categoryId: string;
    containerId: string;
    type: MovementType;
    sharedWithFamily: boolean;
    householdId: string | null;
    notes: string;
    macroCategoryIdForNew?: string;
  };
  missingCategoryStrategy: MissingCategoryStrategy;
}

export interface ImportPreviewRow {
  rowNumber: number;
  valid: boolean;
  skipped: boolean;
  errors: string[];
  duplicateCandidate: boolean;
  raw: Record<string, string>;
  movement: {
    occurredOn: string;
    description: string;
    amount: string;
    type: MovementType;
    categoryId: string;
    categoryName: string;
    containerId: string;
    accountId: string | null;
    fundId: string | null;
    isReimbursement: boolean;
    sharedWithFamily: boolean;
    householdId: string | null;
    notes: string;
    createCategoryName?: string;
  } | null;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  validRows: number;
  skippedRows: number;
  duplicateCandidates: number;
}

export function buildImportPreview(input: {
  rows: Array<Record<string, string>>;
  mapping: ImportMapping;
  categories: Category[];
  accounts: Account[];
  funds: Fund[];
  existingMovements: Movement[];
}): ImportPreview {
  const categoriesByName = new Map(input.categories.map((category) => [normalizeText(category.name), category]));
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const containerByName = new Map([
    ...input.accounts.map((account) => [normalizeText(account.name), `account:${account.id}`] as const),
    ...input.funds.map((fund) => [normalizeText(fund.name), `fund:${fund.id}`] as const)
  ]);
  const duplicateKeys = new Set(input.existingMovements.map((movement) => duplicateKey(movement)));
  const previewRows = input.rows.map((row, index) => mapImportRow(row, index + 2, input.mapping, categoriesByName, categoryById, containerByName, duplicateKeys));

  return {
    rows: previewRows,
    validRows: previewRows.filter((row) => row.valid && !row.skipped).length,
    skippedRows: previewRows.filter((row) => row.skipped).length,
    duplicateCandidates: previewRows.filter((row) => row.duplicateCandidate).length
  };
}

export function duplicateKey(value: Pick<Movement, "occurredOn" | "amount" | "description" | "accountId" | "fundId">): string {
  return [value.occurredOn, value.amount, normalizeDescription(value.description), value.accountId ? `account:${value.accountId}` : `fund:${value.fundId}`].join("|");
}

function mapImportRow(
  row: Record<string, string>,
  rowNumber: number,
  mapping: ImportMapping,
  categoriesByName: Map<string, Category>,
  categoryById: Map<string, Category>,
  containerByName: Map<string, string>,
  duplicateKeys: Set<string>
): ImportPreviewRow {
  const errors: string[] = [];
  const date = parseCsvDate(readMapped(row, mapping.columns.date));
  const amount = parseCsvAmount(readMapped(row, mapping.columns.amount));
  const description = readMapped(row, mapping.columns.description) || "Movimento importato";
  const notes = readMapped(row, mapping.columns.notes) || mapping.defaults.notes;

  if (!date) {
    errors.push("Data non valida");
  }
  if (!amount) {
    errors.push("Importo non valido");
  }

  const type = amount ? inferMovementType(readMapped(row, mapping.columns.type) || mapping.defaults.type, amount.sign) : mapping.defaults.type;
  const categoryValue = readMapped(row, mapping.columns.category);
  const category = categoryValue ? categoriesByName.get(normalizeText(categoryValue)) : categoryById.get(mapping.defaults.categoryId);
  let categoryId = category?.id ?? mapping.defaults.categoryId;
  let categoryName = category?.name ?? "Categoria";
  let createCategoryName: string | undefined;
  let skipped = false;

  if (categoryValue && !category) {
    if (mapping.missingCategoryStrategy === "skip") {
      skipped = true;
    } else if (mapping.missingCategoryStrategy === "create") {
      createCategoryName = categoryValue.trim();
      categoryName = createCategoryName;
    } else {
      categoryName = categoryById.get(mapping.defaults.categoryId)?.name ?? "Categoria default";
    }
  }

  const containerValue = readMapped(row, mapping.columns.container);
  const containerId = containerValue ? containerByName.get(normalizeText(containerValue)) ?? mapping.defaults.containerId : mapping.defaults.containerId;
  const container = parseContainer(containerId);
  const isReimbursement = booleanFromCsv(readMapped(row, mapping.columns.reimbursement)) || type === "reimbursement";
  const sharedWithFamily = booleanFromCsv(readMapped(row, mapping.columns.shared), mapping.defaults.sharedWithFamily);

  if (!categoryId && !createCategoryName) {
    errors.push("Categoria mancante");
  }
  if (!container.accountId && !container.fundId) {
    errors.push("Conto o fondo mancante");
  }

  const movement = date && amount && !skipped && errors.length === 0
    ? {
        occurredOn: date,
        description,
        amount: amount.amount,
        type,
        categoryId,
        categoryName,
        containerId,
        accountId: container.accountId,
        fundId: container.fundId,
        isReimbursement,
        sharedWithFamily,
        householdId: sharedWithFamily ? mapping.defaults.householdId : null,
        notes,
        createCategoryName
      }
    : null;

  return {
    rowNumber,
    valid: Boolean(movement),
    skipped,
    errors,
    duplicateCandidate: movement ? duplicateKeys.has(duplicateKey(movement)) : false,
    raw: row,
    movement
  };
}

function readMapped(row: Record<string, string>, column: string | undefined): string {
  return column ? row[column] ?? "" : "";
}

function parseContainer(containerId: string): { accountId: string | null; fundId: string | null } {
  const [kind, id] = containerId.split(":");

  if (kind === "account" && id) {
    return { accountId: id, fundId: null };
  }

  if (kind === "fund" && id) {
    return { accountId: null, fundId: id };
  }

  return { accountId: null, fundId: null };
}

function booleanFromCsv(value: string, fallback = false): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return fallback;
  }

  return ["1", "true", "si", "yes", "y"].includes(normalized);
}
