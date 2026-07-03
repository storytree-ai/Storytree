// ChatPanel — the renderer-side THIN CLIENT for the desktop "an actual agent you can chat to"
// experience (chat-panel / terminal-chat capability, ADR-0070 two-stage / ADR-0108). The operator
// types an intent; the panel POSTs it to /api/chat through the `api` streaming seam, consumes the SSE
// event stream, and APPENDS the exchange to a persistent, scrollable TRANSCRIPT — each send adds a
// `› <prompt>` echo then its reply as a new entry, flowing top-to-bottom like one continuous terminal
// scrollback (multi-turn-transcript, owner feedback from the ADR-0137 Phase-3 UAT walk, 2026-07-03).
// Prior exchanges stay rendered; the surface auto-scrolls to the newest entry as it grows. Each entry
// settles to its terminal render:
//
//   • a `done` frame   → the streamed proposal text (the success journey),
//   • an `error` frame → a DISTINCT failure state carrying the error (a dead/errored session),
//   • a `refused` frame → a DISTINCT "busy — try again" state carrying the reason (the single-session
//     guard, ADR-0108 d.6 — NOT a failure; the operator can retry),
//   • a REJECTED seam  → an honest "chat is unavailable" entry (the route is absent — the
//     studio-standalone case where /api/chat is not mounted), never a hung stream, never a crash.
//
// ACCEPT-TO-LAND AFFORDANCE (ADR-0108 d.3): a `done` frame that carries a `proposedUnitId` shows
// an explicit Build button UNDER that transcript entry. The ONLY trigger for a build dispatch is the
// operator CLICKING that button — never a free-text "yes" parsed from the conversation. The panel
// holds NO code path that auto-dispatches on stream-end or on any prose input. The accept affordance is
// absent when the `done` frame has no `proposedUnitId` (nothing safe to dispatch). The click POSTs
// through the `api.acceptBuild` seam to the DISTINCT /api/chat/accept route, which records
// accept-PROVENANCE — that the build came from a human accepting a chat proposal, not a generic build
// POST (ADR-0133 d.3; the routing is identical, only the provenance differs). After the click, the
// panel renders the run's coarse progress (polled via the SAME api.buildStatus) under that entry — the
// build journey in the same conversation (ADR-0108 d.7).
//
// THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The panel's ONLY path to
// the chat route is the `api.chatStream` seam; it imports no agent/drive/model code and never imports
// `ChatStreamEvent` from @storytree/drive (forbidden in apps/studio/src by modelPathBoundary.test.ts).
// The SSE wire shape (the done/error/refused frames) is a plain-JSON cross-boundary contract owned by
// `chat-sse-mount` (apps/desktop) and re-declared studio-side in api.ts — the panel rides that type.
//
// APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED HERE (ADR-0070): this proves geometry/behaviour only.
// The panel's terminal FEEL inside the native shell is the story's operator-attested UAT leg — the
// component author signs no visual verdict.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { ChatEvent } from '../api.js';
import type { BuildStatus } from '../types.js';

/** Poll cadence for the dispatched build run's coarse transcript (mirrors BuildSection's BUILD_POLL_MS).
 *  The interval must be < the test's tick(2_000) window so one tick drives exactly one poll. */
const CHAT_BUILD_POLL_MS = 1_500;

/** The auto-grow input's MAX height (px). Below it the textarea grows to fit its content; at/above it
 *  the height clamps here and the element scrolls inside itself (auto-grow-input). The base one-row
 *  resting height is carried by CSS (.chat-input line-height); the recompute grows from there. The
 *  actual comfortable feel is the story's operator-attested UAT leg — this cap is the recompute only. */
const CHAT_INPUT_MAX_HEIGHT = 160;

/** Local extension of the done frame shape that adds the optional `proposedUnitId` the wire carries
 *  when the agent proposes a specific capability to build (accept-to-land-affordance, ADR-0108 d.3).
 *  The base ChatDoneEvent in api.ts does not yet declare this field; we read it via a local
 *  intersection type so the panel can act on it without coupling to a future api.ts change. */
type ChatDoneWithUnitId = Extract<ChatEvent, { type: 'done' }> & { proposedUnitId?: string };

/** The reply phase of ONE transcript exchange: busy (streaming; `streamed` accumulates the assistant
 *  text deltas as they arrive so the operator sees tokens live) → a terminal render, OR the honest
 *  absent-route degrade. The terminal frames map one-to-one onto the wire shape. `done` carries the
 *  optional `proposedUnitId` the accept affordance acts on. (The old panel held ONE of these on the
 *  whole component; now each transcript entry holds its own — a one-entry transcript is the special
 *  case of the single-exchange behaviour, so no terminal-render logic is lost.) */
type Reply =
  | { kind: 'busy'; streamed: string }
  | { kind: 'done'; proposal: string; costUsd?: number; turns?: number; proposedUnitId?: string }
  | { kind: 'error'; error: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'unavailable'; detail: string };

/** One spawn line in the live transcript (spawn-visibility, ADR-0137). The orchestrator session
 *  spawned a sub-agent (a story-author or builder) for `unitId`; `phase` moves started → finished
 *  (with `ok` on the finish). Keyed by role+unitId so the matching `finished` frame RESOLVES the
 *  `started` line in place rather than appending a duplicate. Non-terminal — it rides the transcript
 *  like a delta and never ends the stream. The line's LOOK is the story's operator-attested UAT
 *  leg 5 (ADR-0070) — geometry/behaviour only here. */
interface SpawnLine {
  role: string;
  unitId: string;
  phase: 'started' | 'finished';
  ok?: boolean;
}

/** One exchange in the persistent transcript: the operator's prompt echo (`› <prompt>`) + the reply
 *  that streamed in for it. Entries APPEND on each send and never replace a prior entry — the
 *  scrollback reads as one continuous terminal (multi-turn-transcript). `id` is a stable monotonic
 *  key for React reconciliation across appends. */
type Exchange = {
  id: number;
  prompt: string;
  reply: Reply;
};

/** The panel's build dispatch phase — idle until the operator explicitly clicks the Build button
 *  (ADR-0108 d.3). Mirrors usePollableRun in BuildSection but scoped inline to the chat panel
 *  (the seam is the chat panel's, not the island's; the poll path is chat-scoped). The build journey
 *  attaches to the `done` exchange whose Build button was clicked (`exchangeId`). */
type BuildPhase =
  | { kind: 'idle' }
  | { kind: 'starting'; exchangeId: number }
  | { kind: 'building'; exchangeId: number; runId: string; transcript: string[] }
  | { kind: 'terminal'; exchangeId: number; status: BuildStatus }
  | { kind: 'error'; exchangeId: number; message: string };

/** A small return-arrow (corner-down-left) glyph — the send affordance, an icon not a "Send" button
 *  (terminal look). Inline SVG: the studio carries no icon webfont; sibling components draw SVG inline.
 *  `currentColor` so the icon inherits the send button's forest-sage colour from CSS. */
function SendIcon(): React.JSX.Element {
  return (
    <svg
      className="chat-send-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 10 4 15 9 20" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>
  );
}

/** A small restart/refresh glyph — the reset ("new chat") affordance (transcript-reset), an icon not a
 *  text button (terminal look). `currentColor` so it inherits the reset button's muted colour. */
function ResetIcon(): React.JSX.Element {
  return (
    <svg
      className="chat-reset-icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 3 3 8 8 8" />
    </svg>
  );
}

/** Props for ChatPanel. `onSpawnFinished` surfaces a spawn-FINISHED frame UP to the wrapping ChatDock
 *  (live-story-island-refresh, ADR-0137) — a plain callback over the plain-JSON `spawn` frame, never a
 *  drive import. ChatDock fences it to a story-author finish and invokes reloadTree so the just-authored
 *  island appears live. Optional: ChatPanel renders standalone (no dock) with no callback. */
export interface ChatPanelProps {
  onSpawnFinished?: (frame: { role: string; unitId: string; ok?: boolean }) => void;
}

export function ChatPanel({ onSpawnFinished }: ChatPanelProps = {}): React.JSX.Element {
  const [intent, setIntent] = useState('');
  // The persistent multi-turn transcript — an ORDERED list of exchanges, newest LAST. Each send
  // APPENDS; prior exchanges stay rendered (multi-turn-transcript). The empty transcript is the idle
  // resting state.
  const [transcript, setTranscript] = useState<Exchange[]>([]);
  const [buildPhase, setBuildPhase] = useState<BuildPhase>({ kind: 'idle' });
  // The live spawn transcript (spawn-visibility, ADR-0137) for the CURRENT in-flight exchange: the
  // sub-agent spawns the session emitted this turn, in arrival order. A `started` frame appends a line;
  // the matching `finished` frame (same role + unitId) RESOLVES that line in place. Non-terminal — it
  // rides the streaming (tail/busy) exchange like a delta and never ends the stream. Cleared on each
  // new submit AND on reset, so a new turn starts clean.
  const [spawns, setSpawns] = useState<readonly SpawnLine[]>([]);
  // A re-entrancy guard so a double-submit (two synchronous clicks before the stream starts) cannot
  // fire a second POST. State alone is racy across synchronous events in the same tick; the ref flips
  // immediately. Mirrors usePollableRun's single-in-flight guard in BuildSection.
  const inFlight = useRef(false);
  // Hold the latest onSpawnFinished in a ref so the stream callback (created inside the stable
  // `submit`) always calls the current prop without re-creating `submit` on every render.
  const onSpawnFinishedRef = useRef(onSpawnFinished);
  onSpawnFinishedRef.current = onSpawnFinished;
  // Monotonic id source for exchange keys — survives appends without index churn.
  const nextId = useRef(0);
  // The AbortController for the CURRENT in-flight send (transcript-reset). Its signal is threaded into
  // api.chatStream → fetch, so a reset can abort() the in-flight stream (the fetch rejects, the reader
  // tears down) — no zombie stream settling a terminal frame into a cleared transcript. Null when no
  // send is in flight.
  const abortRef = useRef<AbortController | null>(null);
  // The scrollback surface — auto-scrolled to its bottom (the newest entry) on every append and as
  // tokens stream into the tail entry. jsdom lays out nothing, so the recompute (scrollTop =
  // scrollHeight) is the observable the test pins via a spied ref, NOT the laid-out pixels
  // (mtt-auto-scrolls-to-newest).
  const outcomeRef = useRef<HTMLDivElement>(null);
  // The input textarea — auto-grows to its content up to CHAT_INPUT_MAX_HEIGHT, then scrolls inside
  // itself (auto-grow-input). jsdom lays out no scrollHeight, so the recompute is what's proven, not
  // the pixels.
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The tail (newest) exchange is the only one that can be in-flight/busy — the input is disabled
  // while it streams. Once it settles to a terminal render the operator can send again.
  const tail = transcript.length > 0 ? transcript[transcript.length - 1] : undefined;
  const busy = tail?.reply.kind === 'busy';
  const disabled = busy;

  /** Patch the tail (in-flight) exchange's reply in place — the settle / delta accumulation, without
   *  disturbing any prior exchange (they are immutable once settled). */
  const patchTailReply = useCallback((reply: Reply): void => {
    setTranscript((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      const last = next[next.length - 1];
      if (last === undefined) return prev;
      next[next.length - 1] = { ...last, reply };
      return next;
    });
  }, []);

  // AUTO-GROW THE INPUT (auto-grow-input). Reset-then-measure: set the height to a base ('auto') FIRST
  // so deleting content SHRINKS the box back down (a grow-only recompute is a defect), then read the
  // laid-out `scrollHeight` and set the height to fit — clamped at CHAT_INPUT_MAX_HEIGHT, past which
  // the element scrolls inside itself (overflowY 'auto' vs 'hidden'). jsdom lays out no scrollHeight
  // (returns 0 unless scripted), so the recompute FIRING and respecting the cap is the machine-proven
  // behaviour; the actual comfortable visual grow is the story's operator-attested UAT leg (ADR-0070).
  const recomputeInputHeight = useCallback((): void => {
    const el = inputRef.current;
    if (el === null) return;
    el.style.height = 'auto'; // reset so a shrink is measurable, not just a grow
    const next = Math.min(el.scrollHeight, CHAT_INPUT_MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > CHAT_INPUT_MAX_HEIGHT ? 'auto' : 'hidden';
  }, []);

  const submit = useCallback((): void => {
    if (inFlight.current) return; // a second concurrent submit cannot fire a second POST
    const trimmed = intent.trim();
    if (!trimmed) return; // client-side empty-intent guard — never POST an empty intent

    inFlight.current = true;
    setSpawns([]); // clear any spawn lines from the previous exchange — this turn starts clean
    // APPEND a new exchange (prompt echo + an in-flight busy reply). Prior exchanges stay untouched —
    // the append-not-replace heart of the transcript (mtt-appends-not-replaces / mtt-echoes-each-prompt).
    const id = nextId.current++;
    setTranscript((prev) => [...prev, { id, prompt: trimmed, reply: { kind: 'busy', streamed: '' } }]);
    setIntent(''); // clear the input — the prompt is now echoed in the transcript
    // Return the input to its one-row resting height (the auto-grow base) now that it's cleared, so a
    // send resets the grown box (auto-grow-input). Height only — 'auto' lets CSS's one-row height take
    // over; overflow back to hidden.
    if (inputRef.current !== null) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }

    // The terminal frame the stream delivers (the backend end()s after one terminal event). We keep
    // the LAST terminal frame and settle the tail entry when the stream resolves.
    let terminal: ChatEvent | null = null;
    // The streamed assistant text for THIS exchange, accumulated from `delta` frames as they arrive.
    // Rendering it live in the tail entry (rather than spinning until the session ends) is the
    // responsiveness fix — the operator sees tokens generate in the newest line
    // (mtt-streams-delta-into-the-tail-entry).
    let streamed = '';

    // A fresh AbortController for this send (transcript-reset). Its signal rides fetch, so a reset
    // aborts the in-flight stream. Track it as the current controller; when it aborts, the seam
    // rejects and the .catch below is skipped for the ABORTED case (guarded on signal.aborted).
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    api
      .chatStream(
        trimmed,
        (event) => {
          if (signal.aborted) return; // a reset aborted this send — drop any late frame
          if (event.type === 'delta') {
            // A non-terminal token fragment — append and re-render the tail (newest) entry live.
            streamed += event.text;
            patchTailReply({ kind: 'busy', streamed });
            return;
          }
          if (event.type === 'spawn') {
            // A non-terminal spawn frame (ADR-0137) — append/resolve a spawn line; NEVER terminate the
            // stream and NEVER touch the tail reply (it must not replace the `done` proposal). A
            // `started` frame appends a new line; a `finished` frame RESOLVES the matching started line
            // (same role + unitId) in place. The spawns ride the current in-flight (tail) exchange.
            const frame = event;
            setSpawns((prev) => {
              if (frame.phase === 'finished') {
                const idx = prev.findIndex(
                  (s) => s.role === frame.role && s.unitId === frame.unitId && s.phase === 'started',
                );
                const resolved: SpawnLine = {
                  role: frame.role,
                  unitId: frame.unitId,
                  phase: 'finished',
                  ...(frame.ok !== undefined ? { ok: frame.ok } : {}),
                };
                if (idx === -1) return [...prev, resolved];
                const next = prev.slice();
                next[idx] = resolved;
                return next;
              }
              return [...prev, { role: frame.role, unitId: frame.unitId, phase: 'started' }];
            });
            // Surface a spawn-FINISHED frame UP to the wrapping dock (live-story-island-refresh,
            // ADR-0137) — the dock fences it to a story-author finish and reloads the map. Plain
            // callback over the plain-JSON frame; ChatPanel does NOT decide the fence (role-agnostic
            // here), it just relays the finish.
            if (frame.phase === 'finished') {
              onSpawnFinishedRef.current?.({
                role: frame.role,
                unitId: frame.unitId,
                ...(frame.ok !== undefined ? { ok: frame.ok } : {}),
              });
            }
            return;
          }
          terminal = event;
        },
        signal,
      )
      .then(() => {
        // A reset aborted this send — the transcript is already cleared; do NOT settle a ghost reply
        // into it (tr-aborts-in-flight-stream).
        if (signal.aborted) return;
        if (terminal === null) {
          // The stream ended without a typed terminal frame — treat as an honest failure, not a hang.
          patchTailReply({ kind: 'error', error: 'the chat session ended without a result' });
          return;
        }
        switch (terminal.type) {
          case 'done': {
            // Read the optional proposedUnitId the wire carries (accept-to-land-affordance, ADR-0108
            // d.3) via the local extension type — the base ChatDoneEvent doesn't declare it yet.
            const doneExt = terminal as ChatDoneWithUnitId;
            patchTailReply({
              kind: 'done',
              proposal: terminal.proposal,
              ...(terminal.costUsd !== undefined ? { costUsd: terminal.costUsd } : {}),
              ...(terminal.turns !== undefined ? { turns: terminal.turns } : {}),
              ...(doneExt.proposedUnitId !== undefined ? { proposedUnitId: doneExt.proposedUnitId } : {}),
            });
            break;
          }
          case 'error':
            patchTailReply({ kind: 'error', error: terminal.error });
            break;
          case 'refused':
            patchTailReply({ kind: 'refused', reason: terminal.reason });
            break;
        }
      })
      .catch((e: unknown) => {
        // A reset aborted this send — the fetch rejects with an AbortError; the transcript is already
        // cleared, so do NOT settle an "unavailable" ghost into it (tr-aborts-in-flight-stream).
        if (signal.aborted) return;
        // A rejected seam = the route is absent (a 404 / fetch error — studio-standalone). Settle the
        // tail entry to an honest "unavailable" render; never hang, never crash the surface.
        patchTailReply({ kind: 'unavailable', detail: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        inFlight.current = false;
        // Clear the current controller if it's still ours (a later send replaces it; a reset nulls it).
        if (abortRef.current === controller) abortRef.current = null;
      });
  }, [intent, patchTailReply]);

  /** The reset control — the "fresh terminal" recovery (transcript-reset). Clears the whole transcript
   *  back to the idle empty state (input cleared + re-enabled + one-row resting height, build phase
   *  reset) AND aborts any in-flight SSE stream (controller.abort() → the threaded signal rejects the
   *  fetch, the reader tears down), so a mid-stream reset leaves no ghost reply. The reset's look/feel
   *  is the story's operator-attested UAT leg — no visual assertion here. */
  const handleReset = useCallback((): void => {
    // Abort the in-flight stream first, so the settle guards (signal.aborted) drop any late frame.
    if (abortRef.current !== null) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    inFlight.current = false;
    setTranscript([]); // empty the scrollback back to the idle resting state
    setSpawns([]); // clear the in-flight spawn lines too — a reset starts clean
    setBuildPhase({ kind: 'idle' }); // any in-flight build-progress/accept phase is reset too
    setIntent(''); // clear the input
    // Return the input to its one-row resting height (the auto-grow base).
    if (inputRef.current !== null) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }
  }, []);

  // AUTO-SCROLL TO THE NEWEST LINE (mtt-auto-scrolls-to-newest). jsdom lays out no `scrollHeight`, so
  // this recompute (pin the surface's scrollTop to its scrollHeight = keep the newest entry in view)
  // is the observable the test drives via a spied ref — the recompute FIRES on each append and as
  // tokens stream into the tail entry. Keyed on the transcript reference (new array on every append /
  // tail patch), so it re-runs whenever the scrollback grows or the tail entry's reply changes. The
  // visual "it actually scrolls smoothly" is part of the story's operator-attested UAT leg.
  useEffect(() => {
    const el = outcomeRef.current;
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript]);

  /** The Build button's click handler — the human's deliberate accept gate (ADR-0108 d.3), scoped to
   *  the `done` exchange whose button was clicked. ONLY an explicit click here dispatches a build; no
   *  prose text and no stream-end auto-dispatches. Calls api.acceptBuild(proposedUnitId) EXACTLY once —
   *  the DISTINCT /api/chat/accept route that records accept-PROVENANCE (this build came from a human
   *  accepting a chat proposal, not a generic build POST; ADR-0133 d.3). The routing is identical to
   *  build(); only the provenance differs. Then transitions the build phase to polling (the SAME
   *  api.buildStatus poll — one registry). */
  const handleBuildClick = useCallback(
    (exchangeId: number, unitId: string): void => {
      if (buildPhase.kind !== 'idle') return; // guard against a second dispatch
      setBuildPhase({ kind: 'starting', exchangeId });
      api
        .acceptBuild(unitId)
        .then(({ runId }) => {
          setBuildPhase({ kind: 'building', exchangeId, runId, transcript: [] });
        })
        .catch((e: unknown) => {
          setBuildPhase({ kind: 'error', exchangeId, message: e instanceof Error ? e.message : String(e) });
        });
    },
    [buildPhase.kind],
  );

  /** Poll for the dispatched run's coarse transcript. Active ONLY while a run is building; the
   *  interval tears itself down the moment a terminal status (passed/failed) lands or the component
   *  unmounts — no further fetches after the run ends (ADR-0090 poll posture). `activeBuildRunId`
   *  is the stable key: it's non-null only when building, so the effect is a no-op at all other
   *  phases (idle/starting/terminal/error). */
  const activeBuildRunId = buildPhase.kind === 'building' ? buildPhase.runId : null;
  const activeBuildExchangeId = buildPhase.kind === 'building' ? buildPhase.exchangeId : null;
  useEffect(() => {
    if (activeBuildRunId === null || activeBuildExchangeId === null) return;
    const runId = activeBuildRunId;
    const exchangeId = activeBuildExchangeId;
    let cancelled = false;

    const poll = async (): Promise<void> => {
      if (cancelled) return;
      let status: BuildStatus;
      try {
        status = await api.buildStatus(runId);
      } catch (e) {
        if (!cancelled) {
          setBuildPhase({ kind: 'error', exchangeId, message: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      if (cancelled) return;
      if (status.status === 'building') {
        setBuildPhase({ kind: 'building', exchangeId, runId, transcript: status.transcript });
      } else {
        // passed | failed — the effect cleans up on the next render (activeBuildRunId → null).
        setBuildPhase({ kind: 'terminal', exchangeId, status });
      }
    };

    const id = setInterval(() => void poll(), CHAT_BUILD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeBuildRunId, activeBuildExchangeId]);

  /** Render ONE exchange's reply body — the per-entry terminal render (done/error/refused/unavailable)
   *  or the live busy stream. The build affordance + progress attach to a `done` entry via buildPhase
   *  scoped to this exchange's id. `isTail` marks the newest exchange — the only one that can be
   *  in-flight — under which the live SPAWN transcript (scoped to the current turn) renders. */
  const renderReply = (exchange: Exchange, isTail: boolean): React.JSX.Element => {
    const { reply, id } = exchange;
    const buildForThis =
      buildPhase.kind !== 'idle' && buildPhase.exchangeId === id ? buildPhase : null;
    return (
      <>
        {/* The live SPAWN transcript (spawn-visibility, ADR-0137): one line per sub-agent the session
            spawned this turn, in arrival order. A `started` frame reads "🔧 spawning <role> for
            <unitId>…"; the matching `finished` frame resolves it to "✓ <role> finished" (or an honest
            "✗ <role> failed" on ok:false). Non-terminal — the lines ride the current (tail) exchange
            alongside its reply (they survive into its terminal render, above the proposal/error) and
            are cleared on the next send. Scoped to the tail exchange (`spawns` is the current turn's).
            The line's LOOK is the story's operator-attested UAT leg 5 (ADR-0070); geometry/behaviour
            only here. */}
        {isTail && spawns.length > 0 && (
          <ul className="chat-spawns">
            {spawns.map((s, i) => (
              <li
                key={`${s.role}:${s.unitId}:${i}`}
                className={`chat-spawn-line chat-spawn-${s.phase}${
                  s.phase === 'finished' && s.ok === false ? ' chat-spawn-failed' : ''
                }`}
              >
                {s.phase === 'started'
                  ? `🔧 spawning ${s.role} for ${s.unitId}…`
                  : s.ok === false
                    ? `✗ ${s.role} failed`
                    : `✓ ${s.role} finished`}
              </li>
            ))}
          </ul>
        )}

        {reply.kind === 'busy' && (
          // The non-terminal "thinking/streaming" affordance for the tail entry. Before any token
          // arrives it shows an indeterminate progress bar ("working…"); once deltas stream in, the
          // live text itself is the progress ("streaming…"). The exact look is operator-attested
          // (ADR-0070); the animated parts are decorative (aria-hidden).
          <div className="chat-busy">
            <p className="small chat-busy-status">
              <span className="build-spinner" aria-hidden="true" />
              <span className="chat-busy-label">{reply.streamed ? 'streaming…' : 'working…'}</span>
            </p>
            {reply.streamed ? (
              <p className="chat-streaming-text">{reply.streamed}</p>
            ) : (
              <div className="build-progress" aria-hidden="true">
                <span className="build-progress-bar" />
              </div>
            )}
          </div>
        )}

        {reply.kind === 'done' && (
          <div className="chat-proposal">
            <p className="chat-proposal-body">{reply.proposal}</p>
            {(reply.costUsd !== undefined || reply.turns !== undefined) && (
              <p className="muted small chat-proposal-meta">
                {reply.turns !== undefined && <span>{reply.turns} turns</span>}
                {reply.costUsd !== undefined && <span> · ${reply.costUsd.toFixed(2)}</span>}
              </p>
            )}
            {/* Accept affordance — shown ONLY when the agent attached a machine-actionable
                proposedUnitId (ADR-0108 d.3). A done frame WITHOUT proposedUnitId shows the
                proposal text and NO Build button — nothing safe to dispatch. The ONLY trigger for
                a build is the explicit button click; no prose text can substitute for it. Scoped to
                THIS exchange — a later exchange's build never shows a button under this one. */}
            {reply.proposedUnitId !== undefined && (
              <div className="chat-accept">
                {buildForThis === null && (
                  <button
                    type="button"
                    className="btn chat-build-btn"
                    onClick={() => handleBuildClick(id, reply.proposedUnitId as string)}
                  >
                    Build
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {reply.kind === 'error' && (
          <div className="chat-error">
            <p className="small chat-error-label verdict-fail">The chat session failed.</p>
            <p className="small chat-error-detail">{reply.error}</p>
          </div>
        )}

        {reply.kind === 'refused' && (
          <div className="chat-refused">
            <p className="small chat-refused-label">Busy — try again in a moment.</p>
            <p className="small chat-refused-detail muted">{reply.reason}</p>
          </div>
        )}

        {reply.kind === 'unavailable' && (
          <div className="chat-unavailable">
            <p className="small chat-unavailable-label">Chat is unavailable here.</p>
            <p className="small chat-unavailable-detail muted">
              This studio isn't serving the chat route — chat runs inside the desktop app. ({reply.detail})
            </p>
          </div>
        )}

        {/* Build progress — rendered while THIS exchange's dispatched run is in-flight OR terminal.
            The build journey shows in the SAME conversation entry: proposal → accept → progress →
            landed (ADR-0108 d.7). The panel owns no build logic; it polls api.buildStatus and renders
            what arrives. */}
        {buildForThis !== null &&
          (buildForThis.kind === 'building' || buildForThis.kind === 'terminal') && (
            <div className="chat-build-progress">
              {buildForThis.kind === 'building' && buildForThis.transcript.length > 0 && (
                <ol className="chat-build-transcript">
                  {buildForThis.transcript.map((line, i) => (
                    <li key={i} className="chat-build-transcript-line">
                      {line}
                    </li>
                  ))}
                </ol>
              )}
              {buildForThis.kind === 'terminal' && (
                <>
                  {buildForThis.status.transcript.length > 0 && (
                    <ol className="chat-build-transcript">
                      {buildForThis.status.transcript.map((line, i) => (
                        <li key={i} className="chat-build-transcript-line">
                          {line}
                        </li>
                      ))}
                    </ol>
                  )}
                  {buildForThis.status.status === 'passed' && (
                    <div className="chat-build-passed">
                      <p className="small verdict-pass">Build passed</p>
                      {buildForThis.status.envelope !== undefined && (
                        <p className="small chat-build-envelope">{buildForThis.status.envelope}</p>
                      )}
                    </div>
                  )}
                  {buildForThis.status.status === 'failed' && (
                    <div className="chat-build-failed">
                      <p className="small verdict-fail">Build failed</p>
                      {buildForThis.status.reason !== undefined && (
                        <p className="small chat-build-reason">{buildForThis.status.reason}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
      </>
    );
  };

  return (
    <div className="chat-panel">
      <div className="chat-outcome" ref={outcomeRef} aria-live="polite">
        {/* The persistent transcript — each exchange stacks top-to-bottom: a `› <prompt>` echo line
            ABOVE its reply, prior exchanges never replaced (multi-turn-transcript). The empty
            transcript is the idle resting scrollback. */}
        {transcript.map((exchange, i) => (
          <div className="chat-exchange" key={exchange.id}>
            <p className="chat-echo">
              <span className="chat-prompt-glyph" aria-hidden="true">
                {'›'}
              </span>
              <span className="chat-echo-text">{exchange.prompt}</span>
            </p>
            {renderReply(exchange, i === transcript.length - 1)}
          </div>
        ))}
      </div>

      {/* The terminal INPUT ROW — pinned flush below the scrollback. A forest-sage `›` prompt glyph,
          the full-width transparent input, and an icon send button (a return-arrow, not a "Send"
          label). Plain Enter submits; Shift+Enter inserts a newline (handled in onKeyDown below). */}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="chat-prompt-glyph chat-input-glyph" aria-hidden="true">
          {'›'}
        </span>
        <textarea
          ref={inputRef}
          className="chat-input"
          value={intent}
          onChange={(e) => {
            setIntent(e.target.value);
            // Grow/shrink the box to fit its content (auto-grow-input). Runs on every content change,
            // reset-then-measure so a deletion shrinks it back down.
            recomputeInputHeight();
          }}
          placeholder="What would you like to work on?"
          rows={1}
          disabled={disabled}
          spellCheck={false}
          // Terminal keybindings: plain Enter submits (preventDefault); Shift+Enter inserts a newline
          // (fall through to the default). The submit()'s own trim guard blocks an empty/whitespace
          // intent. Cmd/Ctrl+Enter also submits (kept for parity with the rest of the studio).
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="chat intent"
        />
        {/* The reset control (transcript-reset) — a fresh terminal: clears the scrollback to idle AND
            aborts any in-flight stream. Shown once there's something to reset (a transcript or an
            in-flight send); a click never submits (type=button). The look/feel is operator-attested. */}
        {(transcript.length > 0 || busy) && (
          <button
            type="button"
            className="chat-reset"
            onClick={handleReset}
            aria-label="new chat"
            title="New chat"
          >
            <ResetIcon />
          </button>
        )}
        <button
          type="submit"
          className="chat-send"
          disabled={disabled}
          aria-label="send"
        >
          {busy ? (
            <span className="chat-spinner build-spinner build-spinner-inline" aria-hidden="true" />
          ) : (
            <SendIcon />
          )}
        </button>
      </form>
      <p className="chat-hint" aria-hidden="true">
        enter to send · shift+enter for newline
      </p>
    </div>
  );
}
