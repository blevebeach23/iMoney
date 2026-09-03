import { z } from "zod";
import type { AccountType, FundType } from "@/types/domain";

export const accountTypeOptions: Array<{ value: AccountType; label: string }> = [
  { value: "cash", label: "Contanti" },
  { value: "bank", label: "Conto" },
  { value: "credit_card", label: "Carta di credito" },
  { value: "other", label: "Conto" }
];

export const fundTypeOptions: Array<{ value: FundType; label: string }> = [
  { value: "savings", label: "Risparmio" },
  { value: "holiday", label: "Vacanze" },
  { value: "emergency", label: "Emergenze" },
  { value: "deposit", label: "Conto deposito" },
  { value: "custom", label: "Altro" }
];

export const moneyInputSchema = z
  .string()
  .trim()
  .min(1, "Importo obbligatorio")
  .regex(/^-?\d+([.,]\d{1,2})?$/, "Usa un importo con massimo due decimali")
  .transform((value) => value.replace(",", "."));

export const optionalPositiveMoneyInputSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value), "Usa un importo positivo con massimo due decimali")
  .transform((value) => (value === "" ? null : value));

export const accountFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome obbligatorio").max(80, "Nome troppo lungo"),
  type: z.enum(["cash", "bank", "credit_card", "other"]),
  openingBalance: moneyInputSchema,
  openingBalanceDate: z.string().trim().min(1, "Data obbligatoria")
});

export const fundFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome obbligatorio").max(80, "Nome troppo lungo"),
  type: z.enum(["savings", "holiday", "emergency", "deposit", "custom"]),
  openingBalance: moneyInputSchema,
  openingBalanceDate: z.string().trim().min(1, "Data obbligatoria"),
  targetAmount: optionalPositiveMoneyInputSchema,
  targetDate: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value)),
  sharedWithFamily: z.coerce.boolean().default(false),
  householdId: z
    .preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), z.string().uuid().nullable())
    .default(null)
}).refine((value) => !value.sharedWithFamily || value.householdId !== null, {
  message: "Serve una famiglia attiva per condividere",
  path: ["sharedWithFamily"]
});

export const macroCategoryFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome obbligatorio").max(80, "Nome troppo lungo"),
  sortOrder: z.coerce.number().int().min(0, "Ordine non valido")
});

export const categoryFormSchema = z.object({
  id: z.string().uuid().optional(),
  macroCategoryId: z.string().uuid("Macro-categoria obbligatoria"),
  name: z.string().trim().min(1, "Nome obbligatorio").max(80, "Nome troppo lungo"),
  sortOrder: z.coerce.number().int().min(0, "Ordine non valido")
});

export const creditCardSettingsFormSchema = z.object({
  accountId: z.string().uuid("Carta obbligatoria"),
  settlementAccountId: z.string().uuid("Conto di addebito obbligatorio"),
  statementClosingDay: z.coerce.number().int().min(1, "Giorno non valido").max(31, "Giorno non valido"),
  paymentDay: z.coerce.number().int().min(1, "Giorno non valido").max(31, "Giorno non valido"),
  automaticSettlement: z.boolean()
}).refine((value) => value.accountId !== value.settlementAccountId, {
  message: "La carta e il conto di addebito devono essere diversi",
  path: ["settlementAccountId"]
});
