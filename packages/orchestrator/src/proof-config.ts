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
   * below: edit-existing + a source scope broader than `sourceFile` REQUIRES an explicit
   * `proofCommand` declaration (it forces the author to NAME a proof for the multi-file edit; whether
   * that command actually exercises every edited file is the same PR-diff-review bound A/B took for
   * scope/command — surfaced, not structurally verified).
   */
  editsExisting?: boolean;
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
 * over-declared spec scope (vs the registry status quo of PR-diff review) is a deliberately deferred
 * owner call — see ADR-0057's escalation note.
 */
const ShellCommandSchema = z
  .object({
    file: z.string().min(1),
    args: z.array(z.string()),
    cwd: z.string().min(1).optional(),
  })
  .strict();

const PathWriteScopeConfigSchema = z
  .object({
    testGlobs: z.array(z.string().min(1)).min(1),
    sourceGlobs: z.array(z.string().min(1)).min(1),
  })
  .strict();

const RealProofConfigSchema = z
  .object({
    testFile: z.string().min(1),
    sourceFile: z.string().min(1),
    scope: PathWriteScopeConfigSchema,
    install: z.boolean().optional(),
    typecheck: ShellCommandSchema.optional(),
    proofCommand: ShellCommandSchema.optional(),
    editsExisting: z.boolean().optional(),
  })
  .strict()
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
  // control A/B took for scope/command.) Single-file edit-existing (`sourceGlobs === [sourceFile]`)
  // stays legal on the default command (the one test file imports the one edited file, exactly as a
  // net-new node does). Scoped to editsExisting:true, so it never fires on a net-new node — the 7
  // migrated nodes (no `editsExisting`) keep resolving byte-for-byte, parity intact.
  .refine(
    (r) =>
      !(
        r.editsExisting === true &&
        r.proofCommand === undefined &&
        !(r.scope.sourceGlobs.length === 1 && r.scope.sourceGlobs[0] === r.sourceFile)
      ),
    {
      message:
        "an edits-existing node whose source scope is broader than `sourceFile` must declare " +
        "real.proofCommand (a suite) — the default node:test on the single test file cannot observe " +
        "a regression across the other edited source files (the proof must exercise the edited code).",
      path: ["proofCommand"],
    },
  );

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
