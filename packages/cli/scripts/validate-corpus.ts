/**
 * Guard: no standalone YAML unit may exist under `stories/` (ADR-0039). The corpus's
 * structured source format is JSON; work-hierarchy units are frontmatter-markdown (loaded by
 * the orchestrator's node-spec loader). A `.yaml`/`.yml` file here is a relapse into the
 * retired ADR-0013 pure-YAML representation. Wired into `pnpm --filter @storytree/cli test`; exits non-zero listing every offender.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const storiesDir = join(repoRoot, "stories");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".yaml") || p.endsWith(".yml")) yield p;
  }
}

const offenders = [...walk(storiesDir)].map((f) => relative(repoRoot, f));
for (const rel of offenders) {
  console.error(`✗ ${rel} — standalone YAML units are retired (ADR-0039); author frontmatter-markdown`);
}
if (offenders.length > 0) process.exit(1);
console.log("✓ stories/ holds no standalone YAML units (ADR-0039)");
