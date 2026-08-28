import { z } from "zod";

export const initialAccountOptions = [
  { key: "cash", label: "Contanti", type: "cash" },
  { key: "bank", label: "Conto corrente", type: "bank" },
  { key: "credit_card", label: "Carta di credito", type: "credit_card" }
] as const;

export const initialCategoryGroups = [
  { macro: "CASA", categories: ["Affitto", "Mutuo", "Manutenzione"] },
  { macro: "ALIMENTARI", categories: ["Supermercato", "Pranzo", "Spesa casa"] },
  { macro: "AUTO", categories: ["Carburante", "Assicurazione", "Manutenzione"] },
  { macro: "ISTRUZIONE", categories: ["Scuola", "Libri", "Corsi"] },
  { macro: "UTENZE", categories: ["Luce", "Gas", "Telefono"] },
  { macro: "TASSE", categories: ["Imposte", "Bolli"] },
  { macro: "SALUTE", categories: ["Farmacia", "Visite"] },
  { macro: "TEMPO LIBERO", categories: ["Ristoranti", "Sport", "Cultura"] },
  { macro: "VACANZE", categories: ["Viaggi", "Alloggi"] },
  { macro: "ALTRO", categories: ["Varie"] }
] as const;

export const onboardingSchema = z.object({
  fullName: z.string().trim().min(1, "Nome obbligatorio"),
  username: z
    .string()
    .trim()
    .min(3, "Username di almeno 3 caratteri")
    .max(32, "Username massimo 32 caratteri")
    .regex(/^[a-zA-Z0-9_]+$/, "Usa solo lettere, numeri e underscore"),
  createInitialCategories: z.boolean(),
  accounts: z
    .array(
      z.object({
        enabled: z.boolean(),
        name: z.string().trim().min(1, "Nome conto obbligatorio"),
        type: z.enum(["cash", "bank", "credit_card"]),
        openingBalance: z.string().trim().regex(/^-?\d+([.,]\d{1,2})?$/, "Saldo non valido"),
        openingBalanceDate: z.string().trim().min(1, "Data obbligatoria")
      })
    )
    .max(3)
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
