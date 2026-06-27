// ChatPanel — the renderer-side THIN CLIENT for the desktop "an actual agent you can chat to"
// experience (chat-panel capability, ADR-0070 two-stage / ADR-0108). The operator types an intent;
// the panel POSTs it to /api/chat through the `api` streaming seam, consumes the SSE event stream,
// drives a busy state while the session is in flight, and renders the session's terminal outcome:
//
//   • a `done` frame   → the streamed proposal text (the success journey),
//   • an `error` frame → a DISTINCT failure state carrying the error (a dead/errored session),
//   • a `refused` frame → a DISTINCT "busy — try again" state carrying the reason (the single-session
//     guard, ADR-0108 d.6 — NOT a failure; the operator can retry),
//   • a REJECTED seam  → an honest disabled "chat is unavailable" state (the route is absent — the
//     studio-standalone case where /api/chat is not mounted), never a hung stream, never a crash.
//
// THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The panel's ONLY path to
// the chat route is the `api.chatStream` seam; it imports no agent/drive/model code and never imports
// `ChatStreamEvent` from @storytree/drive (forbidden in apps/studio/src by modelPathBoundary.test.ts).
// The SSE wire shape (the done/error/refused frames) is a plain-JSON cross-boundary contract owned by
// `chat-sse-mount` (apps/desktop) and re-declared studio-side in api.ts — the panel rides that type.
//
// APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED HERE (ADR-0070): this proves geometry/behaviour only.
// The panel's look inside the native shell is the `desktop` story's operator-attested UAT leg 7 — the
// component author signs no visual verdict.

import { useCallback, useRef, useState } from 'react';
import { api } from '../api.js';
import type { ChatEvent } from '../api.js';

/** The panel's local phase: idle (offer the input) → busy (streaming) → a terminal render, OR the
 *  honest absent-route degrade. The terminal frames map one-to-one onto the wire shape. */
type Phase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; proposal: string; costUsd?: number; turns?: number }
  | { kind: 'error'; error: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'unavailable'; detail: string };

export function ChatPanel(): React.JSX.Element {
  const [intent, setIntent] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // A re-entrancy guard so a double-submit (two synchronous clicks before the stream starts) cannot
  // fire a second POST. State alone is racy across synchronous events in the same tick; the ref flips
  // immediately. Mirrors usePollableRun's single-in-flight guard in BuildSection.
  const inFlight = useRef(false);

  const busy = phase.kind === 'busy';
  // The input/Send are disabled while streaming AND once the route is proven absent (the panel does
  // not pretend to work where /api/chat is not mounted — the honest degrade, never a hung spinner).
  const disabled = busy || phase.kind === 'unavailable';

  const submit = useCallback((): void => {
    if (inFlight.current) return; // a second concurrent submit cannot fire a second POST
    const trimmed = intent.trim();
    if (!trimmed) return; // client-side empty-intent guard — never POST an empty intent

    inFlight.current = true;
    // The terminal frame the stream delivers (the backend end()s after one terminal event). We keep
    // the LAST typed frame and render it when the stream resolves — the contracts pin the terminal
    // render, which is the journey the operator sees.
    let terminal: ChatEvent | null = null;
    setPhase({ kind: 'busy' });

    api
      .chatStream(trimmed, (event) => {
        terminal = event;
      })
      .then(() => {
        if (terminal === null) {
          // The stream ended without a typed terminal frame — treat as an honest failure, not a hang.
          setPhase({ kind: 'error', error: 'the chat session ended without a result' });
          return;
        }
        switch (terminal.type) {
          case 'done':
            setPhase({
              kind: 'done',
              proposal: terminal.proposal,
              ...(terminal.costUsd !== undefined ? { costUsd: terminal.costUsd } : {}),
              ...(terminal.turns !== undefined ? { turns: terminal.turns } : {}),
            });
            break;
          case 'error':
            setPhase({ kind: 'error', error: terminal.error });
            break;
          case 'refused':
            setPhase({ kind: 'refused', reason: terminal.reason });
            break;
        }
      })
      .catch((e: unknown) => {
        // A rejected seam = the route is absent (a 404 / fetch error — studio-standalone). Degrade to
        // an honest disabled state; never hang on a stream that never arrives, never crash the surface.
        setPhase({ kind: 'unavailable', detail: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [intent]);

  return (
    <div className="chat-panel">
      <header className="chat-panel-head">
        <h2 className="chat-panel-title">Chat</h2>
        <p className="muted small">
          Ask the orchestrator to orient and propose. It reads and proposes — it never builds or
          merges on its own.
        </p>
      </header>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="chat-input"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What would you like to work on?"
          rows={3}
          disabled={disabled}
          spellCheck={false}
          // Cmd/Ctrl+Enter submits — a small ergonomic affordance over the Send button.
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="chat intent"
        />
        <div className="chat-form-actions">
          <button type="submit" className="btn chat-send" disabled={disabled}>
            {busy ? (
              <>
                <span className="chat-spinner build-spinner build-spinner-inline" aria-hidden="true" />
                Sending…
              </>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </form>

      <div className="chat-outcome" aria-live="polite">
        {phase.kind === 'busy' && (
          // The non-terminal "thinking" affordance. The animated parts are decorative (aria-hidden) —
          // the live-region text carries the meaning. The exact look is operator-attested (ADR-0070).
          <div className="chat-busy">
            <p className="small chat-busy-status">
              <span className="build-spinner" aria-hidden="true" />
              <span className="chat-busy-label">working…</span>
            </p>
            <div className="build-progress" aria-hidden="true">
              <span className="build-progress-bar" />
            </div>
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="chat-proposal">
            <p className="chat-proposal-body">{phase.proposal}</p>
            {(phase.costUsd !== undefined || phase.turns !== undefined) && (
              <p className="muted small chat-proposal-meta">
                {phase.turns !== undefined && <span>{phase.turns} turns</span>}
                {phase.costUsd !== undefined && (
                  <span> · ${phase.costUsd.toFixed(2)}</span>
                )}
              </p>
            )}
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="chat-error">
            <p className="small chat-error-label verdict-fail">The chat session failed.</p>
            <p className="small chat-error-detail">{phase.error}</p>
          </div>
        )}

        {phase.kind === 'refused' && (
          <div className="chat-refused">
            <p className="small chat-refused-label">Busy — try again in a moment.</p>
            <p className="small chat-refused-detail muted">{phase.reason}</p>
          </div>
        )}

        {phase.kind === 'unavailable' && (
          <div className="chat-unavailable">
            <p className="small chat-unavailable-label">Chat is unavailable here.</p>
            <p className="small chat-unavailable-detail muted">
              This studio isn’t serving the chat route — chat runs inside the desktop app. ({phase.detail})
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
