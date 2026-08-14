/**
 * The PURE judge behind the guidance ORDERING guard — a generated agent brief may not instruct a
 * `storytree` verb the checkout it ships in does not carry (`verification-integrity-arc`, increment
 * `guidance-projection-lands-ahead-of-its-code`).
 *
 * WHY THIS EXISTS, AND WHY `check:guidance` CANNOT ANSWER IT. `check:guidance`
 * ({@link file://./build-claude-md.ts}) compares the committed projection against the LIVE-STORE
 * render and nothing else. That is a FIDELITY guard by construction, and it works — but the live
 * store is shared and NOT branch-scoped, so any branch that regenerates picks up every in-flight
 * sibling edit, including an instruction whose code has not merged. Both halves then gate GREEN
 * independently, because each is individually consistent with the store, and the two PRs are ordered
 * only by whichever automerges first. Fidelity to a shared source cannot detect a source that ran
 * ahead of the code; only a BRANCH-LOCAL question can, and that is the whole of what this asks:
 *
 *   *does the CLI in THIS checkout carry every verb the projection in THIS checkout instructs?*
 *
 * MEASURED INSTANCE, and it is why this is a rule rather than a worry. PR #1333 (`22038aa8`) carried
 * "run `storytree own` before this session may call itself inert" into CLAUDE.md and AGENTS.md at
 * 08:05:01 UTC on 2026-08-14. The verb shipped in PR #1336 (`7c8b10ae`) at 08:12:27 UTC —
 * `own.ts`, `cli-areas.ts`, ADR-0366. For seven minutes `main` carried a behavioural floor naming a
 * verb the CLI did not have. A later session on a pre-#1336 checkout hit the rule, could not run the
 * verb, and filed friction concluding it was never built. THE COST WAS A CONFIDENT FALSE CONCLUSION
 * ABOUT WHAT IS BUILT, on evidence that looked conclusive — not a session unable to terminate.
 *
 * Replayed against the real history, this rule REDs `22038aa8` naming `own`, and GREENs at
 * `7c8b10ae` the moment the verb lands — the ordering violation and its own repair, with no human
 * judgement in between.
 *
 * IT IS AN ORDERING CHECK, NEVER A POSSIBILITY CHECK. The scope fence is deliberate and narrow: this
 * says nothing about whether a piece of guidance prose is ACHIEVABLE, sensible, or well-aimed. That
 * was the originating friction's framing and it is not tractable over arbitrary text. The only claim
 * adjudicated here is a verb's EXISTENCE, against a structured symbol set — which is why it can
 * block rather than merely warn.
 *
 * THE APERTURE IS A CODE SPAN, AND THAT WAS MEASURED RATHER THAN ASSUMED. A bare `storytree <word>`
 * scan over the same corpus reports `storytree corpus` from the `corpus-investigator` projections —
 * where the text is *"one question about current storytree corpus state"*, the PROJECT NAME followed
 * by an ordinary noun, not an invocation. Restricting the match to a backtick code span removes that
 * whole class, because this corpus writes commands as code and prose as prose. Measured over the 22
 * committed projections: 460 invocations, 13 distinct areas, ZERO unresolved.
 *
 * FAIL-CLOSED, BECAUSE THE RULE IS SUBTRACTIVE. Violations can only come from invocations that were
 * extracted, so an extractor that matches nothing yields no violations — exactly what a healthy
 * corpus yields. The two are indistinguishable at the point where it matters, and the cheerful
 * reading is the wrong one: a broken aperture would report a CLEANER repo. {@link requireObserved}
 * is therefore asserted on the ENUMERATION, never on the finding count, and it is imported from
 * {@link file://./verification-decay.ts} rather than re-spelled here — the same discipline that
 * file argues for itself, where a convention repeated at each site is a guard that goes missing.
 */

import { CLI_AREAS } from "./cli-areas.js";
import { requireObserved } from "./verification-decay.js";

/**
 * A backtick code span — the only place in this corpus an invocation is written. Single-line on
 * purpose: a span that wraps a newline is a fenced block or a formatting accident, and neither is a
 * command a reader would type.
 */
const CODE_SPAN = /`([^`\n]+)`/g;

/**
 * An invocation INSIDE a span: an optional `pnpm` wrapper, `storytree`, then the AREA — the
 * top-level positional {@link CLI_AREAS} enumerates. Anchored on a boundary so `my-storytree foo`
 * cannot match, and the area is lowercase-with-hyphens because that is the shape every area has.
 *
 * SUB-VERBS ARE DELIBERATELY NOT READ, matching `check:surface-coverage`'s own granularity
 * (ADR-0154): a projection naming `storytree library artifact new` resolves iff `library` is a real
 * area. A sub-verb is a judgement no structured symbol set in this repo can adjudicate, and guessing
 * at one would trade a rule that cannot be wrong for a rule that often is.
 */
const INVOCATION = /(?:^|[\s(])(?:pnpm\s+)?storytree\s+([a-z][a-z-]*)/g;

/** One generated projection, as the checkout carries it. */
export interface GuidanceProjection {
  /** Repo-relative path — where a reader goes to see the instruction. */
  path: string;
  /**
   * The GENERATED text only. For CLAUDE.md that is the agent region alone (`regionOf`), never the
   * whole file: the rest is a hand-authored repository tour that no regeneration writes, so holding
   * it to an ordering rule would charge this branch for prose it did not project.
   */
  text: string;
}

/** One instruction naming a verb the checkout does not carry. */
export interface VerbOrderingViolation {
  /** Repo-relative path of the projection that instructs it. */
  path: string;
  /** The area named — the first positional after `storytree`. */
  area: string;
  /** How many times this projection instructs it. */
  occurrences: number;
  /** What was observed, in one line — an instruction that cannot be followed here. */
  detail: string;
}

/**
 * PURE: every `storytree <area>` INVOCATION one projection's generated text instructs, as
 * area → occurrence count.
 *
 * Reads text, never disk. Counts are carried so a report can say whether an instruction is a passing
 * mention or the spine of a workflow step, which is the difference between a typo and a floor rule.
 */
export function extractCliInvocations(text: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const span of text.matchAll(CODE_SPAN)) {
    const inner = span[1];
    if (inner === undefined) continue;
    for (const match of inner.matchAll(INVOCATION)) {
      const area = match[1];
      if (area === undefined) continue;
      found.set(area, (found.get(area) ?? 0) + 1);
    }
  }
  return found;
}

/**
 * PURE: locate instructions in the generated projections that name a CLI area this checkout's
 * {@link CLI_AREAS} does not carry.
 *
 * THROWS when the enumeration observed no invocation at all across every projection handed in —
 * the {@link requireObserved} rule. A corpus whose projections instruct no verb is not a corpus that
 * passed; it is an aperture, a marker, or a file list that broke, and returning `[]` there would
 * print the same clean result a healthy repo prints.
 *
 * The floor is deliberately on the TOTAL rather than per file: several of these projections
 * legitimately instruct nothing (a short agent brief need name no verb), so a per-file assertion
 * would red on honest input. What cannot happen is EVERY projection falling silent at once.
 *
 * ONE FINDING PER (projection, area). The repair is per-instruction — ship the verb, or stop
 * instructing it — and both projections of one digest name the same verb, so the pair is two
 * findings because it is two files a reader opens.
 */
export function findVerbOrderingViolations(
  projections: readonly GuidanceProjection[],
  areas: ReadonlySet<string> = new Set<string>(CLI_AREAS),
): VerbOrderingViolation[] {
  const violations: VerbOrderingViolation[] = [];
  let observed = 0;
  // Sorted so the report is stable run to run, whatever order the files were enumerated in.
  for (const projection of [...projections].sort((a, b) => a.path.localeCompare(b.path))) {
    const invocations = extractCliInvocations(projection.text);
    for (const [area, occurrences] of [...invocations].sort((a, b) => a[0].localeCompare(b[0]))) {
      observed += occurrences;
      if (areas.has(area)) continue;
      violations.push({
        path: projection.path,
        area,
        occurrences,
        detail:
          `${projection.path} instructs \`storytree ${area}\` (${occurrences}x), and this ` +
          "checkout's CLI carries no such area — the projection has landed ahead of the code it " +
          "names, so an agent reading this floor cannot follow it",
      });
    }
  }
  requireObserved(
    observed,
    "guidance verb-ordering read no `storytree <area>` invocation in any generated projection",
  );
  return violations;
}
