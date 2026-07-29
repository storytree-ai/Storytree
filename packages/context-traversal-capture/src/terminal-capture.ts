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

import { descendAgentRefs } from "./descend-agent-refs.js";
import {
  emitFollowedEdge,
  parseOfferFollow,
  FOLLOW_OFFER_EDGE_CAVEATS,
  FOLLOW_OFFER_EDGE_COVERAGE,
} from "./follow-offer-edges.js";
import { observeCliInvocation } from "./observe-cli.js";
import { emitCandidateSet, renderCoverageCaveats } from "./offer-candidate-sets.js";
import { renderTraversalSession, renderTraversalSessions } from "./query-render.js";
import { linkRevisits } from "./revisit-links.js";
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
   * The onward artifact ids a `library artifact <id>` render OFFERED in its Sources block, in
   * authored order — resolved by the CALLER for the same reason `agentRefIds` is (it needs an async
   * store read, and this entry point is contractually synchronous). Empty or absent for every other
   * dispatch shape, which is the normal case.
   */
  readonly offeredIds?: readonly string[];
  /**
   * The visit id this invocation's `library artifact <id>` render must use — PRE-MINTED by the CLI
   * (ADR-0260 D3) so the offer id it already PRINTED in its own follow-up commands is the offer id
   * recorded here. A candidate set has no `visitId` field, so `candidate-set:<visitId>` is the only
   * carrier of which visit made the offer: mint it here instead and the printed id names a visit that
   * does not exist, which is an id nobody can return.
   *
   * Consumed once, by the FIRST visit this invocation observes — which for the offerable
   * `library artifact <id>` shape is the render visit itself, the only shape the CLI plans one for
   * (`planOfferIdentity`). Absent for every other shape, which is the normal case.
   */
  readonly offerVisitId?: string;
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
 * Exported because the CLI must ask the SAME question BEFORE it renders (ADR-0260 D3): a render that
 * printed an offer id under `STORYTREE_TRAVERSAL=off` would hand out an id nothing recorded, and would
 * also break ADR-0241 D3's opt-out-clean envelope for a trace that was never written.
 */
export function isTraversalCaptureEnabled(override?: boolean): boolean {
  if (override !== undefined) return override;
  return process.env[TRAVERSAL_TOGGLE_ENV] !== "off";
}

/**
 * Ambient capture of one terminal invocation's allowlisted READS.
 *
 * Additive and fail-silent (ADR-0241 D3): with capture off, or no resolvable session identity,
 * this is a silent no-op — no directory is resolved, no file is created. Otherwise it observes the
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

  // The FIRST visit takes the CLI's pre-minted id when there is one, so the offer id this invocation
  // already printed is the one it records (see `offerVisitId` above). Every later visit mints fresh.
  let pendingVisitId = input.offerVisitId;
  const nextVisitId = (): string => {
    if (pendingVisitId !== undefined) {
      const preMinted = pendingVisitId;
      pendingVisitId = undefined;
      return preMinted;
    }
    return nextId();
  };

  // The offer id an ANSWERING read carries rides in its own argv (ADR-0260 D3) — never resolved from
  // the trace. Stripping it here is load-bearing rather than tidy: `observeCliInvocation`'s allowlist
  // refuses any trailing token, so leaving the flag in place would make a followed read observe NO
  // VISIT AT ALL — the mechanism would delete the very read it exists to attribute.
  const { argv: readArgv, followed } = parseOfferFollow(input.argv);

  const events = observeCliInvocation(readArgv, {
    ok: input.ok,
    sessionId,
    nextVisitId,
    now,
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

  // DECLARE THE EDGE FIRST, then record what THIS read offers — the order the trace reads in: how we
  // got here, then what is now on the table. `followed` is null unless this invocation's own command
  // line named an offer, and this call is handed nothing else: no prior events, no reader, no trace
  // directory. A read that answered an offer without saying so records no edge, and no later pass may
  // correlate that gap away (ADR-0260 D4) — a thin tree is the honest cost.
  const answered = emitFollowedEdge(descended, followed, { sessionId, now });

  // RECORD THE OFFER, then link — and record it here, at the render, rather than anywhere later
  // (ADR-0260 D2). This call is handed only what THIS invocation observed plus what THIS render
  // offered; it can see nothing the session does next, which is what makes an offer with no follow
  // impossible to lose. Deferring it until something followed would silently rebuild the containment
  // tree ADR-0260 exists to replace.
  const offered = emitCandidateSet(answered, input.offeredIds ?? [], {
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
  appendTraversalEvents(linkRevisits(offered, replay.events), { dir, sessionId });
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
 * render's floor refs, AND records a `library artifact` render's offer, AND declares the edge an
 * offer-carrying read answered).
 *
 * The declaration carries its CAVEATS too, not just the supported/omitted lists (ADR-0260 D7 under
 * ADR-0235 clause 6). The closed feature enum can say `event:followed_edge` is emitted; it cannot say
 * WHY the picture will still be thin — that `doc:` offers can never be observed as followed, that a
 * follow is recorded only when the agent re-uses the offered form CARRYING the offer id, and that an
 * unanswered offer is indistinguishable from a bypassed mechanism. ADR-0260 D4 forbids ever repairing
 * those gaps by inference, so stating them here is the only mitigation there is: a reader who sees a
 * tidy tree must be able to see, in the same body, what it cannot show.
 */
export function showTraversalSession(sessionId: string, opts?: TraversalQueryOptions): RenderedEnvelope {
  const dir = opts?.dir ?? resolveTraversalDir();
  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  const rendered = renderTraversalSession({ ...replay, coverage: [FOLLOW_OFFER_EDGE_COVERAGE] }, { skipped });
  const caveats = renderCoverageCaveats(FOLLOW_OFFER_EDGE_CAVEATS);
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
