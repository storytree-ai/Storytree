import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { NodeSpec } from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

/**
 * ADR-0378: `storytree node build <id> --real` (and the `story build --real` chain that calls the
 * same precondition per driven node) refuses to dispatch a spec's brief to the authoring agent when
 * its declared `proof.real.sourceFile` ALREADY EXISTS on disk and the spec's own prose asserts,
 * anchored on that file's own basename, that it does not. Left alone, the brief instructs a live
 * leaf to re-author code that is already there — the "proof theater" ADR-0085 / ADR-0097 ban.
 *
 * This is a precondition on the build path (ADR-0060/ADR-0081 territory: those ADRs made
 * `--real`/`--live` always persist and never silently fall back; this is one more condition under
 * which the build does not proceed at all) — NOT a `check:verification-decay` instrument. It carries
 * no advisory worklist, no drain ceiling, and needs no ADR-0252 amendment, because it never runs
 * unless and until someone actually attempts to build one of the affected specs.
 *
 * THE DISCRIMINATOR IS CURRENT EXISTENCE ON DISK, NEVER GIT HISTORY: this rule never asks whether
 * the declared path *moved* or *who* created it, only whether the sentence about to be handed to a
 * leaf is true right now. `existsSync` never throws (a stat failure just answers false), which is
 * the correct behaviour here — unlike the git-history probe on the sibling half of this fault class
 * (`@storytree/cli`'s `WorkspaceFacts.everExisted`, whose own convention is that a probe which
 * CANNOT be consulted throws rather than silently answering false, so a subtractive check never
 * makes the repo look cleaner than it is), the current-existence probe here has no "cannot be
 * consulted" case: the filesystem always answers, one way or the other.
 */

/**
 * ADR-0378's anchor phrase set: the load-bearing discriminator that keeps this rule off brownfield
 * specs (`editsExisting: true`) whose prose correctly says a SYMBOL or behaviour inside an
 * always-existing file is absent — 17 of the corpus's 47 raw "existing sourceFile + an absence
 * phrase somewhere in the doc" matches were exactly this shape (measured against `stories/**` at
 * ADR-0378's decision time: `compositor-pan-transform.md` → `TreeView.tsx`, `map-server-memo.md` →
 * `apiRouter.ts`, `change-event-store.md` → `store.ts`, among others).
 *
 * `\s+` joins each phrase's words rather than a literal space — the story markdown line-wraps at
 * ~100 columns, so an absence phrase can itself be split across a wrapped line. A literal-space
 * regex under-measured the corpus by 6 of the 30 true anchors during this ADR's own validation
 * (missing exactly the wrapped occurrences), which is the failure this comment exists to prevent
 * someone from re-introducing.
 */
const ABSENCE_PHRASE_RE =
  /\b(?:does\s+not(?:\s+yet)?\s+exist|is\s+not(?:\s+yet)?\s+built|absent\s+at\s+HEAD)\b/gi;

/** ADR-0378: "the phrase must name the file … within roughly 160 characters" — the anchor radius. */
const ANCHOR_WINDOW_CHARS = 160;

/** One anchored stale-existence claim {@link findStaleExistenceClaim} located in a spec's prose. */
export interface StaleExistenceClaim {
  /** The declared `sourceFile`'s own basename the claim is anchored on. */
  basename: string;
  /** The offending window of prose around the anchor, whitespace-collapsed for display. */
  sentence: string;
}

/**
 * PURE: does `body` (a spec's prose, everything after the frontmatter block) contain an absence
 * phrase anchored on `sourceFile`'s own basename — i.e. within {@link ANCHOR_WINDOW_CHARS} characters
 * either side of some occurrence of the basename? Returns the first anchored hit (scanning
 * occurrences in document order), or null when none anchors. Never throws.
 *
 * Deliberately scans the WHOLE body, not just a `## Guidance` section: the corpus measurement found
 * anchors in the "RED the spine observes" prose and elsewhere, not only under Guidance.
 */
export function findStaleExistenceClaim(
  body: string,
  sourceFile: string,
): StaleExistenceClaim | null {
  const basename = path.basename(sourceFile);
  if (basename.length === 0) return null;
  const nameRe = new RegExp(basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(body)) !== null) {
    const start = Math.max(0, m.index - ANCHOR_WINDOW_CHARS);
    const end = Math.min(body.length, m.index + basename.length + ANCHOR_WINDOW_CHARS);
    const window = body.slice(start, end);
    ABSENCE_PHRASE_RE.lastIndex = 0;
    if (ABSENCE_PHRASE_RE.test(window)) {
      return { basename, sentence: window.replace(/\s+/g, " ").trim() };
    }
  }
  return null;
}

/**
 * The REAL-mode fail-closed precondition itself (ADR-0378), shared by `node build --real` and the
 * `story build --real` chain so both refuse IDENTICALLY, before any worktree is cut and before any
 * live-store touch: a node with no declared `proof.real.sourceFile` has nothing to check (null); a
 * declared path that does not exist on disk leaves the spec's claim genuinely true (null — this is
 * the one spec in the corpus where "does not exist" is not stale); a declared path that exists AND
 * an anchored absence claim about it is the refusal.
 *
 * `rootDir` resolves the declared (repo-relative) `sourceFile` against the repo actually being
 * built (ADR-0246 — never this module's own location), matching every other REAL-mode precondition
 * in this file (`realConfigRefusal`, `resolveAddDepsGroup`).
 */
export function staleExistenceClaimRefusal(spec: NodeSpec, rootDir: string): Envelope | null {
  const sourceFile = spec.buildConfig?.real?.sourceFile;
  if (sourceFile === undefined) return null; // nothing declared, nothing to check

  const abs = path.isAbsolute(sourceFile) ? sourceFile : path.join(rootDir, sourceFile);
  if (!existsSync(abs)) return null; // the declared path is genuinely still missing — claim stands

  // Re-read the spec's own file: `NodeSpec` keeps only the parsed `## Guidance` section, and the
  // absence claim can sit in any section of the body — scanning the whole prose is required.
  const raw = readFileSync(spec.file, "utf8").replace(/\r\n/g, "\n");
  const fmEnd = raw.startsWith("---\n") ? raw.indexOf("\n---\n", 4) : -1;
  const body = fmEnd < 0 ? raw : raw.slice(fmEnd + 5);

  const found = findStaleExistenceClaim(body, sourceFile);
  if (found === null) return null;

  return {
    ok: false,
    body:
      `node "${spec.id}" declares proof.real.sourceFile "${sourceFile}", which already exists on ` +
      `disk (${path.relative(rootDir, abs).replace(/\\/g, "/")}) — and the spec's own prose asserts, ` +
      `anchored on "${found.basename}", that it does not:\n` +
      `  "…${found.sentence}…"\n\n` +
      "A --real build refuses to dispatch this brief to the authoring agent (ADR-0378): it would " +
      "instruct a live leaf to re-author code that already exists — the proof-theater ADR-0085/" +
      "ADR-0097 ban. Correct the spec's status/prose/sourceFile to reflect what is actually built on " +
      "disk, then re-run.",
    next: [],
  };
}
