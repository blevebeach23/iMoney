import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAction } from "@/lib/auth/actions";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: { signUp: mocks.signUp },
    rpc: mocks.rpc
  })
}));

function registerForm(email = "vito@example.test") {
  const formData = new FormData();
  formData.set("fullName", "Vito Bleve");
  formData.set("username", "vito_bleve");
  formData.set("email", email);
  formData.set("password", "password123");
  formData.set("confirmPassword", "password123");
  return formData;
}

describe("registration flow", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stops registration when the email is already registered", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "email_is_registered") {
        return Promise.resolve({ data: true, error: null });
      }

      return Promise.resolve({ data: true, error: null });
    });

    await expect(registerAction({ ok: false }, registerForm())).resolves.toMatchObject({
      ok: false,
      message: "Questa mail risulta già registrata. Recupera password.",
      fieldErrors: { email: ["Questa mail risulta già registrata"] }
    });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});
