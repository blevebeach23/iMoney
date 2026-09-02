import { z } from "zod";

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

export const transferFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    occurredOn: z.string().trim().min(1, "Data obbligatoria"),
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
    sharedWithFamily: z.coerce.boolean().default(false),
    householdId: z.string().uuid().nullable().default(null)
  })
  .and(containerSchema)
  .refine((value) => value.fromContainerId !== value.toContainerId, {
    message: "Origine e destinazione devono essere diverse",
    path: ["toContainerId"]
  })
  .refine((value) => !value.sharedWithFamily || Boolean(value.householdId), {
    message: "Seleziona una famiglia per condividere il trasferimento",
    path: ["sharedWithFamily"]
  });

export type TransferFormInput = z.infer<typeof transferFormSchema>;

export function parseTransferContainerId(value: string): { accountId: string | null; fundId: string | null } {
  const [kind, id] = value.split(":");

  if (kind === "account" && id) {
    return { accountId: id, fundId: null };
  }

  if (kind === "fund" && id) {
    return { accountId: null, fundId: id };
  }

  return { accountId: null, fundId: null };
}
