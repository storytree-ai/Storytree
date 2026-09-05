# Adopting MAST as our failure frame, and measuring our own agreement on it

**2026-09-05 · `follow-the-research-arc` increment 02 · ADR-0515 D6**

FROZEN READING. The figures below were taken on 2026-09-05 against a fixed frame and a fixed sample.
Do not edit the numbers in place — a later re-measurement is a new dated document, so the two can be
compared. What may be edited is prose that becomes wrong.

## Why measure at all

`follow-the-research-arc` increment 02 exists to prevent one specific failure: quoting a distribution
from a taxonomy nobody validated. That is the commonest fault class in this repo wearing a lab coat —
a percentage that looks like a measurement and is a green check that verified nothing. So the frame
was adopted rather than invented, and its reliability **on our own material** was measured before any
figure from it was used.

MAST — "Why Do Multi-Agent LLM Systems Fail?" (arXiv 2503.13657) — annotated over 1,600 execution
traces across seven agent frameworks into 14 failure modes in three categories. Six expert annotators
reached Cohen's kappa 0.88 on it. That figure is the reason it was adoptable; it is **not** a bar this
document claims to have cleared. ADR-0513 D3 forbids cross-paper comparison, and it binds here.

## Method

**The frame was fixed BEFORE annotation and not touched afterwards.** MAST's 14 modes and three
categories verbatim, plus exactly one escape hatch, `no-mast-home`, which annotators were told to use
freely and were told was a finding rather than a cop-out. Tuning a frame until agreement improves
measures nothing but the tuning.

**The sample.** 40 `friction` artifacts drawn from the live store's 635, sorted by `createdAt` and
taken at a fixed stride of 15 — deterministic, and reproducible from the same store. The sample spans
2026-07-06 → 2026-08-30 and carries **40 distinct branches**, so no single session is
over-represented.

**Why friction items and not re-steers.** Increment 01 forbids retrofitting history: the re-steer log
starts today and had no rows to annotate. Friction items are an existing, already-authored corpus of
evidence-bearing failure records, which is exactly what a reliability measurement needs. Using them
here is not a reconstructed re-steer log and must not be read as one.

**Two independent annotators.** Each received the identical frame and the identical 40 items — title,
statement, evidence and impact — with the existing `route` and `routeReason` **stripped**, so nobody
was classifying against a prior adjudication. Each was instructed to classify from the item text and
the frame alone: no repository search, no other files, no commands. They ran concurrently and neither
could see the other's output.

**One primary label per item.** MAST's own protocol permits several labels per trace. A single
categorical judgement is required for Cohen's kappa, so annotators assigned the PRIMARY mode. This is
a deviation from MAST's protocol and is recorded as one.

**The instrument.** `cohensKappa` in `packages/library/src/resteer-report.ts` — a typechecked,
unit-tested library function, verified against a hand-computed 2×2 case (κ = 0.40) rather than against
its own output. It is a verb, not a one-shot script, because a figure produced by an untypechecked
script is a figure nobody can re-derive. `storytree resteer agreement` is the surface.

## Results

### The MAST frame, n = 40

| grain | labels in play | observed agreement | expected by chance | Cohen's kappa |
|---|---:|---:|---:|---:|
| mode (15 possible) | 7 | **0.850** | 0.282 | **0.791** |
| category (4 possible) | 3 | **0.925** | 0.406 | **0.874** |

Kappa is reported beside raw observed agreement deliberately. On a concentrated distribution, kappa is
depressed even where agreement is high (the kappa paradox), so kappa alone can understate a frame that
is in fact being applied consistently. Here expected agreement is low (0.282 at mode grain), so the two
figures tell a consistent story and neither is doing hidden work.

Category-grain agreement is higher than mode-grain agreement for a reason visible in the
disagreements: three of the six are the `incorrect-verification` / `no-or-incomplete-verification`
boundary, and both of those are FC3, so they collapse at category grain.

| mode | A | B |
|---|---:|---:|
| `disobey-task-specification` | 2 | 2 |
| `incorrect-verification` | 13 | 12 |
| `information-withholding` | 1 | 1 |
| `no-mast-home` | 16 | 16 |
| `no-or-incomplete-verification` | 5 | 6 |
| `premature-termination` | 1 | 2 |
| `step-repetition` | 2 | 1 |

All six disagreements:

| item | A | B |
|---|---|---|
| `studio-dev-server-needs-tsx-loader-bare-vite-500s` | no-mast-home | disobey-task-specification |
| `task-brief-negative-existence-claim-went-stale` | step-repetition | no-mast-home |
| `comparison-sheet-carries-no-code-state` | incorrect-verification | no-or-incomplete-verification |
| `arc-parked-work-renders-behind-the-whole-history` | incorrect-verification | no-or-incomplete-verification |
| `friction-real-build-author-test-turn-ceiling-tiny-unit` | disobey-task-specification | premature-termination |
| `opaque-pixel-floor-cannot-see-a-prop-that-stopped-drawing` | no-or-incomplete-verification | incorrect-verification |

### The two findings increment 02 asked for

**Modes UNREACHED on our material — 8 of 14**, neither annotator using any of them once:

`disobey-role-specification`, `loss-of-conversation-history`, `unaware-of-termination-conditions`,
`conversation-reset`, `fail-to-ask-for-clarification`, `task-derailment`,
`ignored-other-agents-input`, `reasoning-action-mismatch`

That is almost the whole FC2 inter-agent category, which is what increment 02 predicted: MAST
annotated multi-agent frameworks, and we are largely single-agent-with-subagents. Read this as
**unreached on this sample**, not as structurally impossible — a fan-out session, a long-context
session, or a plan handed between agents could reach several of them. `no re-steer` and
`no observation` are different claims.

**Failures with NO MAST home — 16 of 40 (40%)** for each annotator independently, 15 of them the same
items. This is the largest single bucket in the study.

**And of the items that DID find a home, verification dominates.** `incorrect-verification` plus
`no-or-incomplete-verification` account for 18/24 (A) and 18/24 (B) — about three quarters of the
housed failures. That is independent corroboration, from annotators given no repository context
whatsoever, of what this repo already names its commonest fault class: a check that passes because it
verifies nothing.

### The derived extension, n = 17

The 17 items either annotator placed outside MAST were re-annotated by **two further independent
annotators** against a four-mode extension derived from the first round's own stated reasons — not
from anyone's prior view of what our failures look like. A fifth option, `no-extension-home`, was
offered so the extension could report its own gap.

- `tool-defect` — a command, verb, check or script that EXISTS behaves wrongly: a destructive or
  incorrect write, an unresolved convention, a misleading refusal, a bad default or budget, a flag
  interaction that breaks a documented exemption.
- `environment-defect` — the machine, shell, platform or CI is the cause, not the repository's code.
- `missing-capability` — the verb, mechanism or guard needed simply does not exist yet.
- `data-model-gap` — a schema, record type, allowlist or surface cannot express or see something it
  must.

| grain | observed agreement | expected by chance | Cohen's kappa |
|---|---:|---:|---:|
| extension mode (5 possible) | **0.882** | 0.315 | **0.828** |

| mode | C | D |
|---|---:|---:|
| `data-model-gap` | 2 | 2 |
| `environment-defect` | 5 | 3 |
| `missing-capability` | 3 | 3 |
| `tool-defect` | 7 | 9 |

`no-extension-home` was used **zero times** by either annotator: the four modes covered all 17. Both
disagreements sit on the same boundary — a tool whose wrong behaviour is provoked by the platform:

| item | C | D |
|---|---|---|
| `piping-gate-bg-defeats-its-detach-and-kills-the-run` | environment-defect | tool-defect |
| `studio-dev-server-needs-tsx-loader-bare-vite-500s` | environment-defect | tool-defect |

**The extension is measured but NOT yet in the `ResteerMode` enum.** Adding it changes the frame the
0.791/0.874 figures were measured on, which would leave the enum validated by a reading taken against
a different instrument. Promotion is one increment's work and 0.828 is the evidence it is warranted;
it is not itself the promotion.

## What these figures do and do not license

**Do:** classify re-steers and agent errors against this frame; quote the distribution from it with
the frame named; treat the 40% unhoused share and the verification concentration as real properties of
this sample.

**Do NOT:**

1. **Compare any figure here to MAST's 0.88, or to any published number.** ADR-0513 D3. MAST's figure
   is the frame's provenance, not our benchmark.
2. **Read our kappa as equivalent to a human-annotator kappa.** Both annotators were instances of the
   same model and share priors, so this most likely **overstates** what two genuinely independent
   annotators would reach. It is a floor on frame ambiguity, not a ceiling on reliability.
3. **Generalise from n = 40** to the whole 635-item tier without a confidence interval. Forty items
   across seven used labels leaves several cells with a single observation.
4. **Read "unreached" as "unreachable".** See above.
5. **Read the friction sample as a re-steer distribution.** They are different populations measuring
   different things: friction is what fought a session; a re-steer is what the owner redirected. This
   study used friction because it exists and re-steers do not yet. Whether the two distributions
   resemble each other is an open empirical question and this document is not evidence either way.

## Reproducing this

The sample, the two frames and the four annotation files are derivable from the live store. The
statistic is `cohensKappa`, tested in `packages/library/src/resteer-report.test.ts`. Re-running is a
new dated document, not an edit to this one.
