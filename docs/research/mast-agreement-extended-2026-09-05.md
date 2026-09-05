# Re-measuring agreement on the EXTENDED frame: MAST + the four storytree modes

**2026-09-05 · `follow-the-research-arc` · increment `follow-the-research-arc-promote-extension` · ADR-0515 D5/D6**

FROZEN READING. The figures below were taken on 2026-09-05 against a fixed 19-label frame and the same
fixed sample the first reading used. Do not edit the numbers in place — a later re-measurement is a
new dated document, so the readings can be compared. What may be edited is prose that becomes wrong.

This is the SECOND reading. The first — `docs/research/mast-agreement-2026-09-05.md` — measured the
15-label frame (MAST's 14 modes plus `no-mast-home`) and derived a four-mode extension from the items
that had no MAST home, measuring the extension in its own right on those 17 items. It left the
extension OUT of the `ResteerMode` enum on purpose: promoting it changes the instrument, and an enum
validated by a reading taken on a different instrument is a green check that verified nothing. This
document is the reading that promotion owed. The promotion itself lands in the same PR.

## What changed in the instrument

`ResteerMode` went from 15 labels to 19: MAST's 14 (verbatim, unchanged), the four extension modes
`tool-defect` / `environment-defect` / `missing-capability` / `data-model-gap`, and the escape hatch
`no-mast-home`. `MAST_CATEGORY` gained a fifth category, `storytree-extension`, which holds exactly
the four. The extension is kept in its own category rather than folded into MAST's three so that a
MAST-only reading is always recoverable (fold `storytree-extension` back into `unhoused`) and so the
four are never presented as MAST's own. `no-mast-home` stays, and its meaning tightens: it is now the
answer when NEITHER MAST nor the extension describes the failure, so its share is the extension's own
gap list.

The four definitions were carried over VERBATIM from the first reading's derivation. They were not
re-derived, re-worded or tuned: they came from the first-round annotators' own stated reasons on the
gap list, and that provenance is the evidence.

## Method

Identical to the first reading in every respect the first reading fixed, so the two are comparable as
an internal before/after on one instrument change.

**The sample.** The same 40 `friction` artifacts: the live store's friction tier sorted by `createdAt`
and taken at a fixed stride of 15. Re-drawn on 2026-09-05 from a tier that had grown from 635 to 639
rows; because the growth is at the tail, the draw reproduced the first reading's sample exactly — all
40 ids, 40 distinct branches, span 2026-07-06 → 2026-08-30, and every item the first reading named in
its disagreement tables present.

**Two independent annotators, blind to the repository.** Each received the identical 19-label frame
and the identical 40 items — id, title, statement, evidence, impact — with `route`, `routeReason`
and `provenance` STRIPPED. Both were run as `claude -p` (model `claude-opus-5`, tools disabled) from
a scratch directory OUTSIDE the repository, so neither carried the project's CLAUDE.md, its
definition-injection hook or any prior reading in context; they ran concurrently and neither could
see the other's output. The first reading's own caveat still binds: two instances of the same model
share priors, so this most likely OVERSTATES what two genuinely independent annotators would reach.

**One primary label per item**, as before — a deviation from MAST's multi-label protocol, recorded as
one. **The instrument** is unchanged: `cohensKappa` in `packages/library/src/resteer-report.ts`,
surfaced as `storytree resteer agreement <a.json> <b.json>`. The two annotation files are committed
beside this document (`mast-agreement-extended-2026-09-05/annotator-A.json`, `annotator-B.json`)
together with the exact prompt (`prompt.txt`), so the figure can be re-derived from disk:

```
storytree resteer agreement docs/research/mast-agreement-extended-2026-09-05/annotator-A.json \
                            docs/research/mast-agreement-extended-2026-09-05/annotator-B.json
```

## Results

### The extended frame, n = 40

| grain | labels possible | labels in play | observed agreement | expected by chance | Cohen's kappa |
|---|---:|---:|---:|---:|---:|
| mode | 19 | 8 | **0.875** | 0.255 | **0.832** |
| category | 5 | 3 | **0.975** | 0.627 | **0.933** |

For the record beside it, the first reading on the 15-label frame was 0.850 / **0.791** at mode grain
and 0.925 / **0.874** at category grain. Agreement did not fall when the frame grew; on this sample it
rose at both grains. Read that as "the extension held up", not as a precise effect size — n = 40, and
the mode-grain difference is three items.

Kappa is reported beside raw observed agreement deliberately. At category grain expected agreement is
high (0.627) because one category now dominates, so kappa there is the figure doing the work; at mode
grain expected agreement is low (0.255) and the two figures tell the same story.

| mode | A | B |
|---|---:|---:|
| `tool-defect` | 17 | 19 |
| `data-model-gap` | 5 | 4 |
| `environment-defect` | 4 | 4 |
| `missing-capability` | 4 | 4 |
| `incorrect-verification` | 5 | 5 |
| `no-or-incomplete-verification` | 3 | 2 |
| `premature-termination` | 1 | 1 |
| `no-mast-home` | 1 | 1 |

All five disagreements, with each annotator's stated reason:

| item | A | B |
|---|---|---|
| `friction-adr-nnnn-placeholder-is-an-overloaded-token` | data-model-gap | tool-defect |
| `a-security-boundary-sourced-from-a-mutable-checkout-is-only-as-current-as-its-branch` | tool-defect | environment-defect |
| `scratchpad-one-shot-scripts-cannot-resolve-workspace-packages` | environment-defect | tool-defect |
| `rerun-failed-flake-label-is-blind-to-live-store-writes` | incorrect-verification | tool-defect |
| `bun-test-runs-a-mis-parameterised-instrument-to-completion` | no-or-incomplete-verification | incorrect-verification |

- ADR placeholder — A: the token cannot distinguish a session's allocate-late marker from the corpus's
  generic pattern (a representational gap); B: an unresolved, overloaded convention drove writes into
  out-of-scope files (a tool behaving wrongly).
- Security boundary — A: the install verb registers a hook by absolute path without verifying the
  host script exists; B: the registration binds to whatever branch the host checkout sits on, so
  platform state decides what is enforced.
- Scratchpad scripts — A: module resolution keys off the script's directory (the platform); B: the
  documented incantation assumes the script sits inside the workspace (the tool).
- Rerun-failed flake label — A: a comparison RAN with git-unchanged as a proxy for nothing-was-fixed
  (a wrong check); B: the verb emits a confident verdict about state it cannot see (a wrong tool).
- Mis-parameterised instrument — the first reading's own recurring boundary: check omitted (A) versus
  check ran and was wrong (B). Both FC3, so it collapses at category grain.

Four of the five sit INSIDE the extension or on its edge, and every one of them is the same shape: a
tool whose wrong behaviour has a platform cause, or a wrong check that is also a wrong tool. Only one
crosses a category. The first reading predicted exactly this boundary from its two extension-round
disagreements (`piping-gate-bg…` and `studio-dev-server…`, both environment-versus-tool); both of
those items now agree.

### The finding this reading adds, and it is larger than the promotion

**The extension did not merely absorb the 40% that MAST could not house. It re-attracted most of what
MAST HAD housed.** On the 15-label frame each annotator placed 24 of 40 items in a MAST mode. On the
19-label frame they placed 9 (A) and 8 (B). Read at the aggregate: at least fifteen items that took a
MAST label when MAST was the only option took an extension label once one existed. The clearest
movement is `incorrect-verification`, which fell from 13 / 12 to 5 / 5.

Where they went is not in doubt — 30 items were placed in the extension by BOTH annotators and 31 by
either, against the 16–17 the first reading counted as unhoused. `tool-defect` alone holds 17–19 of
the 40.

What this says about the FIRST reading: its 60% "housed" figure was partly forced fit. Annotators told
"never stretch a mode" still placed a script that verifies the wrong thing under
`incorrect-verification`, because on that frame it was the least-wrong label available — and it is
not a wrong label. A check that ran and validated against the wrong thing IS incorrect verification
by MAST's definition, and it is ALSO a tool that exists and behaves wrongly by the extension's. The
two definitions overlap by construction and the frame supplies no tie-break. On this sample, given
both, annotators preferred the extension label and agreed with each other when they did.

What it does NOT say: it does not say MAST was the wrong frame to adopt. MAST's three categories are
about an agent's reasoning, and this repo's friction is dominated by defects in the tooling the agent
reasons WITH. The extension names that, and naming it is the whole point of the escape hatch's 40%.

**The escape hatch is now nearly empty — 1 of 40, the same item for both annotators.**
`task-brief-negative-existence-claim-went-stale`: a brief's negative-existence premise, true when
written, expired because a concurrent sibling landed. Both annotators said in their own words that
none of the 18 modes describes a premise that decays between authoring and consumption. One item is
not a pattern; it is the extension's gap list, and it starts at length one.

**Unreached modes — 11 of MAST's 14**, up from 8: the whole of FC1 and the whole of FC2. On the first
reading `disobey-task-specification`, `step-repetition` and `information-withholding` each carried one
or two items; on the extended frame those items went to the extension. Read this exactly as the first
reading asked: **unreached on this sample**, never unreachable. The sample is friction — what fought a
session — and a friction record is written about an obstacle, which is why it skews toward tools. A
re-steer log, which records what the OWNER redirected, is a different population and may well reach
FC1 and FC2; whether it does is an open empirical question this document is not evidence on.

## What these figures do and do not license

**Do:** classify re-steers and agent errors against the 19-label frame; quote a distribution from it
with the frame named; treat the tool-dominance of this SAMPLE as a real property of the friction tier.

**Do NOT:**

1. **Compare any figure here to MAST's 0.88, or to any published number.** ADR-0513 D3. The only
   comparison this document makes is to the first reading on the same sample — an internal
   before/after on one instrument change, which is the shape ADR-0513 permits.
2. **Read our kappa as a human-annotator kappa.** Same model, shared priors; most likely an
   overstatement of genuine independence. A floor on frame ambiguity, not a ceiling on reliability.
3. **Generalise from n = 40** without a confidence interval. Several cells hold one observation.
4. **Read "unreached" as "unreachable"**, or the friction sample as a re-steer distribution.
5. **Resolve the `tool-defect` / `incorrect-verification` overlap by editing the definitions now.** A
   tie-break rule is a frame change, and a frame change owes the same measurement this one did: fix
   it BEFORE annotation, annotate twice independently, report kappa beside raw agreement. Tuning a
   frame on the sample that exposed its seam measures only the tuning.

## Reproducing this

The sample is re-drawable from the live store (friction tier, `createdAt` ascending, stride 15, first
40). The prompt and both annotation files are committed beside this document. The statistic is
`cohensKappa`, tested in `packages/library/src/resteer-report.test.ts`. Re-running is a new dated
document, not an edit to this one.
