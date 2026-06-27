// ChatPanel — the studio renderer's thin SSE client (ADR-0108 d.1 / ADR-0004).
//
// POSTs a chat intent to the local backend's `POST /api/chat` route, reads the
// `text/event-stream` response body as a ReadableStream via `res.body.getReader()`
// (NOT `res.json()`), parses `data: <json>\n\n` SSE frames, and renders the
// terminal event into the right UI state:
//   done    → renders the proposal text; busy clears; re-submit enabled
//   error   → renders the error message (fail-closed honesty; NOT "try again")
//   refused → renders "busy — try again" (the single-session guard UX, ADR-0108 d.6)
//
// THIN CLIENT — no @storytree/agent, no @storytree/drive, no @storytree/orchestrator,
// no @storytree/cli (ADR-0004 / ADR-0108 d.1). The ONLY seam to the agent is the
// `fetch('/api/chat')` HTTP route. The event type below is a local structural type
// that matches the wire shape — it carries no import edge to the drive runtime.

import { useState } from 'react';

// Local structural type matching the wire events that chat-sse-mount /
// chat-session-stream emits.  NOT imported from @storytree/drive — the model-path
// boundary (ADR-0004 / ADR-0108 d.1) forbids that import here; the renderer is
// structurally decoupled from the agent runtime (the route is the seam).
type ChatStreamEvent =
  | { type: 'done'; proposal: string; costUsd: number; turns: number }
  | { type: 'error'; error: string }
  | { type: 'refused'; reason: string };

type PanelState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; proposal: string }
  | { kind: 'error'; error: string }
  | { kind: 'refused'; reason: string };

export function ChatPanel(): React.JSX.Element {
  const [intent, setIntent] = useState('');
  const [state, setState] = useState<PanelState>({ kind: 'idle' });

  const busy = state.kind === 'busy';

  const handleSubmit = async (): Promise<void> => {
    // Fail-closed: a blank / whitespace-only intent never POSTs.
    if (!intent.trim()) return;

    setState({ kind: 'busy' }); // synchronous — committed before the first await

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent }),
      });

      // Read the SSE stream via getReader() — NOT res.json().
      // The response body is `text/event-stream`; each frame is `data: <json>\n\n`.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });

        // Split on the SSE frame boundary (\n\n); keep any incomplete tail.
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as ChatStreamEvent;
            if (event.type === 'done') {
              setState({ kind: 'done', proposal: event.proposal });
            } else if (event.type === 'error') {
              setState({ kind: 'error', error: event.error });
            } else if (event.type === 'refused') {
              setState({ kind: 'refused', reason: event.reason });
            }
          } catch {
            // skip malformed SSE frames
          }
        }
      }
    } catch (e) {
      setState({ kind: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="chat-panel">
      <textarea
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        aria-label="Chat intent"
      />
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={busy}
      >
        {busy ? 'Sending…' : 'Send'}
      </button>

      {state.kind === 'done' && (
        <p className="chat-proposal">{state.proposal}</p>
      )}

      {state.kind === 'error' && (
        <p className="chat-error">{state.error}</p>
      )}

      {state.kind === 'refused' && (
        <div className="chat-refused">
          <p>busy — try again</p>
          <p>{state.reason}</p>
        </div>
      )}
    </div>
  );
}
