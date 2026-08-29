import { z } from "zod";

const containerSchema = z
  .object({
    accountId: z.string().uuid().nullable(),
    fundId: z.string().uuid().nullable()
  })
  .refine((value) => Number(Boolean(value.accountId)) + Number(Boolean(value.fundId)) === 1, {
    message: "Seleziona esattamente un conto o un fondo",
    path: ["containerId"]
  });

export const movementFilterSchema = z.object({
  period: z.string().optional(),
  type: z.enum(["all", "income", "expense", "reimbursement"]).default("all"),
  macroCategoryId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  containerId: z.string().optional(),
  reimbursement: z.enum(["all", "yes", "no"]).default("all"),
  shared: z.enum(["all", "yes", "no"]).default("all")
});

export const movementFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    occurredOn: z.string().trim().min(1, "Data obbligatoria"),
    description: z.string().trim().min(1, "Descrizione obbligatoria").max(160, "Descrizione troppo lunga"),
    categoryId: z.string().uuid("Categoria obbligatoria"),
    type: z.enum(["income", "expense"]),
    amount: z
      .string()
      .trim()
      .min(1, "Importo obbligatorio")
      .regex(/^\d+([.,]\d{1,2})?$/, "Importo positivo con massimo due decimali")
      .transform((value) => value.replace(",", "."))
      .refine((value) => Number(value) > 0, "Importo deve essere maggiore di zero"),
    containerId: z.string().min(1, "Conto o fondo obbligatorio"),
    isReimbursement: z.boolean(),
    reimbursementForMovementId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().uuid().nullable()),
    sharedWithFamily: z.boolean(),
    householdId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().uuid().nullable()),
    notes: z.string().trim().max(1000, "Note troppo lunghe").default("")
  })
  .and(containerSchema)
  .refine((value) => !value.isReimbursement || value.type === "income", {
    message: "Un rimborso deve essere una entrata",
    path: ["type"]
  })
  .refine((value) => !value.sharedWithFamily || value.householdId !== null, {
    message: "Serve un household attivo per condividere",
    path: ["sharedWithFamily"]
  });

export type MovementFormInput = z.infer<typeof movementFormSchema>;

export function parseContainerId(value: string): { accountId: string | null; fundId: string | null } {
  const [kind, id] = value.split(":");

  if (kind === "account" && id) {
    return { accountId: id, fundId: null };
  }

  if (kind === "fund" && id) {
    return { accountId: null, fundId: id };
  }

  return { accountId: null, fundId: null };
}
