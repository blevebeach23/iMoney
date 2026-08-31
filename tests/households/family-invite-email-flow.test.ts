import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("family invite email flow", () => {
  it("uses the production iMoney URL as the safe default redirect origin", () => {
    const siteUrl = readFileSync(join(process.cwd(), "src", "lib", "site-url.ts"), "utf8");

    expect(siteUrl).toContain("https://i-money-five.vercel.app");
  });

  it("does not expose household invite tokens in the unregistered invite UI success message", () => {
    const actions = readFileSync(join(process.cwd(), "src", "lib", "households", "actions.ts"), "utf8");

    expect(actions).toContain("L'utente riceverà una email per registrarsi e accettare la famiglia.");
    expect(actions).not.toContain("Link registrazione/invito");
  });

  it("keeps the Supabase service role key server-side only", () => {
    const adminClient = readFileSync(join(process.cwd(), "src", "lib", "supabase", "admin.ts"), "utf8");
    const browserClient = readFileSync(join(process.cwd(), "src", "lib", "supabase", "client.ts"), "utf8");
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(adminClient).toContain("import \"server-only\"");
    expect(adminClient).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(browserClient).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(envExample).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE");
  });
});
