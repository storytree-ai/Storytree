/**
 * The terminal CLI capture composition — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0235 / ADR-0241).
 *
 * The one entry point the CLI calls: resolve the trace directory, call
 * `terminal-boundary-observations`'s pure observer (`observeCliInvocation`), and hand the result
 * to `traversal-trace-sink`'s synchronous append. Also exposes the thin query composition
 * (`showTraversalSession` / `listTraversalSessionsRendered`) that reads through the sink and
 * renders through `traversal-session-query`.
 *
 * Capture is additive and fail-silent, never fail-closed (ADR-0241 D3): this module never throws
 * (every filesystem edge is already absorbed by the sink) and its only side effect is appending
 * bytes — it never touches the envelope or the exit code. Identity is resolved by the CLI and
 * passed IN — this package must not depend on `@storytree/drive` for `deriveIdentity()`, which
 * keeps its runtime deps to zod and the increment-1 vocabulary.
 */
import { randomUUID } from "node:crypto";

import {
  descendAgentRefs,
  renderCoverageCaveats,
  AGENT_DESCENT_CAVEATS,
  AGENT_DESCENT_COVERAGE,
} from "./descend-agent-refs.js";
import { observeCliInvocation } from "./observe-cli.js";
import { renderTraversalSession, renderTraversalSessions } from "./query-render.js";
import { linkRevisits } from "./revisit-links.js";
import type { TraceIdentityGrade } from "./session-identity.js";
import {
  appendTraversalEvents,
  listTraversalSessions,
  readTraversalSession,
  resolveTraversalDir,
} from "./sink.js";

const TRAVERSAL_TOGGLE_ENV = "STORYTREE_TRAVERSAL";

/** What the CLI boundary hands the capture composition for one invocation. */
export interface CaptureCliInvocationInput {
  /** The invocation's argv with the pnpm `--` separator already stripped. */
  readonly argv: readonly string[];
  /** The envelope's own outcome — observation is success-only (`ok: false` observes nothing). */
  readonly ok: boolean;
  /**
   * The resolved session identity, or null when none resolves (the main checkout, CI, the lobby).
   * Null must capture NOTHING — an absent identity is a normal, silent no-op, never an error.
   */
  readonly sessionId: string | null;
  /**
   * How well {@link sessionId} names ONE context window (`linked-session-context-arc-inc-30`).
   * Stamped on every line this invocation writes, so a later reader can say what the trace's id
   * IS rather than inferring it from the id's shape. Absent = unstated, which a reader treats as
   * the legacy slot era.
   */
  readonly grade?: TraceIdentityGrade;
  /**
   * The worktree slot this invocation ran in — recorded beside the identity as a GROUPING
   * attribute. It is genuinely useful (it says which worktree a window was working in); it is
   * simply not an identity, which is the whole correction inc-30 makes.
   */
  readonly slot?: string | null;
  /** Overrides the resolved trace directory; defaults to {@link resolveTraversalDir}. */
  readonly dir?: string;
  /** Overrides the `STORYTREE_TRAVERSAL=off` opt-out check. */
  readonly enabled?: boolean;
  /** Injected clock, so the composition stays testable. */
  readonly now?: () => Date;
  /** Injected id source for visit identity. */
  readonly nextId?: () => string;
  /**
   * The floor-ref ids an `agents <name>` essentials render resolved, in render order — resolved by
   * the CALLER (it needs an async store read, and this entry point is contractually synchronous).
   * Empty or absent for every other dispatch shape, which is the normal case.
   */
  readonly agentRefIds?: readonly string[];
  /**
   * The canonical ids a SEARCH-shaped invocation returned, taken from the envelope the command
   * already built (`Envelope.observedResultIds`, ADR-0484 D3).
   *
   * Resolved by the CALLER for the same reason `agentRefIds` is: the observer is pure and cannot run
   * the search, and re-running it here would put a second whole-corpus scan behind a read. Absent
   * for every non-search shape, which is the normal case.
   *
   * `| undefined` explicitly, not merely optional: the CLI passes the envelope's field straight
   * through, and the absent-vs-empty decision is made HERE — beside the same decision for `grade`
   * and `slot` — rather than by a branch in the entry point that nothing can reach in a test.
   */
  readonly resultNodeIds?: readonly string[] | undefined;
}

/** Where the query composition reads a captured session from. */
export interface TraversalQueryOptions {
  /** Overrides the resolved trace directory; defaults to {@link resolveTraversalDir}. */
  readonly dir?: string;
}

/** The rendered body the CLI's `traversal` area prints. Structurally the CLI's own Envelope. */
interface RenderedEnvelope {
  readonly ok: boolean;
  readonly body: string;
  readonly next?: readonly string[];
}

/**
 * Whether capture is enabled for this invocation: an explicit `enabled` override wins, else
 * `STORYTREE_TRAVERSAL=off` opts out, else capture is on by default.
 *
 * Still exported for the CLI, though the reason narrowed with ADR-0464 D1. It used to be asked BEFORE
 * the render, because a render that printed an offer id under `STORYTREE_TRAVERSAL=off` would hand out
 * an id nothing recorded (ADR-0260 D3). Nothing is printed now, so what remains is ADR-0241 **D2**'s
 * opt-out-clean envelope: an opted-out run must write no trace and read back byte-identical. (D2 is
 * the opt-out clause; D3's envelope promise covers only telemetry FAILURE.)
 */
export function isTraversalCaptureEnabled(override?: boolean): boolean {
  if (override !== undefined) return override;
  return process.env[TRAVERSAL_TOGGLE_ENV] !== "off";
}

/** The WRITABLE draft of `TraversalSinkLocation`'s two identity attributes. The sink's own members
 *  are `readonly`, so an attribute that is only sometimes declared is collected here and spread
 *  into the location — an ABSENT key is what leaves the appended lines unlabelled. */
interface SinkIdentityDraft {
  grade?: TraceIdentityGrade;
  slot?: string | null;
}

/**
 * Ambient capture of one terminal invocation's allowlisted READS.
 *
 * Opt-out-clean (ADR-0241 D2): with capture off, or no resolvable session identity,
 * this is a silent no-op — no directory is resolved, no file is created. Additive and fail-silent
 * (ADR-0241 D3) is the separate promise that no telemetry FAILURE may change a caller's control flow,
 * exit code, or envelope. Otherwise it observes the
 * invocation through the pure `terminal-cli-dispatch` adapter and appends whatever it finds
 * (possibly zero events) through the sink. Never throws — the sink itself never throws, and every
 * step here is synchronous.
 */
export function captureCliInvocation(input: CaptureCliInvocationInput): void {
  if (!isTraversalCaptureEnabled(input.enabled)) return;
  if (input.sessionId === null) return;

  const sessionId = input.sessionId;
  const now = input.now ?? (() => new Date());
  const nextId = input.nextId ?? (() => randomUUID());

  // Every visit mints its own id. Until ADR-0464 D1 the FIRST one could be handed a pre-minted id by
  // the CLI, because the offer id a render had already PRINTED had to be the one recorded beside it.
  // With no offer printed there is nothing to agree with, so the pre-mint and the argv-stripping pass
  // that fed it both went with the surface: `observeCliInvocation` now sees this invocation's argv
  // exactly as the shell handed it over.
  const nextVisitId = (): string => nextId();

  // `resultNodeIds` passes straight through, `undefined` included: the observer reads it only on a
  // SEARCH shape and treats absent as none, so there is nothing for a branch here to decide. What
  // keeps `resultNodeIds: []` on a written line meaning "this search matched nothing" is upstream —
  // every search-classified verb sets `Envelope.observedResultIds`, and `cli-read-verbs.test.ts`
  // drives each one and reds if it does not.
  const events = observeCliInvocation(input.argv, {
    ok: input.ok,
    sessionId,
    nextVisitId,
    now,
    resultNodeIds: input.resultNodeIds,
  });
  if (events.length === 0) return;

  // DESCEND first, then LINK: the descent mints the child visits, and linking afterwards lets a
  // repeat `agents <name>` name the earlier occurrence of BOTH the agent visit and each of its
  // children. Linking first would leave every child unlinked, since none existed yet.
  const descended = descendAgentRefs(events, input.agentRefIds ?? [], {
    sessionId,
    nextVisitId,
    now,
  });

  const dir = input.dir ?? resolveTraversalDir();
  // A revisit link needs the session's EARLIER visits, which live only in the trace already on disk
  // (each invocation is its own process). Read them back through the sink's tolerant reader — a
  // missing or partly-corrupt file replays as whatever IS readable, so a bad line costs at most a
  // link, never the append. Ordering, never `at`: `readTraversalSession` returns append order, which
  // is the only "earlier" this producer is allowed to know (ADR-0235).
  const { replay } = readTraversalSession({ dir, sessionId });
  // An undeclared grade / slot stays ABSENT: `appendTraversalEvents` stamps an identity attribute
  // only for the keys it is given, so absence is what leaves the line unlabelled. Drafted in its
  // own writable bag because `TraversalSinkLocation`'s members are `readonly`.
  const identity: SinkIdentityDraft = {};
  if (input.grade !== undefined) identity.grade = input.grade;
  if (input.slot !== undefined) identity.slot = input.slot;
  appendTraversalEvents(linkRevisits(descended, replay.events), { dir, sessionId, ...identity });
}

/**
 * Replay one captured session for `storytree traversal show <sessionId>`.
 *
 * The sink persists events only, never coverage declarations, so this composition — the only place
 * that knows which adapter captured through the terminal CLI — declares `terminal-cli-dispatch`'s
 * coverage for the render itself. It declares the OUTERMOST composed coverage, not
 * `observe-cli.ts`'s base: the base honestly describes the bare argv observer, which emits neither
 * `field:prior_visit_id` nor `field:parent_visit_id`, while what this composition actually writes to
 * disk emits both (`captureCliInvocation` above links revisits AND descends an `agents <name>`
 * render's floor refs).
 *
 * ADR-0464 D1 moved this import INWARD for the first time — every earlier increment moved it out.
 * `FOLLOW_OFFER_EDGE_COVERAGE` and `OFFER_CANDIDATE_SET_COVERAGE` were deleted with the offer
 * surface, so `AGENT_DESCENT_COVERAGE` is the outermost composed layer again, and it declares
 * `event:candidate_set` and `event:followed_edge` OMITTED — which is now simply true. Declaring the
 * retired outer layer here would claim two event kinds this composition can no longer write: the
 * mirror image of the self-denial ADR-0235 clause 6 forbids, and just as misleading.
 *
 * The declaration carries its CAVEATS too, not just the supported/omitted lists (ADR-0235 clause 6).
 * The closed feature enum can say those two kinds are omitted; it cannot say that the omission is a
 * DELIBERATE RETIREMENT rather than an unbuilt adapter, nor that reconstructing the lost causality by
 * joining a read to an earlier render is REFUSED rather than merely unimplemented (ADR-0260 D4, which
 * outlives the mechanism it was written for). {@link AGENT_DESCENT_CAVEATS} says both, so a reader
 * who sees a tidy tree can still see, in the same body, what it does not show and why nobody may
 * reconstruct it.
 */
export function showTraversalSession(sessionId: string, opts?: TraversalQueryOptions): RenderedEnvelope {
  const dir = opts?.dir ?? resolveTraversalDir();
  const { replay, skipped, identity, slots } = readTraversalSession({ dir, sessionId });
  const rendered = renderTraversalSession(
    { ...replay, coverage: [AGENT_DESCENT_COVERAGE] },
    { skipped, identity, slots },
  );
  const caveats = renderCoverageCaveats(AGENT_DESCENT_CAVEATS);
  return { ...rendered, body: `${rendered.body}\n\ncoverage-caveats:\n${caveats}` };
}

/**
 * Render the captured-session index for `storytree traversal list`.
 */
export function listTraversalSessionsRendered(opts?: TraversalQueryOptions): RenderedEnvelope {
  const dir = opts?.dir ?? resolveTraversalDir();
  const list = listTraversalSessions({ dir });
  return renderTraversalSessions(list);
}
