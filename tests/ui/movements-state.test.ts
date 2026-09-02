import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("movements state persistence", () => {
  it("propagates safe returnTo through movement and transfer detail/edit actions", () => {
    const movementsPage = readFileSync(join(root, "src", "app", "movements", "page.tsx"), "utf8");
    const movementList = readFileSync(join(root, "src", "components", "movements", "movement-list.tsx"), "utf8");
    const movementActions = readFileSync(join(root, "src", "lib", "movements", "actions.ts"), "utf8");
    const transferActions = readFileSync(join(root, "src", "lib", "transfers", "actions.ts"), "utf8");

    expect(movementsPage).toContain("<MovementListStateRestorer />");
    expect(movementList).toContain("returnTo=${encodeURIComponent(returnTo)}");
    expect(movementActions).toContain("safeMovementsReturnTo(formData.get(\"returnTo\"))");
    expect(transferActions).toContain("safeMovementsReturnTo(formData.get(\"returnTo\"))");
    expect(transferActions).toContain("redirect(returnTo)");
  });
});
