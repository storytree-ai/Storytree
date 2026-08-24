/**
 * Three corpus guards over `stories/`, wired into `pnpm --filter @storytree/cli test`; each exits
 * non-zero listing every offender.
 *
 * 1. No standalone YAML unit may exist (ADR-0039). The corpus's structured source format is JSON;
 *    work-hierarchy units are frontmatter-markdown (loaded by the orchestrator's node-spec loader).
 *    A `.yaml`/`.yml` file here is a relapse into the retired ADR-0013 pure-YAML representation.
 * 2. Every reliability gate and the criterion it names must live or retire TOGETHER (ADR-0436).
 *    The corpus already checked legs → gates and reported `bound-but-gate-missing: 0`; nothing asked
 *    the REVERSE — whether a gate's command still names a criterion that exists. Three did not, and
 *    because every driver works forward from criteria, no walk could ever reach them.
 * 3. Every LIVE gate's declared command still names files that exist (ADR-0436 Consequences — the
 *    general form of #2 that ADR-0436 named but did not close: "nothing checks that a declared
 *    gate's COMMAND CAN RUN"). Bit once: `ci-cd#gate-1`/`#gate-7` named the retired
 *    `src/landing-deps.test.ts`, hidden behind an `&&` short-circuit and repaired by hand in PR
 *    #1470 rather than caught.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditGateCommandFileRefs,
  auditGateCriterionBindings,
  type GateCriterionAuditStory,
} from "@storytree/library";

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

// ---------------------------------------------------------------------------
// Guard 2 (ADR-0436): a gate and the criterion it names live or retire together
// ---------------------------------------------------------------------------

const corpus: GateCriterionAuditStory[] = [];
for (const entry of readdirSync(storiesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const storyFile = join(storiesDir, entry.name, "story.md");
  try {
    corpus.push({
      storyId: entry.name,
      sourcePath: relative(repoRoot, storyFile).split(sep).join("/"),
      body: readFileSync(storyFile, "utf8"),
    });
  } catch {
    // A directory with no story.md is not a story; the node-spec loader owns that complaint.
  }
}

// NON-VACUITY: the audit's subject is the story corpus, so an EMPTY corpus would make it pass while
// having compared nothing — the commonest way one of these guards goes quietly green.
if (corpus.length === 0) {
  console.error("✗ stories/ yielded no story.md documents — the gate↔criterion audit compared nothing");
  process.exit(1);
}

const findings = auditGateCriterionBindings(corpus);
for (const row of findings) {
  console.error(`✗ ${row.sourcePath} — ${row.detail}`);
}
if (findings.length > 0) process.exit(1);
console.log(
  `✓ every reliability gate names a criterion that exists, and no live leg binds a retired gate ` +
    `(${corpus.length} stories, ADR-0436)`,
);

// ---------------------------------------------------------------------------
// Guard 3 (ADR-0436 Consequences): a live gate's command still names files that exist
// ---------------------------------------------------------------------------

// Package name -> repo-relative directory, read from each workspace's own package.json (never
// guessed from a naming convention) — the same "cwd a `pnpm --filter <pkg>` command runs with"
// this audit's `--filter` resolution needs.
const packageDirs = new Map<string, string>();
for (const scope of ["packages", "apps"]) {
  const scopeDir = join(repoRoot, scope);
  for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = join(scopeDir, entry.name, "package.json");
    try {
      const name = (JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { name?: string }).name;
      if (typeof name === "string" && name.length > 0) {
        packageDirs.set(name, `${scope}/${entry.name}`);
      }
    } catch {
      // A directory with no readable package.json is not a workspace package; skip it.
    }
  }
}

const fileRefFindings = auditGateCommandFileRefs(corpus, packageDirs, (repoRelativePath) => {
  try {
    return statSync(join(repoRoot, ...repoRelativePath.split("/"))).isFile();
  } catch {
    return false;
  }
});
for (const row of fileRefFindings) {
  console.error(`✗ ${row.sourcePath} — ${row.detail}`);
}
if (fileRefFindings.length > 0) process.exit(1);
console.log(
  `✓ every live reliability gate's command names files that exist in this checkout ` +
    `(${corpus.length} stories, ADR-0436 Consequences)`,
);
