import { z } from "zod";
import { parseContainerId } from "@/lib/movements/validation";

const containerSchema = z
  .object({
    accountId: z.string().uuid().nullable(),
    fundId: z.string().uuid().nullable()
  })
  .refine((value) => Number(Boolean(value.accountId)) + Number(Boolean(value.fundId)) === 1, {
    message: "Seleziona esattamente un conto o un fondo",
    path: ["containerId"]
  });

export const fixedExpenseFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    description: z.string().trim().min(1, "Descrizione obbligatoria").max(160, "Descrizione troppo lunga"),
    categoryId: z.string().uuid("Categoria obbligatoria"),
    amount: z
      .string()
      .trim()
      .min(1, "Importo obbligatorio")
      .regex(/^\d+([.,]\d{1,2})?$/, "Importo positivo con massimo due decimali")
      .transform((value) => value.replace(",", "."))
      .refine((value) => Number(value) > 0, "Importo deve essere maggiore di zero"),
    containerId: z.string().min(1, "Conto o fondo obbligatorio"),
    startsOn: z.string().trim().min(1, "Data inizio obbligatoria"),
    endsOn: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().nullable()),
    dayOfMonth: z.coerce.number().int().min(1).max(31),
    activeMonths: z.array(z.coerce.number().int().min(1).max(12)).min(1, "Seleziona almeno un mese"),
    sharedWithFamily: z.boolean(),
    householdId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().uuid().nullable())
  })
  .and(containerSchema)
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    message: "Data fine precedente alla data inizio",
    path: ["endsOn"]
  })
  .refine((value) => !value.sharedWithFamily || value.householdId !== null, {
    message: "Serve un household attivo per condividere",
    path: ["sharedWithFamily"]
  });

export type FixedExpenseFormInput = z.infer<typeof fixedExpenseFormSchema>;

export const fixedExpenseRequestFormSchema = z
  .object({
    description: z.string().trim().min(1, "Descrizione obbligatoria").max(160, "Descrizione troppo lunga"),
    categoryId: z.string().uuid("Categoria obbligatoria"),
    amount: z
      .string()
      .trim()
      .min(1, "Importo obbligatorio")
      .regex(/^\d+([.,]\d{1,2})?$/, "Importo positivo con massimo due decimali")
      .transform((value) => value.replace(",", "."))
      .refine((value) => Number(value) > 0, "Importo deve essere maggiore di zero"),
    startsOn: z.string().trim().min(1, "Data inizio obbligatoria"),
    endsOn: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().nullable()),
    dayOfMonth: z.coerce.number().int().min(1).max(31),
    activeMonths: z.array(z.coerce.number().int().min(1).max(12)).min(1, "Seleziona almeno un mese"),
    sharedWithFamily: z.boolean(),
    householdId: z.string().uuid("Serve una famiglia attiva"),
    recipientUserId: z.string().uuid("Destinatario obbligatorio"),
    notes: z.string().trim().max(1000, "Note troppo lunghe").default("")
  })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    message: "Data fine precedente alla data inizio",
    path: ["endsOn"]
  })
  .refine((value) => value.sharedWithFamily, {
    message: "Una richiesta familiare deve restare condivisa con famiglia",
    path: ["sharedWithFamily"]
  });

export const fixedExpenseRequestDecisionSchema = z
  .object({
    requestId: z.string().uuid(),
    categoryId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().uuid("Categoria obbligatoria").nullable()),
    containerId: z.string().min(1, "Conto o fondo obbligatorio"),
    accountId: z.string().uuid().nullable(),
    fundId: z.string().uuid().nullable()
  })
  .and(containerSchema);

export type FixedExpenseRequestFormInput = z.infer<typeof fixedExpenseRequestFormSchema>;
export type FixedExpenseRequestDecisionInput = z.infer<typeof fixedExpenseRequestDecisionSchema>;

export function parseFixedExpenseContainerId(value: string) {
  return parseContainerId(value);
}
