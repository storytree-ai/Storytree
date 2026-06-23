import { z } from "zod";

import type { ShellCommand } from "./shell-test-executor.js";
import type { PathWriteScopeConfig } from "./phase-machine.js";

/**
 * The canonical node→build-config shape (ADR-0057 keystone): the proof command that proves a node,
 * the per-phase write-scope globs the gate walls writes with, and the optional `real:` arm. This
 * module is the SINGLE home for the shape — both the hand-maintained {@link NODE_BUILD_REGISTRY}
 * (now a validation/fallback layer) and a node's own spec-borne `proof:` block describe a
 * {@link NodeBuildConfig}. It is a dependency-leaf: it imports only the two seam types it composes
 * ({@link ShellCommand}, {@link PathWriteScopeConfig}) and zod — neither the registry nor the spec
 * loader, so the now-primary loader (`node-spec.ts`) no longer transitively depends on the demoted
 * registry.
 */

/**
 * For each buildable node, the REAL shell command that proves it and the per-phase write-scope
 * globs the gate walls writes with. Explicit by design — a node is buildable only once someone
 * deliberately declares how to prove it (in its own spec's `proof:` block, ADR-0057, or in the
 * residual registry). Commands are file+argv (execFile, never a shell).
 */
export interface NodeBuildConfig {
  /** The proof command `ShellTestExecutor` would spawn for this node in a live build. */
  command: ShellCommand;
  /** Per-phase write walls: tests writable only in AUTHOR_TEST, source only in IMPLEMENT. */
  scope: PathWriteScopeConfig;
  /** REAL-mode proof config (Phase F). Absent = the node is dry-run/live-smoke buildable only. */
  real?: RealProofConfig;
}

/**
 * What `--real` (Phase F) needs to drive a node's ACTUAL proof in a fresh git worktree of this
 * repo: the real test file the spine runs (`node --import tsx --test <testFile>` at the worktree
 * root) and the per-phase write walls over REAL repo-relative paths.
 *
 * Dependencies (ADR-0031 §2): without `install`, the worktree gets NO `pnpm install`, so the
 * authored test/impl may import ONLY `node:` builtins and relative files (type-only imports are
 * erased and fine) — the right shape for NET-NEW, dependency-free leaves. With `install: true`,
 * the worktree gets a LOCKFILE-ONLY `pnpm install` first (shared-store cheap), the authored files
 * may import workspace dependencies, and promotion additionally requires the node's package suite
 * (the registry `command`) AND the package typecheck (`typecheck`) green in the worktree — a green
 * leaf must not break its package, and the proof run is tsx-driven (types STRIPPED), so only a
 * real `tsc --noEmit` can see type-illegal-but-runtime-green code. The leaf can never ADD a
 * dependency either way: `package.json`/`pnpm-lock.yaml` sit outside every write scope
 * (deny-by-default).
 */
export interface RealProofConfig {
  /** Repo-relative TS test file the REAL proof runs. AUTHOR_TEST may write exactly this. */
  testFile: string;
  /** Repo-relative implementation file named in the leaf brief. IMPLEMENT may write per scope. */
  sourceFile: string;
  /** Per-phase write walls over REAL repo-relative paths. */
  scope: PathWriteScopeConfig;
  /** Lockfile-only `pnpm install` in the worktree first (dependency-bearing targets, ADR-0031). */
  install?: boolean;
  /**
   * The package typecheck command (`tsc --noEmit` via the package's `typecheck` script), run in the
   * installed worktree alongside the regression suite before a promotion may push. REQUIRED when
   * `install` is true (the schema's refine + the CLI both refuse an install-bearing config without
   * it): the proof command runs under tsx, which strips types, so a leaf can author runtime-green
   * code that violates the repo's strict flags (it happened — exactOptionalPropertyTypes,
   * declare-presence, 2026-06-11) and only a worktree `tsc` catches it before the PR-time CI does.
   */
  typecheck?: ShellCommand;
  /**
   * The proof command the spine SPAWNS for red/green (ADR-0057 §3, expansion B — a proof-mode
   * vocabulary beyond node:test). ABSENT = the default `node --import tsx --test <testFile>` at the
   * worktree root (the node:test status quo — the migrated nodes keep this, byte-for-byte). PRESENT
   * = the spine spawns THIS command for BOTH the CONFIRM red/green observations AND the leaf's
   * `run_proof` feedback tool (one oracle, two consumers). `cwd` is NOT allowed (the schema refuses
   * it) — the resolver FORCES cwd to the worktree root, so a proof can never redirect out of its own
   * worktree (declare file+args only). `pnpm` is platform-shimmed at spawn (pnpm.cmd on Windows) and
   * REQUIRES `install: true` (a bare worktree has no node_modules — the schema refuses pnpm without
   * install). Honesty: a declared command CANNOT forge a green — the spine still spawns it
   * out-of-band, and a trivially-green command still fails CONFIRM_RED (a real red must be observed
   * FIRST). The leaf still authors exactly testFile→sourceFile; this widens the OBSERVATION
   * vocabulary, never the authoring surface.
   */
  proofCommand?: ShellCommand;
  /**
   * C (ADR-0057 §3): this node EDITS source that already exists at HEAD (a bug-fix / refactor /
   * regression) rather than authoring a net-new file. ABSENT/false = the net-new status quo (the
   * brief asserts `sourceFile` must NOT exist yet; the red is a missing-symbol import). true = the
   * brief drops that assumption and steers the leaf to: read the existing source(s) in
   * `scope.sourceGlobs`, add a regression test that FAILS against CURRENT behaviour (a runtime
   * assertion, not a missing symbol), then EDIT the source(s). MULTI-FILE is NOT a separate flag —
   * it is read off `scope.sourceGlobs` (a glob set already permits >1 IMPLEMENT write, ADR-0057 A)
   * plus an optional suite `proofCommand` (B); this flag governs ONLY the net-new↔edit-existing
   * brief axis. The 7 migrated net-new nodes never carry it (absent → the parity deepEqual holds).
   * Honesty: the AUTHOR_TEST wall is still test-globs-only (a leaf cannot edit existing source while
   * "authoring the test"), and CONFIRM_RED still observes the new test failing against the UNCHANGED
   * source — a forged already-green regression test self-defeats. The one genuinely-new hole (a
   * default single-file proof not exercising edited code in a sibling file) is NARROWED by the refine
   * below: edit-existing + a source scope broader than a single literal `sourceFile` — a multi-glob
   * set, OR a single `*`-wildcard glob (the wildcard tightening, owner call 2026-06-21) — REQUIRES an
   * explicit `proofCommand` declaration (it forces the author to NAME a proof for the multi-file
   * edit; whether that command actually exercises every edited file is the same PR-diff-review bound
   * A/B took for scope/command — surfaced, not structurally verified).
   *
   * Edit-existing does NOT force `install:true` (owner call 2026-06-21): a builtins-only
   * edit-existing node stays legal on a bare worktree; declare `install` yourself when the edited
   * source imports workspace deps (a missing install then fails LOUD at proof time — module-not-found
   * — never a silent green, so forcing install is unnecessary over-restriction).
   */
  editsExisting?: boolean;
  /**
   * R2 (ADR-0098): refactor-for-testability. The source EXISTS at HEAD and is CORRECT but UNTESTABLE
   * as-is (an entry-guarded `main()`, a raw `Pool`, no injection seam). Unlike `editsExisting` —
   * which presupposes the behaviour is WRONG and steers AWAY from a missing-symbol red — R2
   * presupposes the behaviour is RIGHT: the new test targets a behaviour-preserving SEAM that does
   * NOT exist yet, so the red is STRUCTURAL (a missing-symbol / module-not-found), and IMPLEMENT
   * performs a behaviour-preserving REFACTOR that introduces the seam. The "real work" is the
   * refactor, not a behaviour fix. R2 INVERTS one of `editsExisting`'s steers: where editsExisting
   * forbids a missing-symbol red, R2 REQUIRES one (the seam isn't there yet).
   *
   * Honesty (ADR-0098 d.2): the green signal is the WHOLE PACKAGE SUITE — the regression wall — so an
   * R2 arm MUST declare a `proofCommand` (the suite; the schema refines refuse it otherwise). One
   * oracle gives both signals: CONFIRM_RED = the suite is red because the new test cannot resolve its
   * seam (siblings green); CONFIRM_GREEN = the suite is green = the new test passes AND nothing
   * regressed. The behaviour-preservation guarantee net-new cannot give, R2 gets for free from the
   * suite-wide oracle (strictly better-guarded than net-new over the same structural-red basis). The
   * AUTHOR_TEST wall is still test-globs-only, and CONFIRM_RED still observes the new test failing
   * against the UNCHANGED source — a forged already-green test self-defeats. MUTUALLY EXCLUSIVE with
   * `editsExisting` (a different brief axis: behaviour-preserving refactor vs behaviour change). The
   * net-new nodes never carry it (absent → the parity deepEqual holds).
   *
   * Residue (the test this mode leaves is KEPT): an R2 arm authors STANDING COVERAGE — the deliverable.
   * A build-tests gate exists precisely to leave real coverage over a previously-untested pocket
   * (ADR-0098 d.4: a green build-tests gate MEANS the pocket got real, driven coverage), so its test is
   * re-run forever, never pruned as proof-scaffolding. The ONLY prunable proof-residue is the inverse: a
   * gate-as-proof authoring-COMPLETENESS test over a now-FROZEN artifact (an ADR — ADR-0059/0092), whose
   * whole value is captured the moment its verdict signs. The cut is frozen-vs-living — a test that
   * re-runs to guard a LIVE surface (R2 coverage; a story's completeness guard) stays; one that only
   * witnessed a one-time authoring event over a frozen artifact may go. Scope follows the same cut: a
   * single-surface claim runs the narrowest command; this no-regression claim runs the whole suite.
   */
  refactorForTests?: boolean;
  /**
   * DB-backed proof (ADR-0064): the node's proof needs a live Postgres connection (a store/pg
   * adapter), so the spine provisions an ISOLATED test-database connection for the worktree proof.
   * REQUIRES `install: true` — the proof imports a `@storytree/<organism>/store` subpath / `pg` / the
   * Cloud SQL connector from node_modules, which a bare (no-install) worktree does not have. Honesty wall (reuses
   * ADR-0054): the spine FORCES `STORYTREE_DB_NAME` in the proof's env to a DISPOSABLE test database
   * and refuses a prod/blank name, so a db-backed proof can NEVER touch production — even if the
   * parent env points at it. The leaf still authors ONLY `testFile`->`sourceFile` and can write
   * nothing else; `db` provisions the proof's ENVIRONMENT, it does not widen the write surface.
   */
  db?: boolean;
  /**
   * Guarded dependency adds (ADR-0064 §2): NEW dependencies the SPINE installs into the worktree via
   * `pnpm add <dep...> --filter <pkg>` BEFORE the leaf authors — a deliberate, narrow relaxation of
   * the ADR-0031 §2 rule that the leaf may never touch `package.json`/`pnpm-lock.yaml`. The leaf
   * STILL cannot write either file; the dep set is declared HERE (explicit, auditable), the spine
   * performs the add, and the change lands in the PR's lockfile diff (the spine commits it with the
   * authored files). The target package is derived from `sourceFile`. REQUIRES `install: true` (the
   * lockfile-only base install runs first, then `pnpm add` resolves the new deps). Each entry is a
   * `pnpm add` package spec (`tree-sitter`, `tree-sitter@0.21.0`); a leading `-` is refused — the
   * spine controls the flags, not the author (no flag injection). A new dependency is explicit STORY
   * work declared in the spec, never a leaf's workaround.
   */
  addDeps?: string[];
}

/**
 * The zod schema for a spec-borne `proof:` block. It validates the SAME shape as
 * {@link NodeBuildConfig}, only declared in the node's own `stories/<story>/<unit>.md` frontmatter
 * instead of in `NODE_BUILD_REGISTRY`. Authoring the block is what makes a node buildable — no
 * orchestrator edit.
 *
 * STRICT at every level (`.strict()`): an unknown / mistyped key inside the block is a malformed
 * config, not a tolerated extra — a `sourceGlb` typo would silently UNDER-DECLARE the write scope,
 * exactly the honesty hole the loud loader posture exists to stop. (The outer node-spec frontmatter
 * stays `.passthrough()` — light by design; only this load-bearing subtree is validated tightly.)
 * Globs are `.min(1)` (an empty scope can never allow a write — reject it loud, never produce a
 * never-buildable node), mirroring the registry's existing `length > 0` posture. The fail-closed
 * default lives in the loader: a spec with NO `proof:` block yields no build config and is not
 * buildable.
 *
 * Trust note (ADR-0057): moving the DECLARATION site into the spec does NOT widen what a leaf may
 * write — the scope is still enforced spine-side by the phase wall and the SDK PreToolUse hook
 * (`phase-scoped-write-wall`); only where the globs are written down moves. Bounding an
 * over-declared spec scope is now a STRUCTURAL bound (ADR-0087), not PR-diff review: the
 * {@link scopeGlobBoundIssue} refine on {@link PathWriteScopeConfigSchema} refuses any glob that
 * reaches outside a single concrete package/app, so a self-registered node can never declare a
 * repo-wide scope in the first place.
 */
const ShellCommandSchema = z
  .object({
    file: z.string().min(1),
    args: z.array(z.string()),
    cwd: z.string().min(1).optional(),
  })
  .strict();

/**
 * The code roots a spec-borne write scope may target (ADR-0087): one concrete package or app.
 */
const CODE_ROOTS = ["packages", "apps"] as const;
/**
 * The AUTHORING-DOC roots a gate-as-proof node may target (ADR-0092 amends ADR-0087): a story's own
 * spec dir (`stories/<story>/`) and the decision log (`docs/decisions/`). A gate-as-proof authoring
 * node's "source" is a DOC outside `packages/` — an ADR (`docs/decisions/NNNN-slug.md`) or a story
 * spec (`stories/<story>/story.md`) it edits to structural completeness (ADR-0059, expansion E). The
 * SAME structural bound still applies — one CONCRETE doc dir, no wildcard/`..`/absolute escape — so a
 * gate-as-proof node can no more declare a repo-wide doc scope than a code node can.
 */
const AUTHORING_DOC_ROOTS = ["stories", "docs"] as const;
/** Every root a self-registered scope glob may be anchored under (code + authoring-doc). */
const ALLOWED_SCOPE_ROOTS: readonly string[] = [...CODE_ROOTS, ...AUTHORING_DOC_ROOTS];

/**
 * ADR-0087 (amended by ADR-0092): the STRUCTURAL bound on one spec-borne write-scope glob. A
 * self-registered node writes its own `sourceGlobs`/`testGlobs` (ADR-0057), so the over-declaration
 * the registry status quo left to **PR-diff review** is instead refused **here, by construction** —
 * a self-registered node can never declare a scope reaching outside a single, concrete unit.
 *
 * PURE + shape-only (no filesystem): it judges the glob STRING, never whether the unit exists, so it
 * is independently unit-testable and never couples the parser to disk (the dissolved `packages/core`
 * specs still parse — existence is a separate drift concern). A glob is IN BOUNDS iff it is a
 * repo-relative POSIX path whose first segment is an allowed root — a concrete CODE root
 * (`packages` | `apps`) or, for gate-as-proof authoring nodes, an authoring-DOC root
 * (`stories` | `docs`, ADR-0092) — and whose second segment is a CONCRETE unit name (no glob
 * metacharacter), with no `..` escape. Returns a human-readable reason when OUT of bounds, else null.
 */
export function scopeGlobBoundIssue(glob: string): string | null {
  if (glob.startsWith("/") || /^[A-Za-z]:/.test(glob)) {
    return `must be a repo-relative path, not absolute ("${glob}")`;
  }
  const segments = glob.split("/");
  if (segments.includes("..")) {
    return `must not escape its unit with a ".." segment ("${glob}")`;
  }
  const root = segments[0];
  const unit = segments[1];
  if (root === undefined || !ALLOWED_SCOPE_ROOTS.includes(root)) {
    return (
      `must be rooted under one of "packages/", "apps/" (code) or "stories/", "docs/" ` +
      `(gate-as-proof authoring docs) — a bare repo-wide glob like "**/*" is refused ("${glob}")`
    );
  }
  const unitWord = root === "packages" || root === "apps" ? "package/app" : "story/doc dir";
  if (unit === undefined || unit === "" || /[*?[\]{}]/.test(unit)) {
    return `must name ONE concrete ${unitWord} after "${root}/" — a wildcard segment spans the whole repo ("${glob}")`;
  }
  return null;
}

const PathWriteScopeConfigSchema = z
  .object({
    testGlobs: z.array(z.string().min(1)).min(1),
    sourceGlobs: z.array(z.string().min(1)).min(1),
  })
  .strict()
  // ADR-0087: every declared write-scope glob (test AND source) must stay within ONE concrete
  // package/app — the structural bound that replaces PR-diff review as the control on a
  // self-registered node's scope. The phase wall still ENFORCES the scope spine-side; this just
  // refuses an over-broad DECLARATION before it can ever resolve. ({@link scopeGlobBoundIssue} is the
  // pure, unit-tested judge.)
  .superRefine((scope, ctx) => {
    for (const key of ["testGlobs", "sourceGlobs"] as const) {
      const globs = scope[key];
      // A missing / non-array glob list is the base schema's error to report — only judge a
      // well-formed one here, so a malformed scope fails with the base (zod) error and stays a
      // graceful per-spec skip, never a TypeError thrown out of this refine.
      if (!Array.isArray(globs)) continue;
      globs.forEach((glob, index) => {
        if (typeof glob !== "string") return;
        const issue = scopeGlobBoundIssue(glob);
        if (issue !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key, index],
            message: `over-broad scope glob — ${issue} (ADR-0087: a spec-borne write scope must stay within a single package/app, not bounded by PR-diff review).`,
          });
        }
      });
    }
  });

const RealProofConfigSchema = z
  .object({
    testFile: z.string().min(1),
    sourceFile: z.string().min(1),
    scope: PathWriteScopeConfigSchema,
    install: z.boolean().optional(),
    typecheck: ShellCommandSchema.optional(),
    proofCommand: ShellCommandSchema.optional(),
    editsExisting: z.boolean().optional(),
    refactorForTests: z.boolean().optional(),
    db: z.boolean().optional(),
    addDeps: z.array(z.string().min(1)).optional(),
  })
  .strict()
  // ADR-0064 §2: a `pnpm add` needs the workspace installed first, and a freshly-added dependency
  // must be typecheckable — so addDeps requires install:true (which in turn requires real.typecheck).
  .refine((r) => !(r.addDeps !== undefined && r.addDeps.length > 0 && r.install !== true), {
    message:
      "real.addDeps requires real.install:true — `pnpm add` runs after the lockfile-only base " +
      "install, and the added dependency must be typecheckable (install:true requires real.typecheck, " +
      "ADR-0064 §2).",
    path: ["addDeps"],
  })
  // ADR-0064 §2: a dep spec starting with `-` would inject a `pnpm add` flag — the spine controls the
  // flags, the author declares package specs only. Refuse leading-dash entries (defence in depth; the
  // add is an execFile arg vector, never a shell string, so this is belt-and-braces honesty).
  .refine((r) => (r.addDeps ?? []).every((d) => !d.startsWith("-")), {
    message:
      "real.addDeps entries must be package specs (e.g. `tree-sitter`, `tree-sitter@0.21.0`), not " +
      "flags — a leading `-` is refused (the spine controls the `pnpm add` flags, ADR-0064 §2).",
    path: ["addDeps"],
  })
  // ADR-0064: a db-backed proof imports a @storytree/*/store subpath / pg / the Cloud SQL connector
  // from node_modules — a bare (no-install) worktree has none, so the proof would crash before it
  // could connect. db:true therefore requires install:true (which in turn requires real.typecheck).
  .refine((r) => !(r.db === true && r.install !== true), {
    message:
      "real.db:true requires real.install:true — a db-backed proof imports a @storytree/*/store subpath / pg / " +
      "the Cloud SQL connector from node_modules, which a bare worktree does not have (and " +
      "install:true then requires real.typecheck, ADR-0064).",
    path: ["db"],
  })
  .refine((r) => !(r.install === true && r.typecheck === undefined), {
    message:
      "install:true requires real.typecheck (the proof run is tsx — types are stripped; only " +
      "tsc --noEmit catches type-illegal-but-runtime-green code, ADR-0031 §2)",
    path: ["typecheck"],
  })
  // B (ADR-0057 §3): the spine FORCES the proof cwd to the worktree root — a declared cwd is refused
  // so a proof can never redirect out of its own worktree (declare file+args only).
  .refine((r) => r.proofCommand?.cwd === undefined, {
    message:
      "real.proofCommand.cwd is not allowed — the spine forces cwd to the worktree root so the " +
      "proof cannot redirect out of its own worktree (declare file+args only)",
    path: ["proofCommand", "cwd"],
  })
  // B: a `pnpm` proof command needs the worktree's node_modules — so it REQUIRES install:true (a
  // bare no-install worktree has none and the command would spurious-red). Scoped to pnpm, so a
  // builtins-only `node`/shell proof command stays legitimately install-free.
  .refine((r) => !(r.proofCommand?.file === "pnpm" && r.install !== true), {
    message:
      "a pnpm proof command requires real.install:true — the worktree has no node_modules without " +
      "it (and install:true then requires real.typecheck). Use a node-based command for an " +
      "install-free proof.",
    path: ["proofCommand"],
  })
  // C (ADR-0057 §3, expansion C): the default node:test proof runs ONE file (`testFile`) and cannot
  // OBSERVE a regression that lives in a DIFFERENT edited source. So an edit-existing node whose
  // source scope reaches BEYOND the single spotlight `sourceFile` MUST declare an explicit
  // `real.proofCommand` rather than ride the default single-file proof — forcing the author to NAME a
  // proof for the multi-file edit. (This forces author INTENT; it does NOT structurally verify the
  // declared command exercises every edited file — that residual bound is PR-diff review, the same
  // control A/B took for scope/command.) The exemption is narrow: a single source glob that is the
  // LITERAL `sourceFile` AND carries no `*` wildcard (so it matches exactly one file) stays legal on
  // the default command — the one test file imports the one edited file, exactly as a net-new node
  // does. A single WILDCARD glob is length-1 yet can match MANY files, so it counts as broad even
  // when it equals `sourceFile`, and likewise requires a suite (the wildcard-glob tightening, owner
  // call 2026-06-21 — closes the length-1-but-broad hole the conservative literal-equality predicate
  // left open). Scoped to editsExisting:true, so it never fires on a net-new node — the 7 migrated
  // nodes (no `editsExisting`) keep resolving byte-for-byte, parity intact.
  .refine(
    (r) =>
      !(
        r.editsExisting === true &&
        r.proofCommand === undefined &&
        !(
          r.scope.sourceGlobs.length === 1 &&
          r.scope.sourceGlobs[0] === r.sourceFile &&
          !r.sourceFile.includes("*")
        )
      ),
    {
      message:
        "an edits-existing node whose source scope is broader than a single literal `sourceFile` " +
        "must declare real.proofCommand (a suite) — the default node:test on the single test file " +
        "cannot observe a regression across the other edited source files (the proof must exercise " +
        "the edited code). A single WILDCARD glob (containing `*`) counts as broad even when it " +
        "equals `sourceFile`, since it can match many files.",
      path: ["proofCommand"],
    },
  )
  // R2 (ADR-0098 d.2): refactor-for-testability earns its green from the WHOLE PACKAGE SUITE (the
  // regression wall — CONFIRM_GREEN means the new test passes AND nothing regressed). The default
  // single-file node:test cannot be that wall, so an R2 arm MUST declare a `proofCommand` (the suite).
  .refine((r) => !(r.refactorForTests === true && r.proofCommand === undefined), {
    message:
      "real.refactorForTests:true requires real.proofCommand (the whole package suite is the " +
      "regression wall — CONFIRM_GREEN means the new test passes AND nothing regressed, ADR-0098 d.2). " +
      "The default single-file node:test cannot be that wall.",
    path: ["proofCommand"],
  })
  // R2 (ADR-0098 d.1): refactorForTests and editsExisting are MUTUALLY EXCLUSIVE brief axes —
  // editsExisting changes behaviour (a runtime-assertion red); refactorForTests preserves it (a
  // structural / missing-symbol red). A node is one or the other, never both.
  .refine((r) => !(r.refactorForTests === true && r.editsExisting === true), {
    message:
      "real.refactorForTests and real.editsExisting are mutually exclusive — editsExisting changes " +
      "behaviour (a runtime-assertion red), refactorForTests preserves it (a structural/missing-symbol " +
      "red). Pick one brief axis (ADR-0098 d.1).",
    path: ["refactorForTests"],
  });

/** The spec-borne `proof:` block schema — mirrors {@link NodeBuildConfig} 1:1. */
export const NodeBuildConfigSchema = z
  .object({
    command: ShellCommandSchema,
    scope: PathWriteScopeConfigSchema,
    real: RealProofConfigSchema.optional(),
  })
  .strict();

// Explicit construction (not a bare cast of `z.infer`): under exactOptionalPropertyTypes a
// zod-inferred `field?: T | undefined` is NOT assignable to the canonical `field?: T`, and a parsed
// object carrying explicit `undefined` keys would also break the parity `deepEqual` against the
// registry literals. Rebuilding each object — spreading optionals only when present — yields a value
// byte-for-byte equal to a hand-written registry entry. These builders ARE the drift-lock: if the
// schema's inferred shape ever stops fitting the canonical interface, they stop compiling.

function buildShellCommand(raw: z.infer<typeof ShellCommandSchema>): ShellCommand {
  return {
    file: raw.file,
    args: [...raw.args],
    ...(raw.cwd !== undefined ? { cwd: raw.cwd } : {}),
  };
}

function buildScope(raw: z.infer<typeof PathWriteScopeConfigSchema>): PathWriteScopeConfig {
  return { testGlobs: [...raw.testGlobs], sourceGlobs: [...raw.sourceGlobs] };
}

function buildReal(raw: z.infer<typeof RealProofConfigSchema>): RealProofConfig {
  return {
    testFile: raw.testFile,
    sourceFile: raw.sourceFile,
    scope: buildScope(raw.scope),
    ...(raw.install !== undefined ? { install: raw.install } : {}),
    ...(raw.typecheck !== undefined ? { typecheck: buildShellCommand(raw.typecheck) } : {}),
    ...(raw.proofCommand !== undefined ? { proofCommand: buildShellCommand(raw.proofCommand) } : {}),
    // C (ADR-0057 §3): spread ONLY when present — absent-not-undefined, so a net-new node's config
    // stays byte-for-byte deepEqual to its registry twin (the established parity drift-lock idiom).
    ...(raw.editsExisting !== undefined ? { editsExisting: raw.editsExisting } : {}),
    // R2 (ADR-0098): same absent-not-undefined idiom — a non-R2 node's config stays byte-for-byte
    // deepEqual to its registry twin (the parity drift-lock holds).
    ...(raw.refactorForTests !== undefined ? { refactorForTests: raw.refactorForTests } : {}),
    // ADR-0064: same absent-not-undefined idiom, so the 7 migrated nodes (no `db`) stay deepEqual
    // to their registry twins (the contract-4 parity oracle holds byte-for-byte).
    ...(raw.db !== undefined ? { db: raw.db } : {}),
    // ADR-0064 §2: spread (a fresh copy) only when present — absent stays absent for the parity lock.
    ...(raw.addDeps !== undefined ? { addDeps: [...raw.addDeps] } : {}),
  };
}

/**
 * Parse + validate an untyped `proof:` frontmatter value into a {@link NodeBuildConfig}. Throws
 * (loud) on any malformed block — `loadNodeSpec` wraps the throw with the file path. A `proof:` key
 * that is ABSENT must NOT reach here: absence is the fail-closed default (no build config), not an
 * empty config.
 */
export function parseNodeBuildConfig(raw: unknown): NodeBuildConfig {
  const parsed = NodeBuildConfigSchema.parse(raw);
  return {
    command: buildShellCommand(parsed.command),
    scope: buildScope(parsed.scope),
    ...(parsed.real !== undefined ? { real: buildReal(parsed.real) } : {}),
  };
}
