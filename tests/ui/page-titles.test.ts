import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { familyTitle } from "@/lib/households/display-name";
import { shortUserName } from "@/lib/profiles/display-name";

const root = process.cwd();

describe("page titles", () => {
  it("builds the Home title from the user's short name", () => {
    expect(shortUserName("Vito Bleve", "vito")).toBe("Vito");
    expect(shortUserName("", "vito")).toBe("vito");
    expect(shortUserName(null, null)).toBe("Utente");

    const page = readFileSync(join(root, "src", "app", "page.tsx"), "utf8");
    const dashboard = readFileSync(join(root, "src", "components", "dashboard", "dashboard-preview.tsx"), "utf8");

    expect(page).toContain(".select(\"full_name, onboarding_completed, username\")");
    expect(page).toContain("shortUserName(profile?.full_name, profile?.username)");
    expect(dashboard).toContain("Rendiconto {userName}");
  });

  it("normalizes the Family title without duplicating the word Famiglia", () => {
    expect(familyTitle("Bleve")).toBe("Famiglia Bleve");
    expect(familyTitle("Famiglia Bleve")).toBe("Famiglia Bleve");
    expect(familyTitle(" famiglia Rossi ")).toBe("Famiglia Rossi");
    expect(familyTitle("")).toBe("Famiglia");
  });
});
