// check:web-experience-closure — the no-WebGL-in-Act-1 static-import-closure guard (ADR-0336).
//
// Re-wires ONLY the static-closure third of the retired `check:web-experience` rung (ADR-0311 D2):
// does Act 1's static import graph reach `three`, `@react-three/*`, or the synced `forest-world-r3f`
// directory anywhere? This is a NEW, narrower rung — not a readmission of `check:web-experience`,
// which stays retired and `UNWIRED` (ADR-0311 D5's re-addition bar is met by this ADR for this one
// property only). The two runtime-marker assertions the old rung also carried
// (`data-experience-skip` / `data-experience-fallback` presence) are DELIBERATELY out of scope here —
// see ADR-0336 D2: they remain unguarded by any machine, a known and accepted gap.
//
// Reuses the intact, tested closure-walk primitives the retired judge already exports
// (`web-experience-check.ts`) rather than re-deriving them: `findExperienceEntries` (the
// `data-experience-entry` bootstrap-allowance adoption signal), `walkStaticClosure`,
// `isWebGlSpecifier`, `withExtensionFallback`. Only the SITE-LEVEL judge here is new — it walks every
// experience entry's closure and reports WebGL leaks, without touching the marker contract at all.
//
// Mirrors `check-web-grounding.ts`'s local-SKIP / CI-fail posture over the `web/` submodule: absent
// locally it declares `GATE_SKIP_EXIT_CODE` (a legitimate local state — `git submodule update --init
// web` enables it); absent in CI it is a hard failure (the workflow must have cloned it).
//
// Proof: node --import tsx --test packages/cli/src/check-web-experience-closure.test.ts

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  EXPERIENCE_ENTRY_MARKER,
  findExperienceEntries,
  isWebGlSpecifier,
  walkStaticClosure,
  withExtensionFallback,
} from "./web-experience-check.js";
import { GATE_SKIP_EXIT_CODE } from "./gate-runner.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClosureFinding {
  /** web-root-relative path of the entry page whose closure reached a WebGL specifier. */
  readonly page: string;
  /** the offending specifier or resolved path (e.g. `"three"`, `"forest-world-r3f/..."`). */
  readonly specifier: string;
}

export type ClosureCheckResult =
  | { readonly kind: "skip"; readonly reason: string }
  | {
      readonly kind: "checked";
      readonly entries: readonly string[];
      readonly findings: readonly ClosureFinding[];
    };

// ── checkExperienceClosure ──────────────────────────────────────────────────────

/**
 * The whole-site closure judge: for every page carrying {@link EXPERIENCE_ENTRY_MARKER}, walk its
 * static import closure (seeded at the page itself, the storm's script graph hangs off its imports)
 * and flag any WebGL specifier reached. No entry page → SKIP (bootstrap allowance — the guard lands
 * before the storm, mirroring `checkExperienceSite`'s reasoning in the retired judge).
 */
export function checkExperienceClosure(files: ReadonlyMap<string, string>): ClosureCheckResult {
  const entries = findExperienceEntries(files);
  if (entries.length === 0) {
    return {
      kind: "skip",
      reason:
        `no page under src/pages/ carries ${EXPERIENCE_ENTRY_MARKER} — the site has not ` +
        "adopted the experience yet (bootstrap allowance: the guard lands before the storm).",
    };
  }

  const read = withExtensionFallback((p) => files.get(p) ?? null);
  const findings: ClosureFinding[] = [];
  for (const page of entries) {
    const closure = walkStaticClosure(page, read);
    for (const specifier of closure) {
      if (isWebGlSpecifier(specifier)) findings.push({ page, specifier });
    }
  }
  return { kind: "checked", entries, findings };
}

// ── CLI shell (main) ──────────────────────────────────────────────────────────

const TEXT_EXT = new Set([".astro", ".html", ".md", ".mdx", ".jsx", ".tsx", ".ts", ".js"]);

/** Recursively collect web-relative text-file paths under a dir (the check-web-grounding pattern). */
function walkTextFiles(dir: string, base: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkTextFiles(full, base, out);
    else if (TEXT_EXT.has(path.extname(name).toLowerCase())) {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

function main(): void {
  // packages/cli/src/check-web-experience-closure.ts → four dirs up (the build-claude-md.ts pattern).
  const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
  const webRoot = path.join(repoRoot, "web");
  const webSrc = path.join(webRoot, "src");
  const inCi = process.env.CI === "true";

  // Key on web/src, not web/: an uninitialized submodule leaves an EMPTY web/ stub dir.
  if (!existsSync(webSrc)) {
    if (inCi) {
      console.error(
        "check:web-experience-closure — web/ is not checked out in CI. The workflow must clone the " +
          "pinned storytree-web submodule before this step.",
      );
      process.exit(1);
    }
    // DECLARE the skip to the gate runner rather than exiting 0 (ADR-0276 increment 4) — see
    // check-web-grounding.ts for why this is not the same as passing.
    console.log(
      "check:web-experience-closure — SKIP: web/ submodule not checked out " +
        "(run `git submodule update --init web` to enable this check locally).",
    );
    process.exit(GATE_SKIP_EXIT_CODE);
  }

  // The walk space is web-root-relative POSIX paths (never OS-native), so the pure judge's
  // string-based specifier resolution holds on Windows checkouts too.
  const files = new Map<string, string>();
  for (const rel of walkTextFiles(webSrc, webRoot)) {
    files.set(rel, readFileSync(path.join(webRoot, rel), "utf8"));
  }

  const result = checkExperienceClosure(files);

  if (result.kind === "skip") {
    console.log(`check:web-experience-closure — SKIP: ${result.reason}`);
    return;
  }

  if (result.findings.length > 0) {
    console.error(
      `check:web-experience-closure — BLOCKED: ${result.findings.length} WebGL leak(s) into Act 1's ` +
        `static import closure across ${result.entries.length} experience entry page(s):\n`,
    );
    for (const f of result.findings) {
      console.error(`  ✗ web/${f.page}: reaches "${f.specifier}"`);
    }
    console.error(
      "\nAct 1 must ship no WebGL bytes (ADR-0216 D2/D4) — the R3F bundle may only load behind a " +
        "dynamic import() at the inflection, which this walk does not count.",
    );
    process.exit(1);
  }

  console.log(
    `check:web-experience-closure — OK: ${result.entries.length} experience entry page(s), Act 1's ` +
      "static import closure is WebGL-free.",
  );
}

// Run only when invoked directly (`tsx src/check-web-experience-closure.ts`), not when the test imports.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
