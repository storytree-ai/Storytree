// The PURE core of the forest-world → public-website sync + drift gate (ADR-0093
// Decision 3 / Open call 3 — sync-into-submodule). The public `web/` submodule
// consumes the shared render core (`@storytree/forest-world`) as a SYNCED BUILD
// ARTIFACT, never as private source (the ADR-0066 Decision 3 / ADR-0056 boundary):
// `pnpm sync:web-engine` copies the core's browser-safe sources into the website's
// `src/lib/forest-world/` (each stamped @generated), and `pnpm check:web-engine`
// (the gate's drift guard) FAILS when the synced copy drifts from the core. So a
// studio look change in the core can't silently leave the public site stale — a
// submodule bump must carry a fresh sync. It is the render-core twin of
// check-web-grounding (which binds the site's CLAIMS to the ADRs); both run
// parent-side at submodule-bump granularity, reusing the ADR-0051/0052
// generated-view + drift pattern.
//
// This module is PURE (no node:fs, no process): the CLI shell (web-engine.ts) does
// the IO; tests drive these functions with in-memory fixtures.
//
// GENERALISED (the web-experience-sync capability, ADR-0123): the mechanism carries
// N parent packages, each an EnginePackage descriptor (source dir → dest dir under
// web/src/lib/, its own fail-loud floor and banner prose). The core package's plan
// stays byte-identical to the single-package era — the already-synced artifact must
// not churn under this generalisation.

/** Where the synced artifact lives, web-relative — the website imports from here. */
export const ENGINE_DIR = "src/lib/forest-world";

/**
 * Core source files that must be present for the sync to be meaningful — a guard
 * so a broken discovery (empty dir, wrong path) fails loudly instead of silently
 * syncing nothing. The website's render imports the scene-graph + the barrel.
 */
export const REQUIRED_ENGINE_FILES = ["scene.ts", "index.ts"] as const;

/**
 * One synced parent package: where its sources live in the parent repo, where the
 * synced copy lands in the website, which files must exist for the sync to be
 * meaningful, and the banner prose naming the package to a reader of the copy.
 */
export interface EnginePackage {
  /** Parent-repo source dir, e.g. "packages/forest-world/src" — named in the banner. */
  readonly srcDir: string;
  /** Web-relative destination dir, e.g. "src/lib/forest-world". */
  readonly destDir: string;
  /** Files that must be present in the source dir (the fail-loud discovery floor). */
  readonly requiredFiles: readonly string[];
  /** The banner's package-naming middle lines (byte-exact — the core's must not churn). */
  readonly bannerBody: (file: string) => string;
}

/** The shared render core — the original synced package (ADR-0093 §3). Its banner
 *  body reproduces the single-package banner BYTE-FOR-BYTE (the no-churn guarantee). */
export const CORE_PACKAGE: EnginePackage = {
  srcDir: "packages/forest-world/src",
  destDir: ENGINE_DIR,
  requiredFiles: REQUIRED_ENGINE_FILES,
  bannerBody: (file) =>
    `// Synced from packages/forest-world/src/${file} in the storytree parent repo (the\n` +
    `// shared forest-world render core, ADR-0093). Edit the core there and re-sync; a\n` +
    `// stale copy fails the parent's \`check:web-engine\` gate.\n`,
};

/** The R3F mapper — the second synced package (ADR-0123; the website-experience story).
 *  Its `.tsx` component layer ships too, and its `@storytree/forest-world` imports are
 *  rewritten to the synced sibling core dir so the site holds ONE copy of the geometry. */
export const R3F_PACKAGE: EnginePackage = {
  srcDir: "packages/forest-world-r3f/src",
  destDir: "src/lib/forest-world-r3f",
  requiredFiles: ["index.ts", "world-to-3d.ts", "ForestWorldCanvas.tsx"],
  bannerBody: (file) =>
    `// Synced from packages/forest-world-r3f/src/${file} in the storytree parent repo (the\n` +
    `// R3F forest-world mapper, ADR-0123). Edit the mapper there and re-sync; a\n` +
    `// stale copy fails the parent's \`check:web-engine\` gate.\n`,
};

/** Every package the one sync + drift gate carries, in sync order. */
export const ENGINE_PACKAGES: readonly EnginePackage[] = [CORE_PACKAGE, R3F_PACKAGE];

/** Drop a file from the sync set — test files (node:test, `node:` imports) and
 *  declaration maps never ship to the browser bundle. `.tsx` is included so R3F
 *  component layers in sibling packages (e.g. forest-world-r3f) are also synced. */
export function isEngineSource(file: string): boolean {
  return (file.endsWith(".ts") || file.endsWith(".tsx"))
    && !file.endsWith(".test.ts")
    && !file.endsWith(".test.tsx")
    && !file.endsWith(".d.ts");
}

/** Normalise EOL so a CRLF checkout of the synced copy never reads as drift — the
 *  claude-region lesson (a naive compare went spuriously STALE on Windows). */
export function normalizeEol(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

/** The @generated banner stamped atop each synced file: the generated-view marker
 *  (ADR-0051/0052) that tells a reader the edit surface is the parent package, not
 *  this copy. Package-parameterised; defaults to the core (byte-identical to the
 *  single-package era). */
export function bannerFor(file: string, pkg: EnginePackage = CORE_PACKAGE): string {
  return `// @generated by \`pnpm sync:web-engine\` — DO NOT EDIT THIS COPY.\n${pkg.bannerBody(file)}\n`;
}

/**
 * Rewrite the core's NodeNext `./x.js` relative imports to extensionless `./x` —
 * the website (Vite/Astro) resolves extensionless TS imports (its own modules use
 * that style), so this avoids depending on Vite's `.js`→`.ts` resolution quirk.
 * Only sibling/relative specifiers are touched; bare package specifiers (none in
 * the browser-safe core) are left alone.
 */
export function rewriteImports(source: string): string {
  return source.replace(/(from\s+["'])(\.\.?\/[^"']+?)\.js(["'])/g, "$1$2$3");
}

/** The full content of one synced file: the banner, then the package source with its
 *  relative imports made extensionless and EOL LF-normalised (platform-stable bytes). */
export function syncedContent(file: string, source: string, pkg: EnginePackage = CORE_PACKAGE): string {
  return bannerFor(file, pkg) + rewriteImports(normalizeEol(source));
}

export interface SyncedFile {
  /** The core source file name, e.g. "scene.ts". */
  readonly file: string;
  /** The web-relative destination path, e.g. "src/lib/forest-world/scene.ts". */
  readonly path: string;
  /** The exact content to write (banner + LF-normalised source). */
  readonly content: string;
}

/**
 * The only `@storytree/*` workspace specifier that may appear in a synced file — it
 * references the sibling synced core dir so the site consumes ONE copy of the geometry,
 * never a private duplicate. Any other `@storytree/*` is a plan-time error: the synced
 * artifact must never smuggle a private package reference the website cannot resolve.
 */
const ALLOWED_WORKSPACE_SPECIFIER = "@storytree/forest-world";

/**
 * An `@storytree/*` specifier in IMPORT POSITION only — after `from`, a side-effect
 * `import "…"`, or a dynamic `import("…")`. Anchoring to the quoted specifier position
 * matters: the real core mentions workspace packages in COMMENTS (`// @storytree/…`),
 * and a bare match would churn the already-synced core bytes (breaking the no-churn
 * guarantee) or fail the plan over prose.
 */
const WORKSPACE_SPECIFIER_RE = /((?:from\s+|import\s+|import\s*\(\s*)["'])(@storytree\/[^"']+)(["'])/g;

/** Rewrite `@storytree/forest-world` import specifiers → `../forest-world` (the sibling
 *  synced dir) and throw immediately on any other `@storytree/*` import specifier. */
function rewriteWorkspaceImports(source: string): string {
  return source.replace(WORKSPACE_SPECIFIER_RE, (_whole, pre: string, spec: string, post: string) => {
    if (spec === ALLOWED_WORKSPACE_SPECIFIER) {
      return `${pre}../forest-world${post}`;
    }
    throw new Error(
      `Synced file contains an unresolvable workspace import: ${spec}. ` +
        `Only '${ALLOWED_WORKSPACE_SPECIFIER}' is allowed in synced sources ` +
        `(the website cannot resolve private @storytree/* packages).`,
    );
  });
}

/**
 * Compute the exact synced fileset for one package's sources (file name → raw source).
 * Pure + deterministic: the same sources always yield the same plan, so the sync
 * (which writes it) and the check (which compares against it) agree by construction.
 * Non-source files are filtered; the result is sorted for a stable order.
 *
 * `pkg` — the package descriptor (defaults to the core, whose plan is byte-identical
 * to the single-package era). Pass {@link R3F_PACKAGE} to plan the second package.
 */
export function computeSyncPlan(
  coreSources: ReadonlyMap<string, string>,
  pkg: EnginePackage = CORE_PACKAGE,
): SyncedFile[] {
  const plan: SyncedFile[] = [];
  for (const [file, source] of coreSources) {
    if (!isEngineSource(file)) continue;
    const rewrittenSource = rewriteWorkspaceImports(source);
    plan.push({ file, path: `${pkg.destDir}/${file}`, content: syncedContent(file, rewrittenSource, pkg) });
  }
  return plan.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

export interface DriftProblem {
  readonly file: string;
  readonly reason: string;
}

/**
 * Compare the planned synced files against what is actually in the website's engine
 * dir. `readSynced(file)` returns the synced copy's content or null when absent;
 * `syncedFiles` is every file currently in the engine dir (to catch a STALE EXTRA —
 * a core file deleted upstream but its copy left behind). EOL-insensitive so a CRLF
 * checkout is not false drift.
 */
export function detectEngineDrift(
  plan: readonly SyncedFile[],
  readSynced: (file: string) => string | null,
  syncedFiles: readonly string[],
): DriftProblem[] {
  const problems: DriftProblem[] = [];
  const planned = new Set(plan.map((p) => p.file));

  for (const item of plan) {
    const actual = readSynced(item.file);
    if (actual === null) {
      problems.push({ file: item.file, reason: "missing from the synced copy — run `pnpm sync:web-engine`" });
      continue;
    }
    if (normalizeEol(actual) !== normalizeEol(item.content)) {
      problems.push({
        file: item.file,
        reason: "the synced copy is STALE — the core changed; re-run `pnpm sync:web-engine`",
      });
    }
  }

  for (const file of syncedFiles) {
    if (isEngineSource(file) && !planned.has(file)) {
      problems.push({
        file,
        reason: "no longer in the core — a stale leftover; re-run `pnpm sync:web-engine` to drop it",
      });
    }
  }

  return problems;
}
