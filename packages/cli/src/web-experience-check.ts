// check:web-experience — the experience-rollout-guardrails capability (ADR-0134).
//
// The pure core of the check: three judges that combine into a single verdict. The fs shell
// (main()) handles the web/ submodule local-SKIP / CI-fail posture and bootstrap allowance,
// following check-web-engine's pattern.
//
// Exported for testing:
//   findExperienceMarkers  — marker contract (data-experience-skip / data-experience-fallback)
//   extractStaticImports   — pull first-paint import specifiers from source text
//   isWebGlSpecifier       — detect three / @react-three/* / forest-world-r3f
//   walkStaticClosure      — graph walk from the Act 1 entry (injection-testable)
//   checkExperienceEntry   — the combined judge (marker contract + WebGL wall)
//   findExperienceEntries  — adoption detection (pages carrying data-experience-entry)
//   withExtensionFallback  — import-resolution reader wrapper (extensionless specifiers)
//   checkExperienceSite    — the whole-site judge (entries → findings | bootstrap SKIP)
//
// Proof: node --import tsx --test packages/cli/src/web-experience-check.test.ts

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExperienceMarkers {
  readonly hasSkip: boolean;
  readonly hasFallback: boolean;
}

export interface ExperienceProblem {
  readonly kind: "missing-skip-marker" | "missing-fallback-marker" | "webgl-leak";
  readonly detail?: string;
}

// ── findExperienceMarkers ─────────────────────────────────────────────────────

/**
 * Detect the two required affordance markers in an HTML page.
 * Presence, not adequacy — static attribute search.
 */
export function findExperienceMarkers(html: string): ExperienceMarkers {
  return {
    hasSkip: html.includes("data-experience-skip"),
    hasFallback: html.includes("data-experience-fallback"),
  };
}

// ── extractStaticImports ──────────────────────────────────────────────────────

// Matches static `import … from '…'` and bare `import '…'` statements.
// Anchored at a statement boundary (^, ; or \n) to exclude dynamic import() calls.
// The negative lookahead (?!type[\s{*,]) excludes `import type` declarations.
const STATIC_IMPORT_RE =
  /(?:^|[;\n])\s*import\s+(?!type[\s{*,])(?:[^'"(;\n]*?\bfrom\s+)?['"]([^'"]+)['"]/gm;

// Matches `export { … } from '…'` and `export * from '…'`.
const EXPORT_FROM_RE =
  /(?:^|[;\n])\s*export\s+(?:[^'";\n]*?\bfrom\s+)['"]([^'"]+)['"]/gm;

/**
 * Extract all specifiers reachable at first paint — static import/export-from edges only.
 * Dynamic `import()` calls and `import type` declarations are excluded.
 */
export function extractStaticImports(src: string): string[] {
  const specifiers: string[] = [];

  for (const m of src.matchAll(STATIC_IMPORT_RE)) {
    const spec = m[1];
    if (spec !== undefined) specifiers.push(spec);
  }

  for (const m of src.matchAll(EXPORT_FROM_RE)) {
    const spec = m[1];
    if (spec !== undefined) specifiers.push(spec);
  }

  return specifiers;
}

// ── isWebGlSpecifier ──────────────────────────────────────────────────────────

/**
 * Returns true if the specifier or resolved path reaches a WebGL surface that must not
 * appear in the Act 1 static closure: the bare `three` package, any `@react-three/*`
 * namespace package, or any path whose segments include `forest-world-r3f` (the synced
 * R3F island dir, ADR-0134 §1 tech split).
 */
export function isWebGlSpecifier(specifier: string): boolean {
  if (specifier === "three") return true;
  if (specifier.startsWith("@react-three/")) return true;
  return specifier.split("/").includes("forest-world-r3f");
}

// ── walkStaticClosure ─────────────────────────────────────────────────────────

/**
 * Resolve a relative import specifier from the directory of `fromFile`.
 * Bare specifiers (not starting with `.`) are returned as-is and tracked in the closure.
 */
function resolveSpecifier(fromFile: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const fromDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : ".";
  const combined = `${fromDir}/${specifier}`;
  const parts = combined.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== ".") {
      resolved.push(part);
    }
  }
  return resolved.join("/");
}

/**
 * Walk the static import closure from `entryPath`, returning every reachable specifier /
 * path (including the entry itself). `readFile` returns source text or null for nodes that
 * cannot be read (external packages, absent files) — those are still included in the closure
 * but not recursed into. Handles circular imports without looping.
 */
export function walkStaticClosure(
  entryPath: string,
  readFile: (p: string) => string | null,
): Set<string> {
  const closure = new Set<string>();
  const queue: string[] = [entryPath];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (closure.has(current)) continue;
    closure.add(current);

    const content = readFile(current);
    if (content === null) continue;

    for (const specifier of extractStaticImports(content)) {
      const resolved = resolveSpecifier(current, specifier);
      if (!closure.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return closure;
}

// ── checkExperienceEntry ──────────────────────────────────────────────────────

/**
 * The combined judge: marker contract + WebGL wall. Returns an empty array when the
 * entry passes, or one or more `ExperienceProblem` entries when it fails.
 */
export function checkExperienceEntry(
  page: string,
  act1Entry: string,
  readFile: (p: string) => string | null,
): ExperienceProblem[] {
  const problems: ExperienceProblem[] = [];

  // 1. Marker contract
  const markers = findExperienceMarkers(page);
  if (!markers.hasSkip) {
    problems.push({
      kind: "missing-skip-marker",
      detail: "data-experience-skip not found in the experience entry page",
    });
  }
  if (!markers.hasFallback) {
    problems.push({
      kind: "missing-fallback-marker",
      detail: "data-experience-fallback not found in the experience entry page",
    });
  }

  // 2. No-WebGL-in-Act-1 wall
  const closure = walkStaticClosure(act1Entry, readFile);
  for (const specifier of closure) {
    if (isWebGlSpecifier(specifier)) {
      problems.push({ kind: "webgl-leak", detail: specifier });
    }
  }

  return problems;
}

// ── Site-level judge ──────────────────────────────────────────────────────────

/**
 * The explicit adoption signal: a page under `src/pages/` carrying this attribute IS the
 * experience entry. Today's site has no such page, so the check SKIPs (bootstrap allowance —
 * the guard lands before the storm); the storm cap declares it when it flips home. Detection
 * must be this explicit: keying on a page PATH (e.g. index.astro exists) would arm the gate
 * against the pre-experience site and red every increment until the storm lands.
 */
export const EXPERIENCE_ENTRY_MARKER = "data-experience-entry";

/** Pages (paths under `src/pages/`) whose content carries the entry marker, sorted. */
export function findExperienceEntries(files: ReadonlyMap<string, string>): string[] {
  const entries: string[] = [];
  for (const [p, content] of files) {
    if (p.startsWith("src/pages/") && content.includes(EXPERIENCE_ENTRY_MARKER)) entries.push(p);
  }
  return entries.sort();
}

const RESOLVE_EXTENSIONS = [".ts", ".js", ".tsx", ".jsx", ".astro"];

/**
 * Wrap a raw reader with import-resolution fallbacks: try the literal path, then the known
 * source extensions (an extensionless `../scripts/act1` resolves to `act1.ts`). Without this
 * the closure walk stops silently at extensionless specifiers and the WebGL wall is toothless
 * the day the storm lands — a silent false-green.
 */
export function withExtensionFallback(
  readFile: (p: string) => string | null,
): (p: string) => string | null {
  return (p) => {
    const direct = readFile(p);
    if (direct !== null) return direct;
    for (const ext of RESOLVE_EXTENSIONS) {
      const withExt = readFile(p + ext);
      if (withExt !== null) return withExt;
    }
    return null;
  };
}

export interface SiteFinding {
  /** web-root-relative path of the entry page the problem was found on. */
  readonly page: string;
  readonly problem: ExperienceProblem;
}

export type SiteCheckResult =
  | { readonly kind: "skip"; readonly reason: string }
  | {
      readonly kind: "checked";
      readonly entries: readonly string[];
      readonly findings: readonly SiteFinding[];
    };

/**
 * The whole-site judge the gate runs: `files` is the web/src tree as a web-root-relative
 * POSIX-path → content map. No page carries {@link EXPERIENCE_ENTRY_MARKER} → SKIP (bootstrap
 * allowance). Otherwise every entry page is held to the marker contract and the
 * no-WebGL-in-Act-1 wall, its static closure seeded at the page itself (the storm's script
 * graph hangs off the entry's imports), findings tagged with the page.
 */
export function checkExperienceSite(files: ReadonlyMap<string, string>): SiteCheckResult {
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
  const findings: SiteFinding[] = [];
  for (const page of entries) {
    const content = files.get(page) ?? "";
    for (const problem of checkExperienceEntry(content, page, read)) {
      findings.push({ page, problem });
    }
  }
  return { kind: "checked", entries, findings };
}

// ── CLI shell (main) ──────────────────────────────────────────────────────────

const TEXT_EXT = new Set([".astro", ".html", ".md", ".mdx", ".jsx", ".tsx", ".ts", ".js"]);

/** Recursively collect web-relative text-file paths under a dir (the check-web-grounding shell). */
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
  // packages/cli/src/web-experience-check.ts → four dirs up (the build-claude-md.ts pattern).
  const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
  const webRoot = path.join(repoRoot, "web");
  const webSrc = path.join(webRoot, "src");
  const inCi = process.env.CI === "true";

  // Key on web/src, not web/: an uninitialized submodule leaves an EMPTY web/ stub dir.
  if (!existsSync(webSrc)) {
    if (inCi) {
      console.error(
        "check:web-experience — web/ is not checked out in CI. The workflow must clone the " +
          "pinned storytree-web submodule before this step.",
      );
      process.exit(1);
    }
    console.log(
      "check:web-experience — SKIP: web/ submodule not checked out " +
        "(run `git submodule update --init web` to enable this check locally).",
    );
    return;
  }

  // The walk space is web-root-relative POSIX paths (never OS-native), so the pure judge's
  // string-based specifier resolution holds on Windows checkouts too.
  const files = new Map<string, string>();
  for (const rel of walkTextFiles(webSrc, webRoot)) {
    files.set(rel, readFileSync(path.join(webRoot, rel), "utf8"));
  }

  const result = checkExperienceSite(files);

  if (result.kind === "skip") {
    console.log(`check:web-experience — SKIP: ${result.reason}`);
    return;
  }

  if (result.findings.length > 0) {
    console.error(
      `check:web-experience — BLOCKED: ${result.findings.length} problem(s) across ` +
        `${result.entries.length} experience entry page(s):\n`,
    );
    for (const f of result.findings) {
      console.error(
        `  ✗ web/${f.page} [${f.problem.kind}]` +
          (f.problem.detail !== undefined ? `: ${f.problem.detail}` : ""),
      );
    }
    console.error(
      "\nThe experience entry must keep the skip + fallback affordances and a WebGL-free Act 1 " +
        "static closure (ADR-0134; dynamic import() at the inflection is the sanctioned seam).",
    );
    process.exit(1);
  }

  console.log(
    `check:web-experience — OK: ${result.entries.length} experience entry page(s) carry both ` +
      "affordance markers and their Act 1 static closure is WebGL-free.",
  );
}

// Run only when invoked directly (`tsx src/web-experience-check.ts`), not when the test imports.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
