import { z } from "zod";

const importMovementSchema = z
  .object({
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
    description: z.string().trim().min(1, "Descrizione obbligatoria").max(160, "Descrizione troppo lunga"),
    amount: z
      .string()
      .regex(/^\d+(\.\d{2})$/, "Importo positivo con due decimali")
      .refine((value) => Number(value) > 0, "Importo deve essere maggiore di zero"),
    type: z.enum(["income", "expense", "reimbursement"]),
    categoryId: z.string().uuid("Categoria obbligatoria"),
    accountId: z.string().uuid().nullable(),
    fundId: z.string().uuid().nullable(),
    isReimbursement: z.boolean(),
    sharedWithFamily: z.boolean(),
    householdId: z.string().uuid().nullable(),
    notes: z.string().trim().max(1000, "Note troppo lunghe"),
    createCategoryName: z.string().trim().min(1).max(80).optional()
  })
  .refine((value) => Number(Boolean(value.accountId)) + Number(Boolean(value.fundId)) === 1, {
    message: "Seleziona esattamente un conto o un fondo",
    path: ["accountId"]
  })
  .refine((value) => !value.isReimbursement || value.type === "income" || value.type === "reimbursement", {
    message: "Un rimborso deve essere una entrata",
    path: ["type"]
  })
  .refine((value) => !value.sharedWithFamily || value.householdId !== null, {
    message: "Serve un household attivo per condividere",
    path: ["sharedWithFamily"]
  });

export const confirmImportSchema = z.object({
  filename: z.string().trim().min(1, "Nome file obbligatorio").max(255, "Nome file troppo lungo"),
  rows: z.array(importMovementSchema).min(1, "Nessuna riga valida da importare"),
  macroCategoryIdForNew: z.string().uuid().optional()
});

export type ConfirmImportPayload = z.infer<typeof confirmImportSchema>;
