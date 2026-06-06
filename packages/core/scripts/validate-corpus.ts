/**
 * Validate every YAML corpus unit under `stories/` against the work-hierarchy schema
 * (ADR-0013). Wired as `pnpm --filter @storytree/core validate` / `test`; the CI hook that
 * keeps the corpus honest. Exits non-zero on the first invalid unit.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadUnit } from "../src/index.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const storiesDir = join(repoRoot, "stories");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".yaml") || p.endsWith(".yml")) yield p;
  }
}

let ok = 0;
let failed = 0;
for (const file of walk(storiesDir)) {
  const rel = relative(repoRoot, file);
  try {
    const unit = loadUnit(file);
    console.log(`✓ ${rel} — ${unit.tier} ${unit.id}`);
    ok++;
  } catch (err) {
    failed++;
    console.error(`✗ ${rel}`);
    console.error(err instanceof Error ? err.message : String(err));
  }
}

console.log(`\n${ok} valid, ${failed} invalid`);
if (failed > 0) process.exit(1);
