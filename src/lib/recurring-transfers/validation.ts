import { z } from "zod";
import { parseTransferContainerId } from "@/lib/transfers/validation";

const containerSchema = z
  .object({
    fromAccountId: z.string().uuid().nullable(),
    fromFundId: z.string().uuid().nullable(),
    toAccountId: z.string().uuid().nullable(),
    toFundId: z.string().uuid().nullable()
  })
  .refine((value) => Number(Boolean(value.fromAccountId)) + Number(Boolean(value.fromFundId)) === 1, {
    message: "Seleziona esattamente una origine",
    path: ["fromContainerId"]
  })
  .refine((value) => Number(Boolean(value.toAccountId)) + Number(Boolean(value.toFundId)) === 1, {
    message: "Seleziona esattamente una destinazione",
    path: ["toContainerId"]
  });

export const recurringTransferFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    fromContainerId: z.string().min(1, "Origine obbligatoria"),
    toContainerId: z.string().min(1, "Destinazione obbligatoria"),
    amount: z
      .string()
      .trim()
      .min(1, "Importo obbligatorio")
      .regex(/^\d+([.,]\d{1,2})?$/, "Importo positivo con massimo due decimali")
      .transform((value) => value.replace(",", "."))
      .refine((value) => Number(value) > 0, "Importo deve essere maggiore di zero"),
    description: z.string().trim().max(160, "Descrizione troppo lunga").default(""),
    frequency: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
    startsOn: z.string().trim().min(1, "Data inizio obbligatoria"),
    endsOn: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().nullable()),
    dayOfMonth: z.coerce.number().int().min(1).max(31),
    isActive: z.boolean(),
    sharedWithFamily: z.boolean(),
    householdId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().uuid().nullable())
  })
  .and(containerSchema)
  .refine((value) => value.fromContainerId !== value.toContainerId, {
    message: "Origine e destinazione devono essere diverse",
    path: ["toContainerId"]
  })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    message: "Data fine precedente alla data inizio",
    path: ["endsOn"]
  })
  .refine((value) => !value.sharedWithFamily || value.householdId !== null, {
    message: "Serve un household attivo per condividere",
    path: ["sharedWithFamily"]
  });

export type RecurringTransferFormInput = z.infer<typeof recurringTransferFormSchema>;

export function parseRecurringTransferContainerId(value: string) {
  return parseTransferContainerId(value);
}
