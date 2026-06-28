// The build worker — relocated from apps/studio/server into @storytree/drive (ADR-0133 d.3,
// capability worker-relocation). It holds the run-lifecycle + worker machinery a UI-driven build needs:
// the BuildRegistry (the in-memory run lifecycle), runBuildJob + the routed/adopt runner family (the
// fire-and-forget worker boundary), the BuildContext seam, and dispatchAcceptedBuild (the chat accept→
// dispatch). This used to live in apps/studio/server; ADR-0100 forbids an app importing another app's
// server, so the desktop (where chat ships) could not reach it. Moving it DOWN into this shared package —
// which both the studio server AND the desktop local backend may import — is what makes the desktop build
// mount legal (capability 2). The move is byte-for-byte the existing worker; behaviour is unchanged.
//
// THE WALL (ADR-0100, capability worker-relocation `wr-imports-nothing-from-apps`): this module imports
// NOTHING from apps/* — only node:crypto (for the registry) + the build entries it drives are INJECTED
// (the RoutedBuildDeps / BuildContext shape), never imported from a surface. That is the property the
// whole desktop-build-mount story rests on.
//
// PROOF INTEGRITY (ADR-0091): the registry/worker/dispatch hold NO signing key and NO verdict path. The
// spine inside the dispatched build (nodeBuild/storyBuild → proveUnit) observes RED→GREEN from real exit
// codes and SIGNS; CI re-proves green before trunk (ADR-0022). Duplicating any gate logic here would be a
// second, unproven proof path — the forge risk ADR-0091's "no verdict is ever handed in" forbids.

import { randomUUID } from 'node:crypto';

// ── BuildRegistry — the in-memory run lifecycle for UI-driven builds (ADR-0090 Phase 1) ──────────────
//
// WHAT IT IS: a small state organ. It holds the live build runs the worker drives, captures the COARSE
// progress each build emits (phase/status/verdict LINES, never the raw model stream), and records the
// terminal envelope. It owns NO proof logic — the build's spine still observes red→green and SIGNS; the
// registry never produces a verdict.
//
// PHASE-1 SHAPE (deliberate, do not over-build):
//  • ONE build at a time — `createRun` refuses (typed result, the API maps to 409) while a run is
//    non-terminal. Multi-run concurrency is later-phase work.
//  • IN-MEMORY only — there is no DB table for runs; the transcript is ephemeral progress, gone on a
//    server restart. The DURABLE artifact is the signed verdict the build persists to events.verdict.
//  • BOUNDED — the transcript is capped in line count and per-line length so a runaway build cannot
//    grow the buffer unbounded.

/** A build run's lifecycle state: in flight, or one of the two terminal outcomes. */
export type BuildRunStatus = 'building' | 'passed' | 'failed';

/** One UI-driven build run. `envelope`/`reason` appear only at the matching terminal state. */
export interface BuildRun {
  runId: string;
  unitId: string;
  status: BuildRunStatus;
  /** Coarse progress lines, oldest-first, bounded by the registry's caps. */
  transcript: string[];
  /** ISO start time. */
  startedAt: string;
  /** ISO terminal time (present once terminal). */
  endedAt?: string;
  /** The final build envelope body (formatted text) — present only on a `passed` run. */
  envelope?: string;
  /** The failure reason — present only on a `failed` run. */
  reason?: string;
}

/** `createRun` either mints a run, or refuses (single-build-at-a-time) with a reason. */
export type CreateRunResult = { ok: true; run: BuildRun } | { ok: false; reason: string };

/** Registry caps (defaulted; overridable in tests). */
export interface BuildRegistryOptions {
  /** Max transcript lines retained per run (most-recent kept when exceeded). */
  maxLines?: number;
  /** Max characters per transcript line (longer lines are truncated). */
  maxLineChars?: number;
}

const DEFAULT_MAX_LINES = 500;
const DEFAULT_MAX_LINE_CHARS = 2_000;

/** Collapse a value into ONE coarse display line: strip control chars / newlines, trim, truncate. */
function normaliseLine(line: string, maxChars: number): string {
  const flat = line.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > maxChars ? flat.slice(0, maxChars) : flat;
}

export class BuildRegistry {
  readonly #runs = new Map<string, BuildRun>();
  /** The id of the one non-terminal run, or null when nothing is building (the Phase-1 guard). */
  #activeRunId: string | null = null;
  readonly #maxLines: number;
  readonly #maxLineChars: number;

  constructor(opts: BuildRegistryOptions = {}) {
    this.#maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.#maxLineChars = opts.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
  }

  /** True while a build is in flight — the single-build guard (`createRun` refuses meanwhile). */
  hasActiveBuild(): boolean {
    return this.#activeRunId !== null;
  }

  /**
   * Mint a fresh `building` run for `unitId`, or REFUSE (typed, never thrown) when one is already
   * live. Phase-1 single-build-at-a-time: the API maps the refusal to 409.
   */
  createRun(unitId: string): CreateRunResult {
    if (this.#activeRunId !== null) {
      return { ok: false, reason: 'a build is already running' };
    }
    const run: BuildRun = {
      runId: randomUUID(),
      unitId,
      status: 'building',
      transcript: [],
      startedAt: new Date().toISOString(),
    };
    this.#runs.set(run.runId, run);
    this.#activeRunId = run.runId;
    return { ok: true, run: this.#clone(run) };
  }

  /**
   * Append ONE coarse line to a non-terminal run (normalised to a single display line, truncated to
   * the per-line cap). No-op for an unknown or terminal run — a terminalised run accepts no more
   * appends. When the line cap is exceeded the OLDEST line is dropped (most-recent retained).
   */
  appendLine(runId: string, line: string): void {
    const run = this.#runs.get(runId);
    if (run === undefined || run.status !== 'building') return;
    run.transcript.push(normaliseLine(line, this.#maxLineChars));
    if (run.transcript.length > this.#maxLines) {
      run.transcript.splice(0, run.transcript.length - this.#maxLines);
    }
  }

  /** Terminalise a run as PASSED with its final envelope body; unblocks the next build. */
  terminalisePassed(runId: string, envelope: string): void {
    this.#terminalise(runId, (run) => {
      run.status = 'passed';
      run.envelope = envelope;
    });
  }

  /** Terminalise a run as FAILED with its reason (no signed verdict); unblocks the next build. */
  terminaliseFailed(runId: string, reason: string): void {
    this.#terminalise(runId, (run) => {
      run.status = 'failed';
      run.reason = reason;
    });
  }

  /** A snapshot of a run (deep-copied transcript so callers can't mutate registry state), or undefined. */
  getRun(runId: string): BuildRun | undefined {
    const run = this.#runs.get(runId);
    return run === undefined ? undefined : this.#clone(run);
  }

  #terminalise(runId: string, apply: (run: BuildRun) => void): void {
    const run = this.#runs.get(runId);
    if (run === undefined || run.status !== 'building') return;
    apply(run);
    run.endedAt = new Date().toISOString();
    if (this.#activeRunId === runId) this.#activeRunId = null;
  }

  #clone(run: BuildRun): BuildRun {
    return { ...run, transcript: [...run.transcript] };
  }
}

// ── The build worker — drives one UI-triggered build fire-and-forget (ADR-0090 Phase 1) ──────────────
//
// THE WORKER IS THE SINGLE ORCHESTRATOR BOUNDARY (ADR-0090 d.2 / ADR-0004 / ADR-0091): it invokes the
// EXISTING public build entry — `nodeBuild`/`storyBuild` (the same things the CLI runs) — and reaches
// inside NOTHING (not the gate, not the spine, not the SDK leaf). The worker never produces or persists a
// verdict. It only: feed the build's COARSE progress into the run's transcript, then terminalise the run
// with the envelope. The runner is INJECTED so this module is fully offline-testable.

/**
 * The build result the worker consumes — structurally the CLI's `Envelope` ({ ok, body, next? }),
 * declared locally so this module needs no import of the build entry's full module. The production
 * adapter coerces the real `Envelope` to this shape.
 */
export interface BuildEnvelope {
  ok: boolean;
  body: string;
  /** `readonly` to match the CLI's `Envelope.next` so the real envelope is assignable without a cast. */
  next?: readonly string[];
}

/**
 * Drives one build. `sink` receives COARSE progress lines as the build emits them (the worker
 * forwards each to the run's transcript). Resolves with the final {@link BuildEnvelope}; a thrown
 * error is treated as a failed build.
 */
export type BuildRunner = (unitId: string, sink: (line: string) => void) => Promise<BuildEnvelope>;

/** The Phase-1 options the worker passes to `nodeBuild` — single node, live mode, pg verdict store. */
export interface NodeBuildLikeOpts {
  live: boolean;
  /** ADR-0099-B: optional — a `--live` smoke must NOT persist, so the node runner omits it (in-memory). */
  verdictStore?: string;
  real?: boolean;
  dryRun?: boolean;
  actor?: string;
}

/** The `nodeBuild` entry the production runner adapts (structurally `(id, opts) => Promise<Envelope>`). */
export type NodeBuildLike = (unitId: string, opts: NodeBuildLikeOpts) => Promise<BuildEnvelope>;

/**
 * Run a build to a terminal state, streaming its coarse progress into `registry`'s run `runId`.
 * Never throws: a failed build (envelope not ok) or a thrown runner is recorded as a `failed`
 * terminal state, never an unhandled rejection (this is started fire-and-forget). The registry's
 * single-build guard is released when the run terminalises.
 */
export async function runBuildJob(
  registry: BuildRegistry,
  runId: string,
  unitId: string,
  runner: BuildRunner,
): Promise<void> {
  registry.appendLine(runId, `▸ build started: ${unitId}`);
  try {
    const envelope = await runner(unitId, (line) => registry.appendLine(runId, line));
    // Append the envelope body as coarse lines BEFORE terminalising (a terminal run accepts no more
    // appends) so the final transcript carries the phase trail + verdict line.
    for (const line of envelope.body.split('\n')) registry.appendLine(runId, line);
    if (envelope.ok) {
      registry.terminalisePassed(runId, envelope.body);
    } else {
      registry.terminaliseFailed(runId, failureReason(envelope.body));
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    registry.appendLine(runId, `✗ ${reason}`);
    registry.terminaliseFailed(runId, reason);
  }
}

/** A concise failure line lifted from a non-ok envelope body (falls back to a generic message). */
function failureReason(body: string): string {
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /verdict:\s*NONE|failed|refus|error/i.test(l));
  return line ?? 'build failed';
}

/**
 * Adapt the existing `nodeBuild` entry into a {@link BuildRunner} with the Phase-1 options pinned:
 * single-node `--live` (a real SDK leaf authors through the real gate), NON-persisting.
 *
 * **ADR-0099-B: a `--live` smoke must not persist a (forged) green.** A single-node `--live` build runs
 * a synthetic `add(2,3)` task — it proves the GLUE, not the node's real feature — so its PASS may NEVER
 * land in `events.verdict` (that is the back-door ADR-0099 closes). The pinned `--store pg` is therefore
 * dropped: the smoke runs in-memory and persists nothing. The legitimate go-green stays the STATUS-AWARE
 * story-level affordance ADR-0094 already built — **Build** (`story build --real`, a real red→green) for
 * a `proposed` story, **Adopt** (reliability gates) for a `mapped` one — never a node smoke. `nodeBuild`
 * returns only its final envelope (it does not stream), so the `sink` is unused here; the "watch it run"
 * signal is the start marker + the final envelope. (Restoring a transient non-greening node wisp, or
 * routing node-Build to a real `--real` drive, are clean follow-ons, not honesty-wall work.)
 */
export function buildRunnerFromNodeBuild(nodeBuild: NodeBuildLike, actor?: string): BuildRunner {
  return async (unitId) =>
    nodeBuild(unitId, {
      live: true,
      ...(actor !== undefined ? { actor } : {}),
    });
}

// ── UI-driven ADOPT (ADR-0097) ──────────────────────────────────────────────

/** The `adoptStory` entry the production runner adapts (structurally `(id, opts) => Promise<Envelope>`). */
export type AdoptStoryLike = (storyId: string, opts: { actor?: string }) => Promise<BuildEnvelope>;

/**
 * Adapt the `adoptStory` entry into a {@link BuildRunner} (the adoption run rides the SAME registry +
 * `runBuildJob` as a build, so the client polls it identically). Emits one coarse mode line, then
 * defers to `adoptStory`'s envelope — which observe-and-signs the story's `observe` reliability gates
 * to `adopted` verdicts and flips it `mapped → proposed` (ADR-0097). `adoptStory` does not stream, so
 * the `sink` carries only the start marker; the verdict signal is the final envelope + the wisp/bloom.
 */
export function adoptRunnerFromAdoptStory(adoptStory: AdoptStoryLike, actor?: string): BuildRunner {
  return async (storyId, sink) => {
    sink('▸ adopt: observe-and-sign the story\'s observe reliability gates, flip mapped → proposed (ADR-0097)');
    return adoptStory(storyId, { ...(actor !== undefined ? { actor } : {}) });
  };
}

/** The build a unit id resolves to: a STORY drives a whole-story chain, anything else a single NODE. */
export type BuildKind = 'node' | 'story';

/** The options the worker passes to `storyBuild` — whole story, real mode, pg verdict store, auto-land. */
export interface StoryBuildLikeOpts {
  real: boolean;
  dryRun: boolean;
  verdictStore: string;
  actor?: string;
  /**
   * Open a NON-DRAFT PR for the green chain so CI auto-merges it to trunk (ADR-0022) — clicking Build
   * in the UI IS the approval to land. The worker always sets this for a UI-driven story build.
   */
  openPr?: boolean;
}

/** The `storyBuild` entry the production runner adapts (structurally `(id, opts) => Promise<Envelope>`). */
export type StoryBuildLike = (storyId: string, opts: StoryBuildLikeOpts) => Promise<BuildEnvelope>;

/** What {@link routedBuildRunner} composes: discovery + both public build entries (+ optional actor). */
export interface RoutedBuildDeps {
  /** Classify a unit id by tier — a story id routes to the whole-story chain, anything else a node. */
  classify: (unitId: string) => Promise<BuildKind>;
  nodeBuild: NodeBuildLike;
  storyBuild: StoryBuildLike;
  /** Optional signer/actor flag threaded to both entries (absent = the env-resolved signer). */
  actor?: string;
}

/**
 * A {@link BuildRunner} that routes by unit KIND (ADR-0090): a STORY id → `story build <id> --real`
 * — the honest whole-story chain (each node authored for real in a shared worktree, then the proven
 * chain promoted as a branch to land), which PERSISTS its real red→green verdicts (`--store pg`);
 * a NODE id → `node build <id> --live` — the single-node build that proves the PIPELINE on a synthetic
 * task (not the node's real feature), which must NOT persist (ADR-0099-B: a synthetic `--live` smoke
 * may never plant a forged green in `events.verdict`, so the node branch omits `verdictStore` and runs
 * in-memory — passing `--store pg` would be refused downstream as a synthetic walk, terminalising the
 * UI Build as FAILED). Discovery (`classify`) is injected, so this is fully offline-testable; the dev
 * front wires it over the orchestrator's spec discovery + the lazily-imported `nodeBuild`/`storyBuild`.
 * Emits ONE coarse mode line, then defers to the chosen entry's envelope.
 */
export function routedBuildRunner(deps: RoutedBuildDeps): BuildRunner {
  const actorOpt = deps.actor !== undefined ? { actor: deps.actor } : {};
  return async (unitId, sink) => {
    const kind = await deps.classify(unitId);
    if (kind === 'story') {
      sink('▸ mode: whole-story --real — authors each capability for real, then opens a PR that auto-merges to trunk');
      return deps.storyBuild(unitId, {
        real: true,
        dryRun: false,
        verdictStore: 'pg',
        openPr: true,
        ...actorOpt,
      });
    }
    // ADR-0099-B: a single-node `--live` smoke is SYNTHETIC (proves the pipeline on `add(2,3)`), so its
    // PASS must never persist — `verdictStore` is omitted (in-memory). Passing `--store pg` here is
    // refused downstream (`resolveVerdictStore`, a synthetic walk), which would terminalise the UI Build
    // as FAILED rather than run the smoke. The legitimate go-green is the STATUS-AWARE story affordance.
    sink('▸ mode: single-node --live — proves the build pipeline on a synthetic task');
    return deps.nodeBuild(unitId, { live: true, dryRun: false, real: false, ...actorOpt });
  };
}

// ── The chat-surface build dispatch (capability chat-build-dispatch, ADR-0108 d.3) ───────────────────
//
// `dispatchAcceptedBuild` is the mechanism the human's UI click drives after accepting a proposed unit
// id from the chat agent. It reuses the EXISTING worker machinery (`createRun` → `runBuildJob`) exactly
// as `handleBuild`'s POST branch does — the DIFFERENCE is shape, not behaviour: a plain function
// returning a typed result the chat surface folds into its stream, rather than an HTTP handler.
//
// SAFE WRITE — INTENT, NEVER A VERDICT (ADR-0091): the dispatch hands the worker a unit id; it never
// accepts, signs, or persists a verdict. The worker inside `runBuildJob` observes RED→GREEN from real
// exit codes and signs; CI re-proves green before trunk (ADR-0022). It holds no signing key and no DB
// connection.

/**
 * The build seam injected into the studio's `handleBuild` HTTP handler AND drivable directly by
 * `dispatchAcceptedBuild` (the chat surface). Lifted here from apps/studio/server/apiRouter.ts in the
 * worker relocation (ADR-0133 d.3) so both the studio server and the desktop local backend share ONE
 * BuildContext shape over the relocated worker.
 */
export interface BuildContext {
  registry: BuildRegistry;
  /** Drives one build (the worker); wired over the real `nodeBuild --live` in the dev front. */
  runner: BuildRunner;
  /** Whether `unitId` is a real buildable node — validated against the SAME discovery `node build` uses. */
  isBuildable(unitId: string): Promise<boolean>;
}

/** The typed result `dispatchAcceptedBuild` returns — folded into the chat stream by the caller. */
export type DispatchResult =
  | { ok: true; runId: string }
  | { ok: false; reason: string };

/**
 * Dispatch a human-ACCEPTED unit id to the existing build worker, returning a typed result the
 * chat surface folds into its stream.
 *
 * - Validates `unitId` is buildable via `build.isBuildable` (typed `not buildable` refusal if not).
 * - Mints a run via `build.registry.createRun` (typed `a build is already running` refusal on
 *   the single-build guard).
 * - Fires `runBuildJob` fire-and-forget — progress streams into the registry run; the chat surface
 *   reads it back via the run's transcript / the shared GET /api/build?runId poll.
 * - Returns `{ ok: true, runId }` so the caller can track the build.
 *
 * Never throws on a known outcome (mirrors `handleBuild`'s typed-result discipline).
 */
export async function dispatchAcceptedBuild(
  unitId: string,
  build: BuildContext,
): Promise<DispatchResult> {
  // Validate — a non-buildable / unknown unit id is a typed refusal; the worker is never spawned
  // against nothing (mirrors handleBuild's isBuildable guard / its 404 surfaced as a typed result).
  if (!(await build.isBuildable(unitId))) {
    return { ok: false, reason: 'not buildable' };
  }

  // Mint a run — the single-build-at-a-time guard surfaces as a typed refusal (mirrors the 409).
  const created = build.registry.createRun(unitId);
  if (!created.ok) {
    return { ok: false, reason: created.reason };
  }

  const { runId } = created.run;

  // Fire-and-forget: the worker streams coarse progress into the registry run; runBuildJob never
  // throws (it records a failed terminal state), so the floating promise can't reject.
  void runBuildJob(build.registry, runId, unitId, build.runner);

  return { ok: true, runId };
}
