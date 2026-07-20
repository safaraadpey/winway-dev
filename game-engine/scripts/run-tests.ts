import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");

function collectTests(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...collectTests(path));
    } else if (name.endsWith(".test.ts") && !path.includes("benchmarks")) {
      if (name === "templateGates.test.ts") continue;
      out.push(path);
    }
  }
  return out;
}

const files = collectTests(srcRoot);
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit", shell: false }
);
process.exit(result.status ?? 1);
