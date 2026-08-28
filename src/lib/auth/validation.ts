import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username di almeno 3 caratteri")
  .max(32, "Username massimo 32 caratteri")
  .regex(/^[a-zA-Z0-9_]+$/, "Usa solo lettere, numeri e underscore");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, "Nome obbligatorio"),
    username: usernameSchema,
    email: z.string().trim().email("Email non valida"),
    password: z.string().min(8, "Password di almeno 8 caratteri"),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Le password non coincidono",
    path: ["confirmPassword"]
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria")
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Email non valida")
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password di almeno 8 caratteri"),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Le password non coincidono",
    path: ["confirmPassword"]
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Nome obbligatorio"),
  username: usernameSchema,
  phone: z.string().trim().max(30, "Telefono troppo lungo").optional()
});

export type FieldErrors = Record<string, string[] | undefined>;

export interface FormState {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
}

export function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export function toFieldErrors(error: z.ZodError): FieldErrors {
  return error.flatten().fieldErrors;
}
