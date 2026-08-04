// Who a located verification-decay signal belongs to — the PURE, IO-free attribution core of
// `check:verification-decay` (ADR-0301, applying ADR-0290's move to a second family member).
//
// THE DEFECT THIS EXISTS TO CLOSE, as inputs → wrong outcome. `check:verification-decay` sweeps the
// WHOLE repo and holds each instrument's located count to that instrument's own ceiling. The sweep's
// population is therefore everything every session has ever landed, while the ceiling is charged to
// whoever runs the gate next. Those two are not the same party and routinely are not even the same
// session — the identical mis-aperture ADR-0290 removed from `check:corpus-content`.
//
// MEASURED 2026-08-03 (PR #1119, friction `decay-ceiling-charges-sessions-for-a-sibling-red`).
// `pnpm gate:bg` failed at `check:verification-decay` with `unproven-seam-default: 25 located, ceiling
// 24. Landing is blocked until THIS instrument returns to 24 or below`. NONE of the 25 located symbols
// were in that session's diff — they span nine packages no single diff covers. Because the check
// printed no authorship signal, proving that took a manual differential: moving five new files aside
// and `git stash`-ing five edits to reconstruct a tree identical to `origin/main`, re-running, and
// getting the same 25/24. Roughly 15 minutes, on top of a gate run that had already spent its ~10
// expensive minutes reaching the red.
//
// AND IT PRICED THE SESSION TOWARD THE FORBIDDEN REMEDY. The check's own message offered exactly two
// exits: repair a located signal, or raise that instrument's ceiling. ADR-0252 D3 and ADR-0269 forbid
// the second (a ceiling rises only on a measured population enlargement). A session that cannot tell
// whose breach it is, and cannot cheaply repair a symbol in a package it does not know, is being aimed
// at the one remedy it is not allowed to take.
//
// TWO OUTCOMES, not ADR-0290's three, and the missing one is deliberate. `check:corpus-content` joins a
// per-branch surface to a machine-shared STORE, so it needs BEHIND MAIN to separate "a sibling wrote
// live" from "main already exported it". Here both sides are source in one git tree: a signal this
// branch did not introduce is one `origin/main` still carries, so BEHIND MAIN and ANOTHER WRITER
// collapse into a single INHERITED class whose remedy is the standing drain. Inventing a third label
// with no distinct remedy would be vocabulary for its own sake.
//
//   - AUTHORED — this branch changed a file the finding rests on, or changed something the instrument
//     cross-references that could have created it. Charged: it can red the gate.
//   - INHERITED — provably none of the above: the finding rests only on files identical to the merge
//     base. Reported in full, with its own heading, and never charged.
//
// THE PRE-EXISTING BREACH IS ITS OWN OUTCOME, and it is the sentence whose absence cost the 15
// minutes. When an instrument is over its ceiling and NOTHING of that breach is authored here, the
// check says exactly that — over ceiling on main, not yours, remedy is the standing drain — and WARNs
// rather than redding. That is the one behaviour this changes from RED to WARN, and it is deliberately
// WARN rather than silence: a silent green over a breached main would be strictly worse than the noisy
// red it replaces, because it would retire the standing obligation to drain along with the tax.
//
// FILE GRANULARITY, WITH THE ENTRY'S OWN PREMISE CORRECTED. The parked entry chose file granularity
// over `git log -S` per symbol on cost, and asserted that file granularity "cannot under-charge — it
// can only over-charge". That is TRUE for a per-file instrument and FALSE for a cross-referencing one,
// which is four of the five. `unproven-seam-default` locates a symbol absent from the repo-wide TEST
// corpus, so deleting a test makes a signal appear in a source file the branch never touched; the same
// shape holds for `contract-binding-drift` (delete the bound target), `mirror-pair-drift` (add the
// studio half, or drop a `MIRRORS` row) and `warn-list-hygiene` (remove a ceiling from a sibling
// module while its entry file stands still). Under the entry's rule every one of those reads INHERITED
// and goes uncharged — a wrongly-EXCUSED red, which is the direction ADR-0290's asymmetry argument
// says must never be taken: it costs a session a merge or a routed report to be wrongly charged, while
// a wrongly-excused signal lands and no later gate catches it either, because the next session's check
// excuses it as inherited too.
//
// So attribution reads a finding's BASIS (every file whose content produced it, not just the one it
// points at) and admits two shell-computed escape hatches, both of which only ever move a finding
// TOWARDS being charged: {@link DecayAttributionEvidence.crossInput} for an instrument whose per-file
// split is unsafe this run, and {@link DecayAttributionEvidence.alsoAuthored} for individual findings
// the shell has proved are this branch's by a cheaper exact route than a whole merge-base sweep.
//
// FAIL-CLOSED ON UNMEASURABLE ATTRIBUTION (ADR-0290 D7's posture, unchanged). If git cannot name a
// branch or a merge base — a detached HEAD, an unfetched `origin/main`, a non-repo checkout — every
// finding is charged as AUTHORED, i.e. exactly the pre-ADR-0301 behaviour, and the reason is printed.
// A red with no explanation must remain a red.
//
// PURE by construction: no `node:` import, no filesystem, no `git`. The git reads live in
// `check-verification-decay.ts`.

import type { DecayFinding } from "./verification-decay.js";

/** Which party a single located signal is answerable to — see the module doc. */
export type DecayOwner = "authored" | "inherited";

/**
 * The measured evidence attribution is computed from. Every field is a fact about THIS branch versus
 * the merge base; the classifier itself decides nothing about whether a finding is a real defect
 * (that stays the adversarial pass's judgement, exactly as before).
 */
export interface DecayAttributionEvidence {
  /** The branch the gate is running on — for the printed messages. `null` when git could not say. */
  readonly branch: string | null;
  /**
   * Repo-relative paths whose content differs between `git merge-base origin/main HEAD` and the
   * working tree — uncommitted edits, additions and deletions included. This is "what this branch did
   * to the tree", and for a per-file instrument it is exact.
   */
  readonly touchedFiles: ReadonlySet<string>;
  /**
   * Instrument name → why its per-file split is UNSAFE this run, i.e. this branch changed something
   * the instrument cross-references such that a signal could appear in a file it never touched. Every
   * finding of a listed instrument is charged. Only ever moves findings TOWARDS being charged.
   */
  readonly crossInput: ReadonlyMap<string, string>;
  /**
   * Finding id → why the shell proved THIS finding is the branch's despite its basis being untouched.
   * The precise alternative to a blunt {@link crossInput} entry, used where the exact question is
   * cheap to ask (`unproven-seam-default`: was this symbol covered at the merge base?). Only ever
   * moves findings TOWARDS being charged.
   */
  readonly alsoAuthored: ReadonlyMap<string, string>;
  /**
   * Why attribution could not be measured, if it could not. Set ⇒ EVERY finding is charged as
   * `authored` (the pre-ADR-0301 behaviour) rather than excused — see the module doc's asymmetry
   * argument. Absent ⇒ the branch and its merge base were both read.
   */
  readonly unattributable?: string | undefined;
}

/** One located signal, with the party it is charged to and the evidence line that placed it there. */
export interface AttributedDecayFinding {
  readonly id: string;
  readonly instrument: string;
  readonly owner: DecayOwner;
  /** Short human-readable reason — printed next to the signal so a verdict is never bare. */
  readonly because: string;
}

/** The classified population, indexed for the ceiling and grouped for the report. */
export interface DecayAttribution {
  /** Every finding's verdict, by finding id. */
  readonly byId: ReadonlyMap<string, AttributedDecayFinding>;
  readonly authored: readonly AttributedDecayFinding[];
  readonly inherited: readonly AttributedDecayFinding[];
  /** Echoed from the evidence so a caller can print the fallback reason it is acting under. */
  readonly unattributable?: string | undefined;
}

/**
 * The files a finding rests on: its declared {@link DecayFinding.basis} when it has one, else the
 * single location it points at. Shared with the shell so the two can never disagree about what a
 * finding was computed from.
 */
export function basisOf(finding: DecayFinding): readonly string[] {
  return finding.basis !== undefined && finding.basis.length > 0 ? finding.basis : [finding.where];
}

/**
 * Charge each located signal to a party. Pure — inject the evidence.
 *
 * Precedence is UNMEASURED > CROSS-INPUT > BASIS-TOUCHED > SHELL-PROVED > INHERITED. Every step before
 * the last charges, and that ordering is the whole fail-closed posture: a finding reaches `inherited`
 * only by surviving every question that could have made it this branch's.
 */
export function attributeDecayFindings(
  findings: readonly DecayFinding[],
  evidence: DecayAttributionEvidence,
): DecayAttribution {
  const branch = evidence.branch ?? "this branch";
  const all: AttributedDecayFinding[] = findings.map((f) => {
    const base = { id: f.id, instrument: f.instrument };
    if (evidence.unattributable !== undefined) {
      return { ...base, owner: "authored" as const, because: "attribution unmeasured — charged, not excused" };
    }
    const cross = evidence.crossInput.get(f.instrument);
    if (cross !== undefined) {
      return { ...base, owner: "authored" as const, because: cross };
    }
    const touched = basisOf(f).filter((p) => evidence.touchedFiles.has(p));
    if (touched.length > 0) {
      return { ...base, owner: "authored" as const, because: `${branch} changed ${touched.join(", ")}` };
    }
    const proved = evidence.alsoAuthored.get(f.id);
    if (proved !== undefined) {
      return { ...base, owner: "authored" as const, because: proved };
    }
    return {
      ...base,
      owner: "inherited" as const,
      because: "every file it rests on is identical to the merge base",
    };
  });

  return {
    byId: new Map(all.map((a) => [a.id, a])),
    authored: all.filter((a) => a.owner === "authored"),
    inherited: all.filter((a) => a.owner === "inherited"),
    ...(evidence.unattributable === undefined ? {} : { unattributable: evidence.unattributable }),
  };
}
