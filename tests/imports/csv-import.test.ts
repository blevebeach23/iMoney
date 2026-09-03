import { describe, expect, it } from "vitest";
import { parseCsv, csvRowsToObjects } from "@/lib/imports/csv";
import { buildImportPreview, inferInitialColumns } from "@/lib/imports/mapping";
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
  },
  {
    id: "account-card",
    ownerUserId: "user-1",
    name: "Visa",
    type: "credit_card",
    openingBalance: "0.00",
    cachedBalance: "0.00",
    cachedAt: null,
    deletedAt: null
  },
  {
    id: "account-cash",
    ownerUserId: "user-1",
    name: "Portafoglio",
    type: "cash",
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
    householdId: null,
    name: "Vacanze",
    type: "holiday",
    openingBalance: "0.00",
    openingBalanceDate: "2026-01-01",
    cachedBalance: "0.00",
    cachedAt: null,
    targetAmount: null,
    targetDate: null,
    isSharedWithHousehold: false,
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
    expect(parseCsvAmount("1,234.56")).toEqual({ amount: "1234.56", sign: 1 });
    expect(inferMovementType("", -1)).toBe("expense");
    expect(inferMovementType("", 1)).toBe("income");
  });

  it("returns null for malformed amounts without throwing", () => {
    expect(parseCsvAmount("Spesa")).toBeNull();
    expect(parseCsvAmount("abc")).toBeNull();
    expect(parseCsvAmount("€")).toBeNull();
    expect(parseCsvAmount("---")).toBeNull();
    expect(parseCsvAmount("")).toBeNull();
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

  it("recognizes account labels and common aliases as real account ids", () => {
    const parsed = parseCsv("Data;Descrizione;Importo;Categoria;Conto\n15/08/2026;Supermercato;-12,50;Spesa;Carta di credito Visa\n16/08/2026;Bar;-3,00;Spesa;Cash");
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

    expect(preview.accountMappingRequests).toEqual([]);
    expect(preview.rows.map((row) => row.movement?.accountId)).toEqual(["account-card", "account-cash"]);
  });

  it("requires manual account mapping for ambiguous CSV account aliases and reuses it", () => {
    const parsed = parseCsv("Data;Descrizione;Importo;Categoria;Conto\n15/08/2026;Prelievo;-50,00;Spesa;CC");
    const base = {
      rows: csvRowsToObjects(parsed),
      categories,
      accounts: [
        ...accounts,
        {
          ...accounts[0],
          id: "account-bank-2",
          name: "Secondario"
        }
      ],
      funds,
      existingMovements: []
    };
    const mapping = {
      columns: { date: "Data", description: "Descrizione", amount: "Importo", category: "Categoria", container: "Conto" },
      defaults: {
        categoryId: "category-other",
        containerId: "account:account-bank",
        type: "expense" as const,
        sharedWithFamily: false,
        householdId: null,
        notes: ""
      },
      missingCategoryStrategy: "default" as const
    };

    const unresolved = buildImportPreview({ ...base, mapping });
    const resolved = buildImportPreview({ ...base, mapping: { ...mapping, accountMappings: { cc: "account-bank-2" } } });

    expect(unresolved.accountMappingRequests).toEqual([{ normalizedValue: "cc", rawValue: "CC", reason: "ambiguous" }]);
    expect(unresolved.rows[0]?.valid).toBe(false);
    expect(resolved.accountMappingRequests).toEqual([]);
    expect(resolved.rows[0]?.movement?.accountId).toBe("account-bank-2");
  });

  it("imports transfer type rows using conto as source and destinazione as destination", () => {
    const parsed = parseCsv("Data;Descrizione;Importo;tipo;conto;destinazione;categoria\n15/08/2026;Giroconto;100,00;trasferimento;Conto corrente;Carta Visa;");
    const preview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: {
        columns: {
          date: "Data",
          description: "Descrizione",
          amount: "Importo",
          type: "tipo",
          container: "conto",
          destinationAccount: "destinazione",
          category: "categoria"
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
    expect(preview.rows[0]?.movement).toBeNull();
    expect(preview.rows[0]?.transfer).toMatchObject({
      fromAccountId: "account-bank",
      fromFundId: null,
      toAccountId: "account-card",
      toFundId: null,
      amount: "100.00"
    });
  });

  it("supports funds in transfer source and destination mapping", () => {
    const parsed = parseCsv("Data;Descrizione;Importo;tipo;conto;destinazione\n15/08/2026;Accantono;100,00;trasferimento;Cash;Fondo Vacanze\n16/08/2026;Rientro;20,00;trasferimento;Fondo Vacanze;Conto corrente");
    const preview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: {
        columns: {
          date: "Data",
          description: "Descrizione",
          amount: "Importo",
          type: "tipo",
          container: "conto",
          destinationAccount: "destinazione"
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

    expect(preview.rows[0]?.transfer).toMatchObject({ fromAccountId: "account-cash", fromFundId: null, toAccountId: null, toFundId: "fund-holiday" });
    expect(preview.rows[1]?.transfer).toMatchObject({ fromAccountId: null, fromFundId: "fund-holiday", toAccountId: "account-bank", toFundId: null });
  });

  it("keeps simple compatibility with legacy source and destination account columns", () => {
    const parsed = parseCsv("Data;Descrizione;Importo;conto_origine;conto_destinazione\n15/08/2026;Giroconto;100,00;Conto corrente;Carta Visa");
    const preview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: {
        columns: {
          date: "Data",
          description: "Descrizione",
          amount: "Importo",
          sourceAccount: "conto_origine",
          destinationAccount: "conto_destinazione"
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

    expect(preview.rows[0]?.transfer).toMatchObject({ fromAccountId: "account-bank", toAccountId: "account-card" });
  });

  it("keeps mapping by header name and not by column position", () => {
    const parsed = parseCsv("Importo;Data;Descrizione\n-12,50;15/08/2026;Supermercato");
    const preview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: {
        columns: { amount: "Importo", date: "Data", description: "Descrizione" },
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

    expect(preview.rows[0]?.movement).toMatchObject({
      amount: "12.50",
      occurredOn: "2026-08-15"
    });
  });

  it("reports invalid amount when mapping amount to a text column", () => {
    const parsed = parseCsv("Data;Tipo;Importo\n15/08/2026;Spesa;-12,50");
    const preview = buildImportPreview({
      rows: csvRowsToObjects(parsed),
      mapping: {
        columns: { date: "Data", amount: "Tipo", type: "Tipo" },
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

    expect(preview.rows[0]?.valid).toBe(false);
    expect(preview.rows[0]?.errors).toContain("Importo non valido");
  });

  it("allows repeated mapping changes without throwing", () => {
    const parsed = parseCsv("Data;Tipo;Importo\n15/08/2026;Spesa;-12,50");
    const rows = csvRowsToObjects(parsed);
    const baseInput = {
      rows,
      categories,
      accounts,
      funds,
      existingMovements: []
    };

    expect(() =>
      buildImportPreview({
        ...baseInput,
        mapping: {
          columns: { date: "Data", amount: "Tipo" },
          defaults: {
            categoryId: "category-other",
            containerId: "account:account-bank",
            type: "expense",
            sharedWithFamily: false,
            householdId: null,
            notes: ""
          },
          missingCategoryStrategy: "default"
        }
      })
    ).not.toThrow();

    expect(() =>
      buildImportPreview({
        ...baseInput,
        mapping: {
          columns: { date: "Data", amount: "Importo" },
          defaults: {
            categoryId: "category-other",
            containerId: "account:account-bank",
            type: "expense",
            sharedWithFamily: false,
            householdId: null,
            notes: ""
          },
          missingCategoryStrategy: "default"
        }
      })
    ).not.toThrow();
  });

  it("parses semicolon CSV with decimal comma", () => {
    const parsed = parseCsv("Data;Descrizione;Importo\n15/08/2026;Supermercato;-12,50");

    expect(parsed.errors).toEqual([]);
    expect(csvRowsToObjects(parsed)[0]).toMatchObject({
      Data: "15/08/2026",
      Importo: "-12,50"
    });
  });

  it("parses quoted commas and escaped quotes", () => {
    const parsed = parseCsv('data,descrizione,importo\n2026-08-15,"Supermercato, reparto ""bio""",-12.50');

    expect(parsed.errors).toEqual([]);
    expect(csvRowsToObjects(parsed)[0]).toMatchObject({
      descrizione: 'Supermercato, reparto "bio"'
    });
  });

  it("strips UTF-8 BOM from headers", () => {
    const parsed = parseCsv("\uFEFFdata,descrizione,importo\n2026-08-15,Supermercato,-12.50");

    expect(parsed.headers[0]).toBe("data");
  });

  it("reports inconsistent column counts", () => {
    const parsed = parseCsv("data,descrizione,importo\n2026-08-15,Supermercato");

    expect(parsed.errors).toContain("Riga 2: numero colonne 2, attese 3");
  });

  it("reports duplicated headers to avoid ambiguous object mapping", () => {
    const parsed = parseCsv("data,importo,importo\n2026-08-15,-12.50,-99.00");

    expect(parsed.errors).toContain("Intestazione duplicata: importo");
  });

  it("auto maps normalized header aliases", () => {
    expect(inferInitialColumns([" DATA ", "Causale", "Valore", "condiviso_famiglia"])).toMatchObject({
      amount: "Valore",
      date: " DATA ",
      description: "Causale",
      shared: "condiviso_famiglia"
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
