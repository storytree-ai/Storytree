/**
 * The `storytree traversal` area — the read surface over captured context-traversal traces
 * (ADR-0235 / ADR-0241), story `context-traversal-capture`.
 *
 * GLUE (ADR-0158): un-asserted connective code in the `cli` building. Every behaviour it exposes
 * lives in the story's own package — this file only maps sub-commands onto that composition and
 * hands back the envelope the dispatch already knows how to print. No capability claims it as
 * proof, and nothing here may re-implement a renderer or touch the trace files directly.
 */
import { listTraversalSessionsRendered } from "@storytree/context-traversal-capture";
import { showTraversalSessionAllAdapters } from "@storytree/context-traversal-spawn";

import type { Envelope } from "./envelope.js";

export function traversalHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree traversal — replay this machine's captured context-traversal traces.",
      "",
      "Traces are local, per-session, metadata-only JSONL under ~/.storytree/traces",
      "(override with STORYTREE_TRAVERSAL_DIR). Capture is on by default and opts out",
      "with STORYTREE_TRAVERSAL=off (ADR-0241).",
      "",
      "  storytree traversal list             the captured sessions, newest observed first",
      "  storytree traversal show <session>   replay one session chronologically",
    ].join("\n"),
    next: ["storytree traversal list — find a captured session id"],
  };
}

/**
 * Dispatch one `traversal` invocation. Reads only: this area never writes a trace, so it is
 * offline-safe and needs no `--pg`.
 */
export function traversalCommand(sub: string | undefined, third: string | undefined): Envelope {
  if (sub === undefined || sub === "list" || sub === "sessions") {
    return listTraversalSessionsRendered();
  }

  if (sub === "show") {
    if (third === undefined) {
      return {
        ok: false,
        body: "storytree traversal show <sessionId> — which captured session should be replayed?",
        next: ["storytree traversal list — the captured session ids"],
      };
    }
    // The MULTI-adapter replay, not increment 2's single-adapter `showTraversalSession`: that one
    // hardcodes `TERMINAL_CLI_DISPATCH_COVERAGE`, whose omitted list names the three spawn event
    // kinds. Once a build emits, rendering those under a declaration that denies them is exactly
    // the ADR-0235 clause 6 dishonesty — so the replay declares every INSTALLED adapter's coverage.
    return showTraversalSessionAllAdapters(third);
  }

  return {
    ok: false,
    body: `unknown traversal sub-command "${sub}" — expected "list" or "show".`,
    next: ["storytree traversal --help"],
  };
}
