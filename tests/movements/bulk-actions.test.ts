import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("movement timeline bulk actions", () => {
  it("updates movements and transfers in set-based owned queries", () => {
    const actions = readFileSync(join(root, "src", "lib", "movements", "actions.ts"), "utf8");

    expect(actions).toContain("bulkUpdateTimelineAction");
    expect(actions).toContain(".from(\"movements\").update");
    expect(actions).toContain(".from(\"transfers\").update");
    expect(actions).toContain(".in(\"id\", movementIds).eq(\"owner_user_id\", user.id)");
    expect(actions).toContain(".in(\"id\", transferIds).eq(\"owner_user_id\", user.id)");
  });

  it("limits mixed selection to compatible actions", () => {
    const list = readFileSync(join(root, "src", "components", "movements", "movement-list.tsx"), "utf8");

    expect(list).toContain("const movementOnly = hasMovements && !hasTransfers");
    expect(list).toContain("Cambia categoria");
    expect(list).toContain("Cambia conto/fondo");
    expect(list).toContain("Condividi Family");
    expect(list).toContain("Rimuovi condivisione Family");
  });

  it("keeps returnTo state after bulk update", () => {
    const list = readFileSync(join(root, "src", "components", "movements", "movement-list.tsx"), "utf8");
    const actions = readFileSync(join(root, "src", "lib", "movements", "actions.ts"), "utf8");

    expect(list).toContain("name=\"returnTo\" value={returnTo}");
    expect(actions).toContain("redirect(returnTo)");
  });
});
