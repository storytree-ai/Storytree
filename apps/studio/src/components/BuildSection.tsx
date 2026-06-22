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

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { BuildStatus } from '../types.js';

/** The transcript poll cadence while a run is non-terminal (modest, mirrors the world's posture). */
export const BUILD_POLL_MS = 1_500;

/** The panel's local build phase: idle (offer the button) → building (poll) → the terminal read. */
type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' } // intent posted, awaiting the runId
  | { kind: 'building'; runId: string; status: BuildStatus }
  | { kind: 'terminal'; status: BuildStatus }
  | { kind: 'error'; message: string };

export function BuildSection({
  unitId,
  buildable,
  scope = 'node',
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
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // The live runId the poll loop reads — held in a ref so the effect's interval
  // sees the latest value without re-subscribing every render.
  const runIdRef = useRef<string | null>(null);

  // A new unit selected → reset the control (the panel re-targets a different node).
  useEffect(() => {
    setPhase({ kind: 'idle' });
    runIdRef.current = null;
  }, [unitId]);

  const trigger = useCallback(async (): Promise<void> => {
    // Guard the single in-flight intent — a double-click must not POST twice.
    setPhase((p) => (p.kind === 'idle' || p.kind === 'error' ? { kind: 'starting' } : p));
    try {
      const { runId } = await api.build(unitId);
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
    // Re-subscribe only when the run identity changes (a fresh build), not per status tick.
  }, [phase.kind === 'building' ? phase.runId : null]);

  // ── non-buildable: no button, just the reason (Phase-1 surface walls) ──
  if (buildable !== true) {
    return (
      <div className="tree-build">
        <p className="muted small">
          {scope === 'story'
            ? 'This story has no real-buildable capabilities yet — add a real: proof arm to its capabilities to build the whole story.'
            : 'This node is not buildable — it carries no proof config the gate can drive.'}
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
                real test + impl in a worktree, then promotes a branch to land. Subscription-billed.
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
