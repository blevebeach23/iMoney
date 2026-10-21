const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Next 14's non-native realpath can preserve incorrect Windows path casing.
// Start with canonical paths in a fresh process, before Node caches module paths,
// so the App Router provider and consumer share the same context instance.
const projectDir = fs.realpathSync.native(path.resolve(__dirname, ".."));
const nextCli = fs.realpathSync.native(require.resolve("next/dist/bin/next"));
const child = spawn(process.execPath, [nextCli, "dev", ...process.argv.slice(2)], {
  cwd: projectDir,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
