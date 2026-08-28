import { describe, expect, it } from "vitest";
import { loginSchema, profileSchema, registerSchema } from "@/lib/auth/validation";

describe("auth validation", () => {
  it("accepts a valid registration payload", () => {
    const result = registerSchema.safeParse({
      fullName: "Vito Bleve",
      username: "vito_bleve",
      email: "vito@example.test",
      password: "password123",
      confirmPassword: "password123"
    });

    expect(result.success).toBe(true);
  });

  it("rejects mismatched registration passwords", () => {
    const result = registerSchema.safeParse({
      fullName: "Vito Bleve",
      username: "vito_bleve",
      email: "vito@example.test",
      password: "password123",
      confirmPassword: "password456"
    });

    expect(result.success).toBe(false);
  });

  it("requires valid login email and password", () => {
    expect(loginSchema.safeParse({ email: "bad", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "vito@example.test", password: "password123" }).success).toBe(true);
  });

  it("keeps username format strict for profile updates", () => {
    expect(profileSchema.safeParse({ fullName: "Vito", username: "vito bleve", phone: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ fullName: "Vito", username: "vito_bleve", phone: "" }).success).toBe(true);
  });
});
