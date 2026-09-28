import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const commands = [
  ["--test", "scripts/check-content.mjs"],
  ["--test", "scripts/check-markdown.mjs"],
  ["--test", "server/app.test.mjs", "server/accounts.test.mjs", "server/gallery.test.mjs", "server/maintenance.test.mjs", "server/bootstrap.test.mjs"],
  ["scripts/check-dynamic-content.mjs"],
  ["scripts/check-gallery.mjs"],
  ...[
    "archive", "motion", "loop", "appearance", "assembly", "decryption",
    "shell", "quality",
  ].map((name) => [`scripts/check-${name}.mjs`]),
];

for (const args of commands) {
  console.log(`\n> node ${args.join(" ")}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("\nAll content and scene checks passed.");
