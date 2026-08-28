import { z } from "zod";
import type { AccountType, FundType } from "@/types/domain";

export const accountTypeOptions: Array<{ value: AccountType; label: string }> = [
  { value: "cash", label: "Contanti" },
  { value: "bank", label: "Banca" },
  { value: "credit_card", label: "Carta di credito" },
  { value: "other", label: "Altro" }
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
    .transform((value) => (value === "" ? null : value))
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
