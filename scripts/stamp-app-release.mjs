import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = createHash("sha256");
function scan(folder) {
  for (const entry of readdirSync(path.join(root, folder), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${folder}/${entry.name}`;
    if (name === "lib/app-release.json") continue;
    if (entry.isDirectory()) scan(name);
    else if (entry.isFile()) hash.update(name).update("\0").update(readFileSync(path.join(root, name))).update("\0");
  }
}
for (const folder of ["app", "lib", "public", "scripts"]) scan(folder);
for (const file of ["package.json", "pnpm-lock.yaml", "vite.config.ts"]) hash.update(readFileSync(path.join(root, file)));
writeFileSync(path.join(root, "lib/app-release.json"), JSON.stringify({ id: hash.digest("hex").slice(0, 20) }) + "\n");
