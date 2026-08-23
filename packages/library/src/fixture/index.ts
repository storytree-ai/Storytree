// The bootstrap fixture corpus, and the one verb that loads it into a {@link Store}.
//
// This subpath is the hermetic replacement for the departed `loadCorpus` (ADR-0302 D1). Where
// `loadCorpus` read a 1.25 MB committed mirror of a database that was already canonical, this reads
// a frozen 22-artifact literal that mirrors nothing. See `./corpus.ts` for why small / frozen /
// closed are each deliberate.
//
// It lives behind its OWN export subpath (`@storytree/library/fixture`) rather than in the root
// barrel, following `@storytree/storage-protocol`'s `./parity` precedent: a fixture must be
// reachable by the suites that need it and awkward to reach by accident from a path that should be
// reading the live store instead.
//
// Pure — no `node:` imports, no file reads, no path resolution — so it is browser-safe and works
// identically from a worktree, a foreign checkout, or a bundle.

import type { Store } from "@storytree/storage-protocol";

import { libraryTemplates } from "../templates.js";
import { FIXTURE_CORPUS_UNITS } from "./corpus.js";

export type { FixtureUnit } from "./corpus.js";
export { FIXTURE_CORPUS_UNITS } from "./corpus.js";

/** What {@link loadFixtureCorpus} loaded, so a caller can assert on the counts. */
export interface LoadFixtureResult {
  readonly knowledge: number;
  readonly templates: number;
}

/**
 * Upsert the frozen fixture corpus into `store`: the structured artifacts, then the generated
 * `template` scaffolds from {@link libraryTemplates} (ADR-0210 — code, not a committed file, so
 * they never needed the seed).
 *
 * Validation happens inside `Store.upsertDoc`, which is the loud boundary — so a fixture artifact
 * that falls behind the schema fails the suite that loads it rather than degrading quietly.
 */
export async function loadFixtureCorpus(store: Store): Promise<LoadFixtureResult> {
  for (const unit of FIXTURE_CORPUS_UNITS) {
    await store.upsertDoc({ id: unit.id, kind: unit.kind, doc: unit, actor: "fixture-corpus" });
  }
  const templates = libraryTemplates();
  for (const tpl of templates) {
    await store.upsertDoc({ id: tpl.id, kind: "template", doc: tpl, actor: "fixture-corpus" });
  }
  return { knowledge: FIXTURE_CORPUS_UNITS.length, templates: templates.length };
}
