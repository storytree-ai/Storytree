/**
 * The guidance envelope (ADR-0022 §4). EVERY command returns one — not bare data. It carries the
 * `result`, the **applicable doctrine** (pointers INTO the Library, never inlined text — the agent
 * earns the detail by exploring, choose-your-own-adventure), and **`next`** (suggested follow-up
 * commands). Errors are guidance, not bare failures: a blocked/empty result still ships `next` so
 * the agent can adapt — the same contract `packages/agent/src/fs-tools.ts` uses for tool results.
 */
export interface Envelope {
  /** false when the command could not give what was asked (unknown id, bad category, usage). */
  readonly ok: boolean;
  /** The result text (a table, an artifact, a list, or an explanation when `ok` is false). */
  readonly body: string;
  /** Applicable doctrine as Library pointers, e.g. "edit-first-curation — storytree library artifact edit-first-curation". */
  readonly doctrine?: readonly string[];
  /** Suggested next commands, the branches of the adventure. */
  readonly next?: readonly string[];
}

/** Render an {@link Envelope} to the text the agent reads on stdout. */
export function formatEnvelope(e: Envelope): string {
  const parts: string[] = [e.body.replace(/\s+$/, "")];
  if (e.doctrine && e.doctrine.length > 0) {
    parts.push("doctrine:\n" + e.doctrine.map((d) => `  - ${d}`).join("\n"));
  }
  if (e.next && e.next.length > 0) {
    parts.push("next:\n" + e.next.map((n) => `  - ${n}`).join("\n"));
  }
  return parts.join("\n\n") + "\n";
}
