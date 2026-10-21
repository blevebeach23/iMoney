import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = realpathSync.native(process.cwd());

describe("Next development launcher", () => {
  it("starts a fresh Next process with canonical paths and forwards CLI arguments", () => {
    const requestedDirectory = process.platform === "win32" ? root.toLowerCase() : root;
    // Observe the process boundary rather than starting a persistent dev server.
    // Load the launcher with incorrect casing too: canonicalizing cwd alone is
    // insufficient once Node has cached paths while loading the launcher.
    const harness = `
      const Module = require("node:module");
      process.chdir(${JSON.stringify(requestedDirectory)});
      const load = Module._load;
      Module._load = function(request, parent, isMain) {
        if (request === "node:child_process") return {
          spawn(exec, argv, options) {
            console.log(JSON.stringify({ exec, argv, options }));
            return { on() { return this; } };
          }
        };
        return load.apply(this, arguments);
      };
      process.argv = [process.execPath, ${JSON.stringify(path.join(requestedDirectory, "scripts/dev.cjs"))}, "--port", "3107"];
      require(${JSON.stringify(path.join(requestedDirectory, "scripts/dev.cjs"))});
    `;
    const result = spawnSync(process.execPath, ["-e", harness], { cwd: root, encoding: "utf8" });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const observed = JSON.parse(result.stdout.trim()) as { exec: string; argv: string[]; options: { cwd: string; stdio: string } };
    expect(observed.exec).toBe(process.execPath);
    expect(observed.options).toEqual({ cwd: root, stdio: "inherit" });
    expect(observed.argv).toEqual([realpathSync.native(require.resolve("next/dist/bin/next")), "dev", "--port", "3107"]);
  });
});
