// BuildSection — the island side panel's Build control + live transcript
// (ADR-0090 Phase 1 "the local loop"). The operator triggers a single-node
// `--live` build from the world's detail panel and watches a COARSE transcript
// stream to a signed verdict, all on their own machine.
//
//   • a buildable node (TreeStory/TreeCapability `buildable === true`) shows a
//     Build button; a non-buildable one shows a one-line reason and no button —
//     the Phase-1 surface never offers a build that cannot run.
//   • clicking Build POSTs the intent ONCE (api.build → POST /api/build), flips
//     the panel into a "building…" state, and POLLS api.buildStatus on a modest
//     interval (the studio's poll posture — no websocket, owner's call), rendering
//     the accumulating coarse transcript.
//   • on a terminal poll (passed/failed) it renders the verdict (the `envelope`
//     on pass, the `reason` on fail) and STOPS polling.
//   • a 409 concurrent-build refusal surfaces gracefully and the button returns.
//
// The frontend's ONLY path to a build is the api.ts client (ADR-0004): this
// component imports NO build engine, no @storytree/agent, no spine. The in-flight
// teal wisp + the post-build hue come for free (ADR-0048 / ADR-0040) — this adds
// neither; it adds only the trigger + the transcript read. A presentational +
// self-contained behavioural component (no app-data context, no router): the api
// client is its single seam, so it's a clean jsdom unit (BuildSection.test.tsx).
//
// A `mapped` brownfield story's go-green is ADOPT, not Build (AdoptPanel below): pressing Adopt POSTs
// a real adoption intent (api.adopt → POST /api/adopt) that ENTERS the brown→proposed→green proving
// process (ADR-0097 Layer 1). The adoption runs in the SAME build registry, so it reuses the very same
// trigger + poll machinery (usePollableRun) and transcript renderer (BuildRun) the Build button uses —
// only the intent POST differs; the poll path is api.buildStatus either way.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { AdoptGate, BuildStatus, StoryGoGreen, WorkStatus } from '../types.js';

/** The transcript poll cadence while a run is non-terminal (modest, mirrors the world's posture). */
export const BUILD_POLL_MS = 1_500;

/** The panel's local build phase: idle (offer the button) → building (poll) → the terminal read. */
type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' } // intent posted, awaiting the runId
  | { kind: 'building'; runId: string; status: BuildStatus }
  | { kind: 'terminal'; status: BuildStatus }
  | { kind: 'error'; message: string };

/**
 * The shared trigger + poll machinery for a fire-and-forget run that lives in the build registry
 * (ADR-0090 Phase 1). Both BuildSection's Build button and AdoptPanel's Adopt button (ADR-0097 Layer 1)
 * drive the SAME shape: POST an intent ONCE → get a `runId` → POLL api.buildStatus on the BUILD_POLL_MS
 * interval → render the accumulating coarse transcript → STOP the moment a terminal status (passed/
 * failed) lands. The only thing that varies is the intent POST (api.build vs api.adopt), so it is the
 * hook's single argument; the poll path is api.buildStatus either way (one registry, ADR-0097).
 *
 * Returns the live `phase` to render plus a guarded `trigger`. Guarantees the same invariants the
 * Build control has always held: a double-click cannot POST twice (the guard ignores a trigger unless
 * idle/error), the interval tears down on a terminal status AND on unmount/re-target, and a thrown
 * fetch (a 409 concurrent refusal, a down server) lands in an `error` phase rather than crashing.
 */
function usePollableRun(
  unitId: string,
  postIntent: (id: string) => Promise<{ runId: string }>,
): { phase: Phase; trigger: () => void } {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // The live runId the poll loop reads — held in a ref so the effect's interval
  // sees the latest value without re-subscribing every render.
  const runIdRef = useRef<string | null>(null);
  // The intent POST in a ref so a stable `trigger` identity doesn't re-pin on a new closure.
  const postRef = useRef(postIntent);
  postRef.current = postIntent;

  // A new unit selected → reset the control (the panel re-targets a different node).
  useEffect(() => {
    setPhase({ kind: 'idle' });
    runIdRef.current = null;
  }, [unitId]);

  const trigger = useCallback(async (): Promise<void> => {
    // Guard the single in-flight intent — a double-click must not POST twice.
    setPhase((p) => (p.kind === 'idle' || p.kind === 'error' ? { kind: 'starting' } : p));
    try {
      const { runId } = await postRef.current(unitId);
      runIdRef.current = runId;
      // Seed a building phase; the poll effect takes over from here.
      setPhase({
        kind: 'building',
        runId,
        status: { runId, unitId, status: 'building', transcript: [] },
      });
    } catch (e) {
      runIdRef.current = null;
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [unitId]);

  // The poll loop: active only while a run is non-terminal. It reads buildStatus on
  // the interval, accumulates the coarse transcript, and TEARS ITSELF DOWN the moment
  // a terminal status (passed/failed) lands — no further fetches (ADR-0090 poll posture).
  useEffect(() => {
    if (phase.kind !== 'building') return;
    const runId = phase.runId;
    let cancelled = false;

    const poll = async (): Promise<void> => {
      if (cancelled || runIdRef.current !== runId) return;
      let status: BuildStatus;
      try {
        status = await api.buildStatus(runId);
      } catch (e) {
        if (cancelled) return;
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
        return;
      }
      if (cancelled || runIdRef.current !== runId) return;
      if (status.status === 'building') {
        setPhase({ kind: 'building', runId, status });
      } else {
        setPhase({ kind: 'terminal', status }); // passed | failed — the effect cleans up
      }
    };

    void poll(); // read immediately, then on the interval
    const id = setInterval(() => void poll(), BUILD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // Re-subscribe only when the run identity changes (a fresh run), not per status tick.
  }, [phase.kind === 'building' ? phase.runId : null]);

  return { phase, trigger: () => void trigger() };
}

export function BuildSection({
  unitId,
  buildable,
  scope = 'node',
  goGreen,
  adoptGates,
  status,
}: {
  unitId: string;
  buildable: boolean | undefined;
  /**
   * What pressing Build drives (ADR-0090): a single capability NODE (`node build --live` — proves
   * the build PIPELINE on a synthetic task, not the node's real feature) or a whole STORY
   * (`story build --real` — authors each capability's real test+impl in a worktree, then promotes a
   * branch to land). The frontend imports no build code (ADR-0004); the server routes the id by its
   * tier. Drives only the honest framing here — the api call is the same `api.build(unitId)`.
   */
  scope?: 'node' | 'story';
  /**
   * The status-aware go-green AFFORDANCE for a STORY (ADR-0094): `build` (a `proposed` story → the
   * Build button below), `adopt` (a `mapped` story → the Adopt panel, surfacing its `## Reliability
   * Gates` and the `gate run` path — no build trigger), or `none` (no go-green action). Ignored for
   * `scope === 'node'` (a capability has no Adopt — reliability gates are a story-level concept).
   */
  goGreen?: StoryGoGreen | undefined;
  /** The reliability gates to Adopt — surfaced when `goGreen === 'adopt'` (ADR-0094 / ADR-0085). */
  adoptGates?: AdoptGate[] | undefined;
  /** The story's status — phrases the `goGreen === 'none'` reason honestly (story-scope only). */
  status?: WorkStatus | null | undefined;
}): React.JSX.Element {
  // The Build trigger + poll machinery (shared with AdoptPanel — see usePollableRun). Pressing Build
  // posts api.build; the run lands in the build registry and is polled via api.buildStatus.
  const { phase, trigger } = usePollableRun(unitId, api.build);

  // ── story scope: the status-aware go-green affordance (ADR-0094) ──
  // A `mapped` story surfaces ADOPT (observe-and-sign its reliability gates), not a fail-closed Build;
  // Build lights only for a genuine drive (a `proposed` story). `none` explains why in place.
  if (scope === 'story') {
    if (goGreen === 'adopt') return <AdoptPanel unitId={unitId} gates={adoptGates ?? []} />;
    if (goGreen !== 'build') return <NoGoGreen status={status} />;
    // goGreen === 'build' → fall through to the Build button (a real whole-story drive).
  } else if (buildable !== true) {
    // ── node scope, non-buildable: no button, just the reason (Phase-1 surface walls) ──
    return (
      <div className="tree-build">
        <p className="muted small">
          This node is not buildable — it carries no proof config the gate can drive.
        </p>
      </div>
    );
  }

  const busy = phase.kind === 'starting';
  const showButton = phase.kind === 'idle' || phase.kind === 'starting' || phase.kind === 'error';

  return (
    <div className="tree-build">
      <h4 className="tree-subdag-title">Build</h4>

      {showButton && (
        <>
          <button type="button" className="btn build-btn" onClick={() => void trigger()} disabled={busy}>
            {busy ? 'Starting…' : 'Build'}
          </button>
          <p className="muted small build-hint">
            {scope === 'story' ? (
              <>
                Builds the whole story for real (<code>--real</code>) — authors each capability&apos;s
                real test + impl in a worktree, then opens a PR that <strong>auto-merges to trunk</strong>{' '}
                on green CI. Subscription-billed.
              </>
            ) : (
              <>
                Runs a single-node <code>--live</code> build on your machine — proves the build
                pipeline on a synthetic task, not this node&apos;s real feature.
              </>
            )}
          </p>
        </>
      )}

      {phase.kind === 'error' && (
        <p className="tree-detail-error small build-error">{phase.message}</p>
      )}

      {(phase.kind === 'building' || phase.kind === 'terminal') && (
        <BuildRun status={phase.kind === 'building' ? phase.status : phase.status} />
      )}
    </div>
  );
}

/** The live transcript + terminal verdict for one run. */
function BuildRun({ status }: { status: BuildStatus }): React.JSX.Element {
  const verdict =
    status.status === 'passed'
      ? { cls: 'verdict-pass', label: 'PASS', body: status.envelope }
      : status.status === 'failed'
        ? { cls: 'verdict-fail', label: 'FAIL', body: status.reason }
        : null;

  return (
    <div className="build-run" aria-live="polite">
      <p className="small build-run-status">
        {status.status === 'building' ? (
          <span className="muted">building… (polling for progress)</span>
        ) : status.status === 'passed' ? (
          <span className="verdict-pass">verdict PASS · build passed</span>
        ) : (
          <span className="verdict-fail">build failed</span>
        )}
      </p>

      {status.transcript.length > 0 && (
        <ol className="build-transcript">
          {status.transcript.map((line, i) => (
            <li key={i} className="build-transcript-line">
              {line}
            </li>
          ))}
        </ol>
      )}

      {verdict && verdict.body && (
        <p className={`small build-verdict ${verdict.cls}`}>{verdict.body}</p>
      )}
    </div>
  );
}

/**
 * The ADOPT action for a `mapped` brownfield story (ADR-0097 Layer 1 — supersedes the static
 * copy-paste `gate run` surface of ADR-0094). Bringing a brownfield story into the fold is a PROVING
 * PROCESS the owner ENTERS, not a one-click flip: pressing Adopt POSTs a real adoption intent
 * (api.adopt → POST /api/adopt) that drives the spine to flip the story `mapped → proposed` and
 * observe-and-sign each `observe` gate's already-green suite to an `adopted` verdict — the MACHINE
 * (spine principal) witnesses the green at a clean committed HEAD; the operator who clicked is the
 * approver, not the signer (ADR-0097 §4). No faked red, no rubber-stamp.
 *
 * The mechanics mirror Build EXACTLY (usePollableRun): the adoption runs fire-and-forget in the SAME
 * build registry, so the run is polled via api.buildStatus on BUILD_POLL_MS, the coarse transcript
 * accumulates, and a terminal status (passed/failed) is rendered by the shared BuildRun. The gates are
 * now CONTEXT framing the action (what gets adopted, what still owes real work), not commands the
 * operator runs by hand.
 *
 * Crucially honest (ADR-0097 §1/§3/§5): Adopt ENTERS the process — it flips `proposed` and adopts the
 * `observe` gates, but it does NOT necessarily green the crown. An uncovered capability (a
 * `build-tests` pocket the suite only smoke-imports) holds the crown at `proposed` until its real
 * red→green work lands. A stalled adoption honestly reads `proposed` (amber), never green.
 */
function AdoptPanel({ unitId, gates }: { unitId: string; gates: AdoptGate[] }): React.JSX.Element {
  // The Adopt trigger + poll machinery — the SAME hook the Build button uses; only the intent POST
  // differs (api.adopt vs api.build), and the run is polled via api.buildStatus either way (ADR-0097:
  // one build registry). All the guarantees come with it: single-POST guard, teardown on terminal/
  // unmount, a thrown fetch (404/409) lands in an error phase.
  const { phase, trigger } = usePollableRun(unitId, api.adopt);

  const busy = phase.kind === 'starting';
  const showButton = phase.kind === 'idle' || phase.kind === 'starting' || phase.kind === 'error';
  const hasGates = gates.length > 0;

  return (
    <div className="tree-build tree-adopt">
      <h4 className="tree-subdag-title">Adopt</h4>
      <p className="muted small build-hint">
        This is a brownfield (<code>mapped</code>) story: it comes into the fold by <strong>Adopt</strong>,
        not Build. The spine observes each <code>observe</code> gate&apos;s suite green at a clean
        committed HEAD and signs an <code>adopted</code> verdict — the machine witnesses the green, no
        faked red (ADR-0085/ADR-0097).
      </p>

      {hasGates && showButton && (
        <>
          <button type="button" className="btn build-btn" onClick={() => void trigger()} disabled={busy}>
            {busy ? 'Starting…' : 'Adopt'}
          </button>
          <p className="muted small build-hint">
            Adopt <strong>enters a proving process</strong> (ADR-0097): it flips this story to{' '}
            <code>proposed</code> and adopts the <code>observe</code> gates — but it does not necessarily
            green the crown. An uncovered capability (a <code>build-tests</code> pocket) holds the crown
            at <code>proposed</code> until its real red→green work lands.
          </p>
        </>
      )}

      {phase.kind === 'error' && (
        <p className="tree-detail-error small build-error">{phase.message}</p>
      )}

      {(phase.kind === 'building' || phase.kind === 'terminal') && (
        <BuildRun status={phase.kind === 'building' ? phase.status : phase.status} />
      )}

      {/* The gates as CONTEXT (ADR-0097): what Adopt observe-and-signs, and what still owes real work. */}
      {hasGates ? (
        <ul className="adopt-gates small">
          {gates.map((g) => (
            <li key={g.id} className="adopt-gate">
              <code>{g.id}</code>{' '}
              {g.kind === 'observe' ? (
                <>
                  — observe &amp; sign:{' '}
                  <code className="adopt-gate-cmd">storytree gate run {g.id} --pg</code>
                  {g.command && <span className="muted"> ({g.command})</span>}
                </>
              ) : g.kind === 'build-tests' ? (
                <span className="muted">— earned by a genuine red→green build, not observe-and-sign</span>
              ) : (
                <span className="muted">— earned when the capability it folds under greens</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          This story declares no <code>## Reliability Gates</code> yet — author them to enable Adopt
          (ADR-0085).
        </p>
      )}

      <p className="muted small">
        Adopting every <code>observe</code> gate flips the story off <code>mapped</code>; the
        world&apos;s crown derives green only once every capability AND every own-proof obligation (UAT
        legs + reliability gates) is signed (ADR-0082/0083 + ADR-0085/0097). No single gate greens the
        story.
      </p>
    </div>
  );
}

/**
 * The `goGreen === 'none'` story surface (ADR-0094): no go-green action applies. Phrased from the
 * story's STATUS so the panel explains WHY in place rather than rendering a stale/over-promising
 * Build — `healthy` needs nothing, a gateless `mapped` story needs reliability gates, an `unhealthy`
 * story's recovery is the agent loop (d.2), a non-real `proposed` story needs a real proof arm.
 */
function NoGoGreen({ status }: { status?: WorkStatus | null | undefined }): React.JSX.Element {
  const reason =
    status === 'healthy'
      ? 'This story is healthy — no go-green action needed.'
      : status === 'mapped'
        ? 'This brownfield (mapped) story declares no `## Reliability Gates` yet — author them so it can be Adopted to green (ADR-0085).'
        : status === 'unhealthy'
          ? 'This story regressed to red — recovery is the agent loop’s job (the orchestrator drives red→green), not a user button (ADR-0094).'
          : status === 'proposed'
            ? 'This proposed story has no real-buildable capabilities yet — add a real: proof arm to its capabilities to build the whole story.'
            : 'No go-green action is available for this story.';
  return (
    <div className="tree-build">
      <p className="muted small">{reason}</p>
    </div>
  );
}
