// Explicit runtime allowlist; never copy the repository wholesale.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "release", `rhine-blog-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const files = [
  "dist", "content/site.json", "content/column-labels.json",
  "server/app.mjs", "server/store.mjs", "server/create-user.mjs", "server/maintenance.mjs",
  "deploy/windows/Start-BlogServer.ps1", "deploy/windows/Install-BlogTask.ps1",
  "deploy/windows/Create-User.ps1", "deploy/windows/Caddyfile",
  "LICENSE", "readme.md", "THIRD_PARTY_NOTICES.md", "docs/DEPLOYMENT.zh-CN.md",
  "docs/MAINTENANCE.zh-CN.md", "docs/PROVENANCE.md", "docs/VERIFICATION.md", "content/README.md",
  ".env.example", "public/licenses", "public/fonts/NOTICE.txt", "public/fonts/MiSans-license.pdf",
];
if (!existsSync(resolve(root, "dist/index.html"))) throw new Error("Build first.");
if (existsSync(output)) throw new Error("Refusing to overwrite an existing release.");
mkdirSync(output, { recursive: true });
for (const file of files) cpSync(resolve(root, file), resolve(output, file), { recursive: true });
writeFileSync(resolve(output, "package.json"), JSON.stringify({
  name: "rhine-blog-runtime", private: true, type: "module", license: "MIT",
  engines: { node: ">=24.0.0 <25" },
  scripts: { start: "node server/app.mjs", "user:add": "node server/create-user.mjs", backup: "node server/maintenance.mjs backup" },
}, null, 2) + "\n");
console.log(`Runtime release: ${output}`);
