import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("recurring expense labels", () => {
  it("renames fixed expenses to recurring expenses in visible UI copy", () => {
    const files = [
      ["src", "app", "settings", "page.tsx"],
      ["src", "app", "fixed-expenses", "page.tsx"],
      ["src", "app", "fixed-expenses", "new", "page.tsx"],
      ["src", "components", "fixed-expenses", "fixed-expense-list.tsx"],
      ["src", "components", "family", "family-dashboard.tsx"],
      ["src", "components", "notifications", "notification-center.tsx"]
    ].map((segments) => readFileSync(join(root, ...segments), "utf8"));

    const combined = files.join("\n");
    expect(combined).toContain("Spese ricorrenti");
    expect(combined).not.toMatch(/Spese fisse|spese fisse|Spesa fissa|spesa fissa/);
  });
});
