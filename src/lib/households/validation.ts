import { z } from "zod";

export const householdFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome famiglia obbligatorio").max(80, "Nome troppo lungo")
});

export const householdInviteSchema = z.object({
  householdId: z.string().uuid(),
  email: z.string().trim().email("Email non valida")
});

export const householdMemberRoleSchema = z.object({
  householdId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["admin", "member"])
});

export const householdMemberRemoveSchema = z.object({
  householdId: z.string().uuid(),
  userId: z.string().uuid()
});

export const householdPreferenceSchema = z.object({
  householdId: z.string().uuid(),
  shareNewMovementsByDefault: z.boolean()
});

export const householdInviteResponseSchema = z.object({
  token: z.string().trim().min(32),
  accept: z.boolean()
});
