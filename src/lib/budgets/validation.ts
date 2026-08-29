import { z } from "zod";

export const budgetFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    month: z.string().regex(/^\d{4}-\d{2}-01$/, "Mese non valido"),
    scopeKind: z.enum(["general", "macro", "category"]),
    macroCategoryId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().uuid().nullable()),
    categoryId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().uuid().nullable()),
    amount: z
      .string()
      .trim()
      .min(1, "Importo obbligatorio")
      .regex(/^\d+([.,]\d{1,2})?$/, "Importo positivo con massimo due decimali")
      .transform((value) => value.replace(",", "."))
      .refine((value) => Number(value) > 0, "Budget deve essere maggiore di zero")
  })
  .refine((value) => value.scopeKind !== "general" || (!value.macroCategoryId && !value.categoryId), {
    message: "Il budget generale non usa categorie",
    path: ["scopeKind"]
  })
  .refine((value) => value.scopeKind !== "macro" || Boolean(value.macroCategoryId), {
    message: "Macro-categoria obbligatoria",
    path: ["macroCategoryId"]
  })
  .refine((value) => value.scopeKind !== "category" || Boolean(value.categoryId), {
    message: "Categoria obbligatoria",
    path: ["categoryId"]
  });

export type BudgetFormInput = z.infer<typeof budgetFormSchema>;
