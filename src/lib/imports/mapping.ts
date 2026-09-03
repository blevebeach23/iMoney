import type { Account, Category, Fund, Movement, MovementType } from "@/types/domain";
import { matchAccountCsvValue, normalizeAccountValue } from "@/lib/accounts/matching";
import { inferMovementType, normalizeDescription, normalizeHeader, normalizeText, parseCsvAmount, parseCsvDate } from "./normalization";

export type ImportColumnKey = "date" | "description" | "amount" | "type" | "category" | "container" | "sourceAccount" | "destinationAccount" | "reimbursement" | "shared" | "notes";
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
  accountMappings?: Record<string, string>;
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
  transfer: {
    occurredOn: string;
    description: string;
    amount: string;
    fromAccountId: string | null;
    fromFundId: string | null;
    toAccountId: string | null;
    toFundId: string | null;
    sharedWithFamily: boolean;
    householdId: string | null;
  } | null;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  validRows: number;
  skippedRows: number;
  duplicateCandidates: number;
  accountMappingRequests: AccountMappingRequest[];
}

export interface AccountMappingRequest {
  normalizedValue: string;
  rawValue: string;
  reason: "missing" | "ambiguous";
}

const headerAliases: Record<ImportColumnKey, string[]> = {
  amount: ["importo", "amount", "valore"],
  category: ["categoria", "category"],
  container: ["conto", "account", "fondo", "account_fund"],
  date: ["data", "date"],
  description: ["descrizione", "description", "causale"],
  destinationAccount: ["destinazione", "conto_destinazione", "conto destinazione", "to_account", "account_to"],
  notes: ["note", "notes"],
  reimbursement: ["rimborso", "reimbursement"],
  shared: ["condiviso", "condiviso_famiglia", "shared", "shared_with_family"],
  sourceAccount: ["conto_origine", "conto origine", "origine", "from_account", "account_from"],
  type: ["tipo", "type"]
};

export function inferInitialColumns(headers: string[]): Partial<Record<ImportColumnKey, string>> {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const result: Partial<Record<ImportColumnKey, string>> = {};

  for (const [field, aliases] of Object.entries(headerAliases) as Array<[ImportColumnKey, string[]]>) {
    result[field] = aliases.map(normalizeHeader).map((alias) => normalizedHeaders.get(alias)).find(Boolean);
  }

  return result;
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
  const savedContainerMappings = input.mapping.accountMappings ?? {};
  const duplicateKeys = new Set(input.existingMovements.map((movement) => duplicateKey(movement)));
  const accountMappingRequests = new Map<string, AccountMappingRequest>();
  const previewRows = input.rows.map((row, index) =>
    mapImportRow(row, index + 2, input.mapping, input.accounts, input.funds, categoriesByName, categoryById, duplicateKeys, accountMappingRequests, savedContainerMappings)
  );

  return {
    rows: previewRows,
    validRows: previewRows.filter((row) => row.valid && !row.skipped).length,
    skippedRows: previewRows.filter((row) => row.skipped).length,
    duplicateCandidates: previewRows.filter((row) => row.duplicateCandidate).length,
    accountMappingRequests: [...accountMappingRequests.values()]
  };
}

export function duplicateKey(value: Pick<Movement, "occurredOn" | "amount" | "description" | "accountId" | "fundId">): string {
  return [value.occurredOn, value.amount, normalizeDescription(value.description), value.accountId ? `account:${value.accountId}` : `fund:${value.fundId}`].join("|");
}

function mapImportRow(
  row: Record<string, string>,
  rowNumber: number,
  mapping: ImportMapping,
  accounts: Account[],
  funds: Fund[],
  categoriesByName: Map<string, Category>,
  categoryById: Map<string, Category>,
  duplicateKeys: Set<string>,
  accountMappingRequests: Map<string, AccountMappingRequest>,
  savedContainerMappings: Record<string, string>
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

  const rawType = readMapped(row, mapping.columns.type);
  const normalizedType = normalizeText(rawType);
  const isTransfer = normalizedType === "trasferimento" || normalizedType === "transfer";
  const containerValue = readMapped(row, mapping.columns.container);
  const sourceAccountValue = readMapped(row, mapping.columns.sourceAccount) || (isTransfer ? containerValue : "");
  const destinationAccountValue = readMapped(row, mapping.columns.destinationAccount);
  const transferContainers = resolveTransferContainers(sourceAccountValue, destinationAccountValue, accounts, funds, savedContainerMappings, accountMappingRequests);
  const sharedWithFamily = booleanFromCsv(readMapped(row, mapping.columns.shared), mapping.defaults.sharedWithFamily);

  if (isTransfer || sourceAccountValue || destinationAccountValue) {
    if (!sourceAccountValue || !destinationAccountValue) {
      errors.push("Origine e destinazione obbligatorie per trasferimento");
    }
    if (!transferContainers.from.containerId || !transferContainers.to.containerId) {
      errors.push("Mappatura conto trasferimento mancante");
    }
    if (transferContainers.from.containerId && transferContainers.from.containerId === transferContainers.to.containerId) {
      errors.push("Origine e destinazione devono essere diverse");
    }

    const transfer = date && amount && !errors.length && transferContainers.from.containerId && transferContainers.to.containerId
      ? {
          occurredOn: date,
          description,
          amount: amount.amount,
          fromAccountId: transferContainers.from.accountId,
          fromFundId: transferContainers.from.fundId,
          toAccountId: transferContainers.to.accountId,
          toFundId: transferContainers.to.fundId,
          sharedWithFamily,
          householdId: sharedWithFamily ? mapping.defaults.householdId : null
        }
      : null;

    return {
      rowNumber,
      valid: Boolean(transfer),
      skipped: false,
      errors,
      duplicateCandidate: false,
      raw: row,
      movement: null,
      transfer
    };
  }

  const type = amount ? inferMovementType(rawType || mapping.defaults.type, amount.sign) : mapping.defaults.type;
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

  const resolvedContainerId = containerValue ? resolveContainerId(containerValue, accounts, funds, savedContainerMappings, accountMappingRequests) : null;
  const containerId = containerValue ? resolvedContainerId ?? "" : mapping.defaults.containerId;
  const container = parseContainer(containerId);
  const isReimbursement = booleanFromCsv(readMapped(row, mapping.columns.reimbursement)) || type === "reimbursement";

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
    movement,
    transfer: null
  };
}

function resolveContainerId(
  rawValue: string,
  accounts: Account[],
  funds: Fund[],
  savedContainerMappings: Record<string, string>,
  accountMappingRequests: Map<string, AccountMappingRequest>
): string | null {
  const normalized = normalizeAccountValue(rawValue);
  const saved = savedContainerMappings[normalized];
  if (saved) {
    const savedContainer = normalizeSavedContainerId(saved, accounts, funds);
    if (savedContainer) {
      return savedContainer;
    }
  }

  const match = matchAccountCsvValue(rawValue, accounts);
  if (match.accountId) {
    return `account:${match.accountId}`;
  }

  const fundMatches = funds.filter((fund) => fundSearchKeys(fund).includes(normalized));
  const uniqueFundIds = [...new Set(fundMatches.map((fund) => fund.id))];
  if (uniqueFundIds.length === 1) {
    return `fund:${uniqueFundIds[0]}`;
  }

  addAccountMappingRequest(rawValue, match.ambiguous || uniqueFundIds.length > 1 ? "ambiguous" : "missing", accountMappingRequests);
  return null;
}

function resolveTransferContainers(
  sourceValue: string,
  destinationValue: string,
  accounts: Account[],
  funds: Fund[],
  savedContainerMappings: Record<string, string>,
  accountMappingRequests: Map<string, AccountMappingRequest>
) {
  const fromContainerId = sourceValue ? resolveContainerId(sourceValue, accounts, funds, savedContainerMappings, accountMappingRequests) : null;
  const toContainerId = destinationValue ? resolveContainerId(destinationValue, accounts, funds, savedContainerMappings, accountMappingRequests) : null;

  return {
    from: parseContainerWithId(fromContainerId ?? ""),
    to: parseContainerWithId(toContainerId ?? "")
  };
}

function addAccountMappingRequest(rawValue: string, reason: AccountMappingRequest["reason"], requests: Map<string, AccountMappingRequest>) {
  const normalizedValue = normalizeAccountValue(rawValue);
  if (!normalizedValue || requests.has(normalizedValue)) {
    return;
  }

  requests.set(normalizedValue, { normalizedValue, rawValue: rawValue.trim(), reason });
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

function parseContainerWithId(containerId: string): { accountId: string | null; fundId: string | null; containerId: string | null } {
  const parsed = parseContainer(containerId);
  return {
    ...parsed,
    containerId: parsed.accountId || parsed.fundId ? containerId : null
  };
}

function normalizeSavedContainerId(value: string, accounts: Account[], funds: Fund[]): string | null {
  if (value.startsWith("account:")) {
    const accountId = value.slice("account:".length);
    return accounts.some((account) => account.id === accountId) ? value : null;
  }

  if (value.startsWith("fund:")) {
    const fundId = value.slice("fund:".length);
    return funds.some((fund) => fund.id === fundId) ? value : null;
  }

  return accounts.some((account) => account.id === value) ? `account:${value}` : null;
}

function fundSearchKeys(fund: Fund): string[] {
  return [fund.name, `Fondo ${fund.name}`, `Fondo / ${fund.name}`].map(normalizeAccountValue);
}

function booleanFromCsv(value: string, fallback = false): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return fallback;
  }

  return ["1", "true", "si", "yes", "y"].includes(normalized);
}
