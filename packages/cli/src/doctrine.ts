import type { Store } from "@storytree/core";
import { renderStoredDoc } from "@storytree/store";

/**
 * Render a doctrine POINTER line from a Library artifact — the choose-your-own-adventure CLI
 * (ADR-0023 §4) generalized from "the Library commands" to "all CLI guidance prose". An envelope's
 * `doctrine` is applicable doctrine surfaced as pointers INTO the Library, never inlined bodies; this
 * SOURCES that pointer's gloss from the artifact itself, so editing the artifact updates the CLI and
 * no hard-coded restatement is left to drift (reference-don't-restate, ADR-0029 §7).
 *
 * Offline by construction (the `agents.ts` renderer pattern): it reads whatever {@link Store} it is
 * handed — the in-memory seed by default (loadCorpus), the live pg store under --pg — so it runs in
 * CI and the ephemeral web container with no DB. Fail-soft, never throws: a missing artifact (or a
 * store error) yields a bare pointer line (the id + the explore command), so a doctrine line is
 * never blank and a stale id never crashes a command.
 *
 * The shape preserves the envelope's pointer contract: `<id> — <gloss>  (storytree library artifact
 * <id>)` — a one-line gloss plus the command to drill in for the full unit, NOT its body inlined.
 */
export async function renderDoctrine(store: Store, id: string): Promise<string> {
  const explore = `storytree library artifact ${id}`;
  try {
    const stored = await store.getDoc(id);
    if (!stored) return `${id}  (${explore})`;
    const gloss = renderStoredDoc(stored).description.trim();
    return gloss ? `${id} — ${gloss}  (${explore})` : `${id}  (${explore})`;
  } catch {
    return `${id}  (${explore})`;
  }
}

/**
 * Render several doctrine pointers at once (the order is preserved). A convenience for an envelope
 * whose `doctrine` cites more than one unit — each rendered through {@link renderDoctrine}, each
 * fail-soft.
 */
export function renderDoctrines(store: Store, ids: readonly string[]): Promise<string[]> {
  return Promise.all(ids.map((id) => renderDoctrine(store, id)));
}
