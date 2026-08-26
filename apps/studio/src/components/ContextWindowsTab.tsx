// THE CONTEXT WINDOW METER (`linked-session-context-arc`, increment
// `make-the-single-window-meter-useful`) — ADR-0452 D1/D2's deliverable: a widget showing the
// ORCHESTRATION SESSION'S OWN WINDOW, which the owner judges by looking at a real one.
//
// WHAT IT ANSWERS, in one line: how full is a session's context window, against the two marks that
// decide whether it takes on more work. ADR-0411 D3 made that a real decision — no NEW increment
// past ~400K, hand over at 500K — and D6 said outright that a session without a real figure must
// announce that it ESTIMATED. Sessions have been doing exactly that. This is the first surface that
// shows the figure.
//
// ★ IT IS NOT THE REPLAY PANEL'S BAR, and the difference is not cosmetic. That bar plots a series at
// a playhead for a trace picked out of a rail, and it reads INGESTED traces — occupancy reaches a
// trace only through an explicit `storytree traversal ingest`, and 2 of 697 local traces carry it
// (measured 2026-08-26). A widget built on that would be blank for the window looking at it. This
// reads the host transcripts the harness writes as a window runs, so it is ambient.
//
// ★★ THE MARKS ARE DRAWN AS COLOUR, NOT AS MARKERS. `docs/design/context-traversal/README.md`
// §"Revision 2026-07-27" clause 3 removed the threshold marker from the occupancy bar — overflow is
// shown by COLOURING the over-threshold portion — and this keeps that rule, extending it to the
// second mark as a third colour. Nothing is drawn AT a boundary. A later session reaching for a tick
// is reaching for something already decided against.
//
// ★★★ THE HELPER SECTION IS AN UNSIGNED PROPOSAL (ADR-0452 D3) and says so in the surface itself,
// not only in a decision nobody reading the widget will open. It carries no owner attestation; his
// review of it is the next gate (D6). Two rules bind it and neither is negotiable:
//   - Helper tokens are NEVER added to a session window's number (ADR-0413 D2, restated ADR-0452 D4,
//     permanent). Each helper gets its own reading on its own track. There is no total.
//   - 233 of 1,074 helper transcripts on this machine can be attributed to NO session under any
//     option (ADR-0413 D6) — 176 spawned before the session moved into its own folder, 57 given
//     their own isolated folder. The block says so rather than presenting a count that reads whole.
//
// GEOMETRY HERE, APPEARANCE OWNER-ATTESTED (ADR-0070 stage 2). This file signs no visual verdict.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  HARD_MARK_TOKENS,
  SOFT_MARK_TOKENS,
  ageLabel,
  bandGuidance,
  bandOf,
  formatTokens,
  meterSegments,
  sharedScaleTokens,
  type ContextBand,
} from '../lib/contextWindowMeter';
import type { ContextWindowEntry, ContextWindowsPayload } from '../types';

export type ContextWindowsState =
  | { status: 'pending' }
  | { status: 'read'; payload: ContextWindowsPayload }
  | { status: 'failed'; message: string };

export interface ContextWindowsTabProps {
  /** True while this tab is the forward one AND the panel is unfolded. Drives the LAZY first read. */
  active: boolean;
  /** Report the headline reading to the host's tab strip, so the number is visible unopened. */
  onMeta: (meta: string | null) => void;
  /** The panel is dragged small: the chrome yields and the meters keep the room (ADR-0354 D4). */
  compact: boolean;
  /**
   * The read, INJECTED rather than module-mocked (`no-module-mocking`, the same seam
   * `BottomDock`/`TerminalRepoGate` already use) so a test drives the states without a dev server.
   */
  read?: () => Promise<ContextWindowsPayload>;
  /** A fixed clock for the age labels, injected for the same reason. */
  nowMs?: number;
}

export function ContextWindowsTab({
  active,
  onMeta,
  compact,
  read,
  nowMs,
}: ContextWindowsTabProps): React.JSX.Element {
  const [state, setState] = useState<ContextWindowsState>({ status: 'pending' });
  /** Latched on first activation, the TraversalTab idiom: once opened, the read has happened and the
   *  answer survives later folds instead of being re-issued on every tab switch. */
  const [everActive, setEverActive] = useState(false);

  useEffect(() => {
    if (active) setEverActive(true);
  }, [active]);

  useEffect(() => {
    if (!everActive) return;
    let live = true;
    const readOnce = read ?? ((): Promise<ContextWindowsPayload> => api.contextWindows());
    void (async (): Promise<void> => {
      try {
        const payload = await readOnce();
        if (live) setState({ status: 'read', payload });
      } catch (error) {
        // NOT an empty machine: the studio server did not answer, which must never render as "this
        // machine holds no windows" — the two send an operator to different places to look.
        if (live) setState({ status: 'failed', message: (error as Error).message });
      }
    })();
    return () => {
      live = false;
    };
  }, [everActive, read]);

  const windows = state.status === 'read' ? state.payload.windows : [];
  const scale = useMemo(
    () => sharedScaleTokens(windows.map((w) => Math.max(w.residentTokens, w.peakTokens))),
    [windows],
  );
  const headline = windows[0];

  useEffect(() => {
    if (headline === undefined) {
      onMeta(null);
      return;
    }
    onMeta(`${formatTokens(headline.residentTokens)} of ${formatTokens(HARD_MARK_TOKENS)}`);
  }, [headline, onMeta]);

  if (state.status === 'pending') {
    return <p className="ctx-note">reading this machine’s session windows…</p>;
  }
  if (state.status === 'failed') {
    return (
      <p className="ctx-note is-failed">
        could not read the context windows — {state.message}. This is the studio server not
        answering, not an empty machine.
      </p>
    );
  }

  const { scan } = state.payload;
  const now = nowMs ?? Date.now();

  if (headline === undefined) {
    return (
      <div className="ctx-panel">
        <p className="ctx-note">
          no session window on this machine carried a readable occupancy reading. Looked under{' '}
          <code>{scan.root}</code> ({scan.windowFilesFound} session transcript
          {scan.windowFilesFound === 1 ? '' : 's'} found). A hosted studio holds none of these files
          and this is its correct answer.
        </p>
      </div>
    );
  }

  const rest = windows.slice(1);
  const helperWindows = windows.filter((w) => w.helpers.length > 0);

  return (
    <div className="ctx-panel" data-testid="context-windows">
      <HeadlineMeter window={headline} scaleTokens={scale} nowMs={now} compact={compact} />

      {rest.length > 0 && (
        <ul className="ctx-list" data-testid="context-windows-rest">
          {rest.map((window) => (
            <CompactMeter key={window.windowId} window={window} scaleTokens={scale} nowMs={now} />
          ))}
        </ul>
      )}

      {!compact && (
        <p className="ctx-legend" data-testid="context-windows-legend">
          track 0 → {formatTokens(scale)} · <span className="ctx-swatch is-calm" aria-hidden="true" />{' '}
          room for another increment · <span className="ctx-swatch is-soft" aria-hidden="true" /> past{' '}
          {formatTokens(SOFT_MARK_TOKENS)}, take on no new one ·{' '}
          <span className="ctx-swatch is-hard" aria-hidden="true" /> past{' '}
          {formatTokens(HARD_MARK_TOKENS)}, hand over (ADR-0411)
        </p>
      )}

      {!compact && <ScanNote scan={scan} windows={windows} />}

      {/* ALWAYS rendered, not gated on there being helpers to draw — the proposal the owner is being
          asked to review is the SHAPE, and a block that vanishes when the recent windows happen to
          have spawned nothing cannot be reviewed. Measured 2026-08-26: the twelve most recent
          windows on this machine had spawned no helper at all while 190 helper transcripts sat under
          the project, so the empty state is the ORDINARY one and its honest wording is most of the
          work. */}
      {!compact && <HelperProposal windows={helperWindows} scan={scan} scaleTokens={scale} />}
    </div>
  );
}

function bandClass(band: ContextBand): string {
  return band === 'hard' ? 'is-hard' : band === 'soft' ? 'is-soft' : 'is-calm';
}

/** The one drawn track. Three coloured portions and nothing at the boundaries between them. */
function Meter({
  residentTokens,
  scaleTokens,
  testId,
}: {
  residentTokens: number;
  scaleTokens: number;
  testId: string;
}): React.JSX.Element {
  const segments = meterSegments(residentTokens, scaleTokens);
  const pct = (fraction: number): string => `${(fraction * 100).toFixed(4)}%`;
  return (
    <div
      className="ctx-track"
      data-testid={testId}
      role="img"
      aria-label={`${formatTokens(residentTokens)} resident of a ${formatTokens(scaleTokens)} track`}
    >
      <span
        className="ctx-fill is-calm"
        data-testid={`${testId}-calm`}
        style={{ left: '0%', width: pct(segments.calmFraction) }}
      />
      {segments.softFraction > 0 && (
        <span
          className="ctx-fill is-soft"
          data-testid={`${testId}-soft`}
          style={{ left: pct(segments.softStartFraction), width: pct(segments.softFraction) }}
        />
      )}
      {segments.hardFraction > 0 && (
        <span
          className="ctx-fill is-hard"
          data-testid={`${testId}-hard`}
          style={{ left: pct(segments.hardStartFraction), width: pct(segments.hardFraction) }}
        />
      )}
    </div>
  );
}

function HeadlineMeter({
  window,
  scaleTokens,
  nowMs,
  compact,
}: {
  window: ContextWindowEntry;
  scaleTokens: number;
  nowMs: number;
  compact: boolean;
}): React.JSX.Element {
  const band = bandOf(window.residentTokens);
  return (
    <div className={`ctx-headline ${bandClass(band)}`} data-testid="context-window-headline">
      <div className="ctx-headline-id">
        <span className="ctx-id">{window.windowId.slice(0, 8)}</span>
        {window.modelId !== null && <span className="ctx-meta">{window.modelId}</span>}
        <span className="ctx-meta">
          {window.observationCount} request{window.observationCount === 1 ? '' : 's'}
        </span>
        <span className="ctx-meta">{ageLabel(window.lastObservedAt, nowMs)} ago</span>
      </div>
      <div className="ctx-headline-row">
        <Meter
          residentTokens={window.residentTokens}
          scaleTokens={scaleTokens}
          testId="context-window-headline-track"
        />
        <span className={`ctx-readout ${bandClass(band)}`} data-testid="context-window-headline-readout">
          {formatTokens(window.residentTokens)}
          {/* The PEAK is shown only when it differs, and its being able to differ is the whole reason
              ADR-0248 rejected the monotonic billing total: occupancy FALLS on a compaction. */}
          {window.peakTokens > window.residentTokens && (
            <span className="ctx-peak"> · peak {formatTokens(window.peakTokens)}</span>
          )}
        </span>
      </div>
      {!compact && (
        <p className="ctx-guidance" data-testid="context-window-headline-guidance">
          {bandGuidance(band)}
        </p>
      )}
    </div>
  );
}

function CompactMeter({
  window,
  scaleTokens,
  nowMs,
}: {
  window: ContextWindowEntry;
  scaleTokens: number;
  nowMs: number;
}): React.JSX.Element {
  const band = bandOf(window.residentTokens);
  return (
    <li className="ctx-row">
      <span className="ctx-id">{window.windowId.slice(0, 8)}</span>
      <Meter
        residentTokens={window.residentTokens}
        scaleTokens={scaleTokens}
        testId={`context-window-track-${window.windowId}`}
      />
      <span className={`ctx-readout ${bandClass(band)}`}>{formatTokens(window.residentTokens)}</span>
      <span className="ctx-meta">{ageLabel(window.lastObservedAt, nowMs)}</span>
    </li>
  );
}

/** What was examined and what was not — so a bounded reading never reads as a complete one. */
function ScanNote({
  scan,
  windows,
}: {
  scan: ContextWindowsPayload['scan'];
  windows: readonly ContextWindowEntry[];
}): React.JSX.Element {
  const synthetic = windows.reduce((total, w) => total + w.syntheticObservations, 0);
  return (
    <p className="ctx-note" data-testid="context-windows-scan">
      {scan.windowFilesRead} of {scan.windowFilesFound} session transcripts read, newest first, under{' '}
      <code>{scan.root}</code>.
      {synthetic > 0 && (
        <>
          {' '}
          {synthetic} synthetic reading{synthetic === 1 ? '' : 's'} excluded — the harness emits
          zero-token lines it did not ask a model for, and counting them draws an empty window for a
          full one.
        </>
      )}
    </p>
  );
}

/**
 * The helper lane — ADR-0452 D3's explicitly UNSIGNED proposal.
 *
 * Drawn on the SAME shared track as the session windows above it, deliberately: that is the whole
 * argument the picture makes. A helper burns a real window, and the honest way to show it is beside
 * the parent at the same scale, never inside the parent's number.
 */
function HelperProposal({
  windows,
  scan,
  scaleTokens,
}: {
  windows: readonly ContextWindowEntry[];
  scan: ContextWindowsPayload['scan'];
  scaleTokens: number;
}): React.JSX.Element {
  const helperCount = windows.reduce((total, w) => total + w.helpers.length, 0);
  return (
    <section className="ctx-proposal" data-testid="context-windows-helpers">
      <p className="ctx-proposal-badge">
        UNSIGNED PROPOSAL — not owner-attested (ADR-0452 D3). Helper windows, shown for review.
      </p>
      {helperCount === 0 && (
        <p className="ctx-note" data-testid="context-windows-helpers-empty">
          None of the {scan.windowFilesRead} window
          {scan.windowFilesRead === 1 ? '' : 's'} above spawned a helper —{' '}
          {scan.helperFilesOnMachine === 0
            ? 'and this machine holds no helper transcripts at all.'
            : `though ${scan.helperFilesOnMachine} helper transcripts sit elsewhere on this machine, under windows older than the ones read.`}{' '}
          That is the shape the proposal takes when there is nothing to draw: “none here”, never a
          silent absence.
        </p>
      )}
      <ul className="ctx-list">
        {windows.map((window) => (
          <li key={window.windowId} className="ctx-proposal-group">
            <p className="ctx-proposal-parent">
              <span className="ctx-id">{window.windowId.slice(0, 8)}</span>
              <span className="ctx-meta">
                spawned {window.helpers.length} helper window
                {window.helpers.length === 1 ? '' : 's'}
              </span>
            </p>
            <ul className="ctx-list">
              {window.helpers.map((helper) => (
                <li key={helper.file} className="ctx-row is-helper">
                  <span className="ctx-id">{helper.file.replace(/^agent-|\.jsonl$/g, '').slice(0, 8)}</span>
                  <Meter
                    residentTokens={helper.peakTokens}
                    scaleTokens={scaleTokens}
                    testId={`context-helper-track-${helper.file}`}
                  />
                  <span className="ctx-readout">{formatTokens(helper.peakTokens)}</span>
                  <span className="ctx-meta">
                    {helper.requestCount} req{helper.requestCount === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="ctx-note">
        {helperCount > 0 && (
          <>
            {helperCount} helper window{helperCount === 1 ? '' : 's'} shown, each at its OWN peak.{' '}
          </>
        )}
        A helper reading is never added to a session window’s number above: a helper’s window is gone
        by the time its parent reaches its own peak, so a sum would draw a fullness level no real
        window ever reached (ADR-0413 D2, permanent). And this can never be a complete census — 233 of
        1,074 helper transcripts on this machine can be attributed to no session at all under any
        option (ADR-0413 D6): 176 spawned before the session moved into its own folder, 57 were given
        their own isolated one.
      </p>
    </section>
  );
}
