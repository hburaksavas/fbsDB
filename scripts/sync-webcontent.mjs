import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "dist", "client");
const target = path.join(root, "native", "FbsDb", "WebContent");

if (!existsSync(path.join(source, "index.html"))) {
  throw new Error("Web editor build is missing. Run npm run build first.");
}

// This is generated content. Merging builds leaves obsolete hashed JS/CSS in
// the portable package indefinitely. Replace only the verified output folder.
if (path.relative(root, target) !== path.join("native", "FbsDb", "WebContent")) {
  throw new Error("Refusing to clean a folder outside the generated WebContent directory.");
}
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, force: true });
console.log(`Synced Monaco editor bundle to ${path.relative(root, target)}`);
