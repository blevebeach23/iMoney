import { describe, expect, it } from "vitest";
import { parseCsv, csvRowsToObjects } from "@/lib/imports/csv";
import { buildImportPreview } from "@/lib/imports/mapping";
import { inferMovementType, parseCsvAmount, parseCsvDate } from "@/lib/imports/normalization";
import type { Account, Category, Fund, Movement } from "@/types/domain";

const categories: Category[] = [
  {
    id: "category-food",
    macroCategoryId: "macro-living",
    name: "Spesa",
    sortOrder: 1,
    deletedAt: null
  },
  {
    id: "category-other",
    macroCategoryId: "macro-other",
    name: "Altro",
    sortOrder: 2,
    deletedAt: null
  }
];

const accounts: Account[] = [
  {
    id: "account-bank",
    ownerUserId: "user-1",
    name: "Conto corrente",
    type: "bank",
    openingBalance: "0.00",
    cachedBalance: "0.00",
    cachedAt: null,
    deletedAt: null
  }
];

const funds: Fund[] = [
  {
    id: "fund-holiday",
    ownerUserId: "user-1",
    name: "Vacanze",
    type: "holiday",
    openingBalance: "0.00",
    openingBalanceDate: "2026-01-01",
    cachedBalance: "0.00",
    cachedAt: null,
    targetAmount: null,
    targetDate: null,
    deletedAt: null
  }
];

function existingMovement(partial: Partial<Movement> = {}): Movement {
  return {
    id: "movement-1",
    ownerUserId: "user-1",
    householdId: null,
    accountId: "account-bank",
    fundId: null,
    categoryId: "category-food",
    type: "expense",
    amount: "12.50",
    occurredOn: "2026-08-15",
    description: "Supermercato",
    notes: "",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null,
    importBatchId: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    ...partial
  };
}

describe("CSV import parsing", () => {
  it("parses supported date formats", () => {
    expect(parseCsvDate("15/08/2026")).toBe("2026-08-15");
    expect(parseCsvDate("15-08-2026")).toBe("2026-08-15");
    expect(parseCsvDate("2026-08-15")).toBe("2026-08-15");
    expect(parseCsvDate("31/02/2026")).toBeNull();
  });

  it("parses signed amounts and keeps movement amount positive", () => {
    expect(parseCsvAmount("-12,50")).toEqual({ amount: "12.50", sign: -1 });
    expect(parseCsvAmount("12.50")).toEqual({ amount: "12.50", sign: 1 });
    expect(parseCsvAmount("1.234,56")).toEqual({ amount: "1234.56", sign: 1 });
    expect(inferMovementType("", -1)).toBe("expense");
    expect(inferMovementType("", 1)).toBe("income");
  });

  it("maps CSV rows from selected columns", () => {
    const parsed = parseCsv("Data;Descrizione;Importo;Categoria;Conto\n15/08/2026;Supermercato;-12,50;Spesa;Conto corrente");
    const preview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: {
        columns: {
          date: "Data",
          description: "Descrizione",
          amount: "Importo",
          category: "Categoria",
          container: "Conto"
        },
        defaults: {
          categoryId: "category-other",
          containerId: "account:account-bank",
          type: "expense",
          sharedWithFamily: false,
          householdId: null,
          notes: ""
        },
        missingCategoryStrategy: "default"
      },
      categories,
      accounts,
      funds,
      existingMovements: []
    });

    expect(preview.validRows).toBe(1);
    expect(preview.rows[0]?.movement).toMatchObject({
      occurredOn: "2026-08-15",
      description: "Supermercato",
      amount: "12.50",
      type: "expense",
      categoryId: "category-food",
      accountId: "account-bank"
    });
  });

  it("detects duplicate candidates without discarding them", () => {
    const parsed = parseCsv("data,descrizione,importo\n2026-08-15, supermercato ,-12.50");
    const preview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: {
        columns: { date: "data", description: "descrizione", amount: "importo" },
        defaults: {
          categoryId: "category-food",
          containerId: "account:account-bank",
          type: "expense",
          sharedWithFamily: false,
          householdId: null,
          notes: ""
        },
        missingCategoryStrategy: "default"
      },
      categories,
      accounts,
      funds,
      existingMovements: [existingMovement()]
    });

    expect(preview.duplicateCandidates).toBe(1);
    expect(preview.rows[0]?.valid).toBe(true);
  });

  it("supports missing category strategies", () => {
    const parsed = parseCsv("data,descrizione,importo,categoria\n2026-08-15,Parcheggio,-5.00,Auto");
    const baseMapping = {
      columns: { date: "data", description: "descrizione", amount: "importo", category: "categoria" },
      defaults: {
        categoryId: "category-other",
        containerId: "account:account-bank",
        type: "expense" as const,
        sharedWithFamily: false,
        householdId: null,
        notes: "",
        macroCategoryIdForNew: "macro-other"
      }
    };

    const createPreview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: { ...baseMapping, missingCategoryStrategy: "create" },
      categories,
      accounts,
      funds,
      existingMovements: []
    });
    const skipPreview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: { ...baseMapping, missingCategoryStrategy: "skip" },
      categories,
      accounts,
      funds,
      existingMovements: []
    });

    expect(createPreview.rows[0]?.movement?.createCategoryName).toBe("Auto");
    expect(skipPreview.skippedRows).toBe(1);
  });
});
