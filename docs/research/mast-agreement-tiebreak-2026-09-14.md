# A tie-break for `incorrect-verification` versus `tool-defect`: the third agreement reading

**2026-09-14 · `follow-the-research-arc` · increment `follow-the-research-arc-tool-defect-tiebreak` · ADR-0515 D5/D6**

FROZEN READING. The figures below were taken on 2026-09-14 against a fixed frame, the same fixed
sample as both earlier readings, and a verdict rule committed before any annotator ran. Do not edit
the numbers in place — a later re-measurement is a new dated document. What may be edited is prose
that becomes wrong.

This is the THIRD reading of the same 40 friction records. The first
(`mast-agreement-2026-09-05.md`) measured MAST's 14 modes plus the escape hatch. The second
(`mast-agreement-extended-2026-09-05.md`) measured the 19-label frame after the four storytree
extension modes were promoted, and exposed one seam: a check that RAN and validated the wrong thing is
`incorrect-verification` by MAST's definition and `tool-defect` by the extension's, and the frame
supplied no tie-break. This reading measures one. Everything it rests on is committed beside it in
`mast-agreement-tiebreak-2026-09-14/`.

## The answer: ADOPTED, on narrower grounds than the headline numbers suggest

The rule under test, verbatim from `tiebreak-rule.txt` — the increment's own candidate, stated as one
deciding question:

> A check that RAN and validated the wrong thing fits both of those definitions. When a record is that
> case, decide by WHOSE check was wrong:
> - incorrect-verification — the wrong check is the agent's OWN: a test, assertion, probe or
>   measurement the agent wrote, or a check it chose, for the task in hand.
> - tool-defect — the wrong check is SHIPPED tooling: an existing verb, command, gate rung, check or
>   script that returns the same wrong verdict to every caller who runs it.
>
> The deciding question: would anyone who ran that check get the same wrong verdict? Yes →
> tool-defect. No, it is wrong only as this agent wrote or used it → incorrect-verification.

Both conditions `preregistration.md` fixed held, and neither held vacuously:

| pre-registered condition | CONTROL | RULE | holds |
|---|---:|---:|:---:|
| (A) mean observed agreement over six pairs, mode grain: RULE no more than 0.025 below CONTROL | 0.854 | **0.908** | yes |
| (A) the same, category grain | 0.913 | **0.988** | yes |
| (B) seam splits (`incorrect-verification` against `tool-defect`) over six pairs: RULE fewer | 3 | **0** | yes |

**What that does and does not show.**

- **Established: the rule is applied the same way by independent readers.** On the six records that
  describe a check that ran and was wrong, all 24 RULE-arm labels follow it, and the annotators'
  reasons cite whose check it was. Without the rule, the same readers put 21 of those 24 labels on
  `incorrect-verification` whoever owned the check.
- **Established: it costs no agreement.** Observed agreement is never lower under the rule, at either grain,
  in any comparison taken.
- **NOT established: that it raises agreement.** For each item, take the share of an arm's annotator
  pairs that agree on it and average the RULE-minus-CONTROL difference over the 40 items. At mode
  grain that is **+5.4pp, 95% [−4.5, +15.4]**, within noise. At category grain it is **+7.5pp,
  [+1.8, +13.2]**, which separates, but it stops separating (+3.8pp, [−1.7, +9.2]) once the two
  CONTROL annotators that ran without a reasoning pass are set aside (see below). That cut was not
  pre-registered and does not change the verdict; it limits what the verdict can be quoted as.
- **Thin: the seam condition.** All three CONTROL seam splits are ONE annotator on ONE record
  (`rerun-failed-flake-label-is-blind-to-live-store-writes`) — the same record that carried the second
  reading's only seam split. The seam's footprint in the disagreement table was always that small.
  The rule's larger effect is not on disagreement at all: it RELABELS records annotators already agreed
  on (next section).

## Method

**Fixed first.** `preregistration.md`, the rule, both prompts and the configuration probe prompt were
committed as `273ca954` at 10:08:40 UTC. The first annotator started at 10:11:28 UTC. Nothing in the
pre-registration was edited afterwards.

**The sample.** The 40 records both earlier readings annotated, byte for byte from the second
reading's committed prompt: id, title, statement, evidence and impact, with `route`, `routeReason` and
`provenance` stripped. Re-drawn from the live store on the day (friction tier, 735 rows, `createdAt`
ascending, stride 15, first 40), the draw reproduces all 40 ids in order. ⚠ A trap for the next
re-draw: 9 rows carry a date-only `createdAt` (seven distinct dates between `2026-07-17` and `2026-08-12`,
with no time part), and each sorts ahead of that day's timestamps. This session's first re-draw used a parser that dropped them and read 36 of the 40 items
as different. The sample had not moved; the parser had.

**Two arms, same day, one difference.** CONTROL ran the second reading's prompt unchanged (sha256
`8e4fbc3a…6ce7`). RULE ran the same prompt with the tie-break block inserted before the escape hatch
(`a12d19aa…fb4b`, +6 lines, no other byte changed). Four annotators per arm, all eight concurrently.
The same-day control exists because the second reading is one pair drawn nine days earlier: comparing
the rule against that pair alone would have credited the rule with run-to-run drift, and the drift
turned out to be large (below). Each arm's first pair (C1–C2, R1–R2) is the two-annotator reading
comparable with the earlier documents; the other two annotators give each arm six pairwise readings to
read a difference against.

**Blind to the repository, checked mechanically.** Each annotator ran in a fresh directory outside the
repository, with no `CLAUDE.md` anywhere up its parent chain, as:

```
claude -p --model claude-opus-5 --tools "" --strict-mcp-config --no-session-persistence \
          --output-format stream-json --verbose  < prompt-<arm>.txt
```

This was Claude Code 2.1.212 with no `--effort`. `runs.json` records, from each run's own stream: a
working directory outside the repository, `tools: []`, `mcp_servers: []`, model `claude-opus-5`,
**zero** tool calls and one turn, for all eight. A configuration probe under the identical invocation
(`probe-prompt.txt`, `probe-result.txt`) reported no project documentation in context. It answered
`UNKNOWN` for `prove-it-gate`, which this repository's CLAUDE.md defines, and for the tripwire
`grow tell roam ask`, and answered two ordinary controls correctly. The same probe also listed fifteen
tools as available while its own `init` event recorded `tools: []`. That is why the mechanical record,
not the reader's account, is the check.

**Validity.** All eight outputs were valid on the first attempt: a 40-object JSON array, every sample
id exactly once, every label spelled exactly. Nothing was rejected or re-run.

**The instrument.** `storytree resteer agreement` (`cohensKappa`,
`packages/library/src/resteer-report.ts`). `analyse.py` computes the arm means, seam counts, paired
difference and label tables, mirroring `cohensKappa` line for line. Its `crosscheck` compared every
pairwise figure it produced with the verb's own output: **26 of 26 agree** (13 pairs at both grains,
the second reading's frozen pair included).

## Results

### The two arms, n = 40

| pair | mode agreed | observed | kappa | category agreed | observed | kappa | seam | FC3-internal |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| C1–C2 | 34 | 0.850 | 0.804 | 37 | 0.925 | 0.832 | 0 | 1 |
| C1–C3 | 35 | 0.875 | 0.825 | 37 | 0.925 | 0.797 | 1 | 1 |
| C1–C4 | 37 | 0.925 | 0.896 | 38 | 0.950 | 0.875 | 0 | 0 |
| C2–C3 | 31 | 0.775 | 0.704 | 34 | 0.850 | 0.634 | 1 | 0 |
| C2–C4 | 33 | 0.825 | 0.772 | 35 | 0.875 | 0.714 | 0 | 1 |
| C3–C4 | 35 | 0.875 | 0.825 | 38 | 0.950 | 0.859 | 1 | 1 |
| **CONTROL, mean of six** | | **0.854** | 0.805 | | **0.913** | 0.785 | **3** | 4 |
| R1–R2 | 37 | 0.925 | 0.877 | 39 | 0.975 | 0.896 | 0 | 0 |
| R1–R3 | 37 | 0.925 | 0.882 | 39 | 0.975 | 0.896 | 0 | 0 |
| R1–R4 | 34 | 0.850 | 0.749 | 39 | 0.975 | 0.896 | 0 | 0 |
| R2–R3 | 38 | 0.950 | 0.921 | 40 | 1.000 | 1.000 | 0 | 0 |
| R2–R4 | 37 | 0.925 | 0.874 | 40 | 1.000 | 1.000 | 0 | 0 |
| R3–R4 | 35 | 0.875 | 0.799 | 40 | 1.000 | 1.000 | 0 | 0 |
| **RULE, mean of six** | | **0.908** | 0.850 | | **0.988** | 0.948 | **0** | 0 |

The seam and FC3-internal columns are totals, not means. "FC3-internal" is the
`incorrect-verification` / `no-or-incomplete-verification` boundary, which the pre-registration kept
out of condition (B) because the rule does not address it. It fell from 4 to 0 anyway (below). Kappa
ranges within an arm at mode grain: CONTROL 0.704–0.896, RULE 0.749–0.921.

### Against the earlier readings

| reading | pair | mode observed / kappa | category observed / kappa |
|---|---|---|---|
| second (2026-09-05) | A–B | 0.875 / 0.832 | 0.975 / 0.933 |
| this, CONTROL | C1–C2 | 0.850 / 0.804 | 0.925 / 0.832 |
| this, RULE | R1–R2 | 0.925 / 0.877 | 0.975 / 0.896 |

R1–R2 matches the second reading's category observed agreement exactly and reads a LOWER category
kappa. That is the kappa paradox the pre-registration anticipated, not a loss. The rule concentrates
labels further into one category, so the agreement expected by chance rises (0.759 against 0.627) and
the same observed agreement earns a smaller kappa.

**The unchanged instrument drifted between days.** Each of today's four CONTROL annotators, set against
each of the second reading's two, gives eight cross-day pairs. Their mean observed agreement is
**0.819** (mean kappa 0.758), below both the second reading's own 0.875 and today's within-arm 0.854.
Whole records moved with no frame change at all:
`new-package-proof-command-passes-vacuously-so-confirm-red-halts` was `missing-capability` for both
annotators on 2026-09-05 and `tool-defect` for all eight today, and
`strict-wire-shape-plus-fail-silent-capture-loses-data-invisibly` went from `data-model-gap` ×2 to
`tool-defect` ×4 in CONTROL. This comparison was not pre-registered and decides nothing; it is why a
same-day control was necessary.

### What the rule actually did

Six records describe a check that ran and gave the wrong answer. Their labels across the three
readings:

| record | the check, in the RULE annotators' words | 2nd reading (A, B) | CONTROL | RULE |
|---|---|---|---|---|
| `check-coverage-counts-a-test-name-not-a-contracts-clauses` | "the shipped check:coverage rung" | IV, IV | IV ×4 | **TD ×4** |
| `opaque-pixel-floor-cannot-see-a-prop-that-stopped-drawing` | "the shipped capture harness's non-vacuity guard" | IV, IV | IV ×4 | **TD ×4** |
| `rerun-failed-flake-label-is-blind-to-live-store-writes` | "the shipped --rerun-failed comparison" | IV, TD | IV ×3, TD | **TD ×4** |
| `camera-probe-non-accretion-proxy-conflated-stable-picture` | "the probe's own stable-picture predicate" | IV, IV | IV ×4 | **IV ×4** |
| `branch-diff-fence-tests-the-branch-not-the-promise` | "the pass's own verify.py check" | IV, IV | IV ×4 | **IV ×4** |
| `bun-test-runs-a-mis-parameterised-instrument-to-completion` | "the session's own measurement instrument" | NIV, IV | IV ×2, NIV ×2 | **IV ×4** |

IV is `incorrect-verification`, TD `tool-defect`, NIV `no-or-incomplete-verification`.

**This runs opposite to what the increment expected.** The increment anticipated that, without a
tie-break, annotators would route verification failures into `tool-defect` and so understate them at
category grain. Today's CONTROL did the reverse: it put shipped wrong checks under
`incorrect-verification`, unanimously on two of the three, and the rule moves them OUT. Across each
arm's 160 labels:

| | CONTROL | RULE |
|---|---:|---:|
| `incorrect-verification` | 21 | 12 |
| `no-or-incomplete-verification` | 13 | 4 |
| `tool-defect` | 73 | 95 |
| category `verification-and-termination` | **37** | **20** |
| category `storytree-extension` | 118 | 139 |

So the rule does not recover a hidden verification share; it narrows what the verification category
holds. After it, a shipped check that verifies the wrong thing is a tooling defect, and
`verification-and-termination` keeps the agent's OWN wrong checks. That is consistent with MAST being
a taxonomy of AGENT failures, and it has a real cost. The question "how many failures were checks that
passed wrongly, whoever owned them" — this repository's commonest fault class — is no longer answered
by the mode alone. The answer is every `incorrect-verification` plus whichever `tool-defect` records
describe a check, and only the record says which. A category distribution taken before this rule and
one taken after it do not compare on that category.

### Where the rule reached past its own wording

The rule says it breaks one tie and changes no other definition. Two neighbouring boundaries moved
anyway, and both movements follow its ownership logic:

- **`friction-unfenced-cross-surface-mirrors`**, a SHIPPED check that verified only PART of its surface
  (`check:mirror-conformance` registers one mirror). Both second-reading annotators and all four
  CONTROL annotators labelled it `no-or-incomplete-verification`. Under the rule, three annotators
  labelled it `tool-defect` ("the shipped check:mirror-conformance registers only one mirror") and the
  fourth `missing-capability`. The ownership logic crossed from incorrect checks to incomplete ones.
- **`bun-test-runs-a-mis-parameterised-instrument-to-completion`**, on the FC3-internal boundary the
  pre-registration kept out of (B). It split 2–2 in CONTROL and was `incorrect-verification` ×4 under
  the rule, every reason citing the agent's own instrument. This is why FC3-internal splits fell from
  4 to 0.

Neither changes the verdict. The frame records the first, because a rule's reach has to be measured;
it cannot be read off the rule's wording.

### Movement off the seam is not attributed to the rule

Twelve records changed their plurality label between the arms. Six are accounted for above: the three
shipped checks, the agent's own instrument, the incomplete shipped check, and `check-agents-stale-masks-an-unfixable-budget-red`,
whose CONTROL split came entirely from the two annotators that did not reason (next section). The other
six sit on extension-internal boundaries and on the escape hatch, where the unchanged instrument also
moved between days:

- `strict-wire-shape-plus-fail-silent-capture-loses-data-invisibly`: `tool-defect` ×4 → `data-model-gap` ×3
- `friction-adr-nnnn-placeholder-is-an-overloaded-token`: `tool-defect` ×3 → `data-model-gap` ×3
- `a-security-boundary-sourced-from-a-mutable-checkout-is-only-as-current-as-its-branch`: `environment-defect` ×4 → `tool-defect` ×3
- `piping-gate-bg-defeats-its-detach-and-kills-the-run`: split 2–2 → `tool-defect` ×4
- `promote-fixture-teardown-enotempty-reds-unrelated-prs`: `environment-defect` ×4 → split 2–2
- `task-brief-negative-existence-claim-went-stale`: `no-or-incomplete-verification` ×2 → `missing-capability` ×3

At four annotators per arm, and with day-to-day drift of this size in the unchanged instrument, these
cannot be attributed to the rule, so they are not.

### One uncontrolled difference inside CONTROL

C1 and C2, the CONTROL arm's primary pair, answered without an extended-reasoning pass. Their streams
carry no thinking block, about 3.7K output tokens and about 50 s each. The other six runs each carry a
thinking block, 11.3–13.2K output tokens and 142–169 s. The invocation was identical; under the CLI's
default effort the model decides run by run whether to reason.

It shows in their labels. Every MAST FC1 and FC2 label in the whole reading came from those two:
`information-withholding` three times (C1 and C2 on `check-agents-stale-masks-an-unfixable-budget-red`,
C2 on `mutation-remedy-omits-deleting-the-unobservable-branch`) and `unaware-of-termination-conditions`
once (C2). No reasoning annotator in either arm used an FC1 or FC2 label. Those labels account for 10
of CONTROL's 21 category-grain pair splits, which is why the category-grain paired difference stops
separating without them.

With CONTROL restricted to its two reasoning annotators (one pair, C3–C4), neither condition is
reversed. C3–C4 reads 0.875 at mode grain and 0.950 at category grain with one seam split, against the
RULE arm's 0.908, 0.988 and 0. The paired difference against that pair is +3.3pp, 95% [−7.7, +14.3]
at mode grain and +3.8pp, [−1.7, +9.2] at category grain. None of this was pre-registered. Whether the
rule text itself made reasoning more likely (all four RULE runs reasoned, against two of four in
CONTROL) cannot be told at this size. A later reading should record thinking presence per run, and
should pin `--effort` only where comparability with the earlier readings allows it.

### Disagreements in the primary pairs

**R1–R2 (3).** None is on the seam.

| record | R1 | R2 |
|---|---|---|
| `friction-adr-nnnn-placeholder-is-an-overloaded-token` | tool-defect | data-model-gap |
| `task-brief-negative-existence-claim-went-stale` | no-mast-home | missing-capability |
| `promote-fixture-teardown-enotempty-reds-unrelated-prs` | environment-defect | tool-defect |

- Placeholder: R1 says an unresolved convention made a substitution write wrongly; R2 says the
  placeholder namespace cannot tell a pending allocation from the generic token.
- Stale brief: R1 says none of the eighteen modes describes a premise that expires; R2 says no
  mechanism detects that the premise was overtaken.
- Teardown race: R1 calls it a Linux-CI-only race; R2 calls it the repository's own fixture racing.

These are the same shapes the second reading's table had off the seam: tool against platform, tool
against data model, and the escape hatch.

**C1–C2 (6).** None is on the seam either. CONTROL's three seam splits all involve C3, on
`rerun-failed-flake-label-is-blind-to-live-store-writes`.

| record | C1 | C2 |
|---|---|---|
| `friction-builder-agents-stall-awaiting-background-gate` | premature-termination | unaware-of-termination-conditions |
| `studio-dev-server-needs-tsx-loader-bare-vite-500s` | tool-defect | environment-defect |
| `piping-gate-bg-defeats-its-detach-and-kills-the-run` | tool-defect | environment-defect |
| `bun-test-runs-a-mis-parameterised-instrument-to-completion` | incorrect-verification | no-or-incomplete-verification |
| `mutation-remedy-omits-deleting-the-unobservable-branch` | tool-defect | information-withholding |
| `kit-island-reproduce-command-names-an-uncommitted-asset` | tool-defect | no-or-incomplete-verification |

## Two corrections to the increment's premise

1. **The seam carried ONE of the second reading's disagreements, not two.** The increment named
   `rerun-failed-flake-label-is-blind-to-live-store-writes` and
   `bun-test-runs-a-mis-parameterised-instrument-to-completion`. The second was split between
   `no-or-incomplete-verification` and `incorrect-verification`, a boundary inside MAST FC3 that this
   rule does not address. The pre-registration counted the seam strictly for that reason.
2. **The category-grain risk ran the other way.** The increment's cost of leaving the seam undecided
   was that verification failures routed to `tool-defect` would be understated. On this sample the
   undecided frame routed shipped wrong checks INTO `incorrect-verification`, and deciding the seam
   moved them out (37 → 20 verification-category labels of 160).

## What these figures do and do not license

**Do:** classify with the tie-break; quote a distribution from the frame with the frame named as the
19-label frame with the 2026-09-14 tie-break.

**Do NOT:**

1. **Compare any figure here to MAST's 0.88, or to any published number.** ADR-0513 D3. The only
   comparisons made are between today's arms and against the earlier readings of this sample.
2. **Quote the rule as raising agreement.** It is established as consistently applied and as costing
   no agreement, and no more.
3. **Compare a `verification-and-termination` share across the rule's adoption** as if the category
   meant the same thing on both sides of it.
4. **Read the off-seam label changes as effects of the rule.**
5. **Read our kappa as a human-annotator kappa.** Every annotator is the same model and shares its
   priors, which most likely overstates independence.
6. **Assume the rule generalises beyond this sample.** It was authored by the session that saw this
   sample's seam, and it was measured on the same sample. That tests whether it is applied
   consistently to the records that exposed the seam, not whether it holds on records nobody has
   looked at.
7. **Generalise from n = 40** without an interval. Several cells hold one observation.

## Reproducing this

- `python docs/research/mast-agreement-tiebreak-2026-09-14/analyse.py analyse` re-derives
  `results.json` and every table here from the committed annotator files.
- `storytree resteer agreement <a.json> <b.json>` re-derives any pairwise figure. Save one output per
  pair as `<a>-<b>.txt` and `analyse.py crosscheck <dir>` compares them all.
- To re-run the annotators, use the invocation above from a directory outside the repository. Hydrate
  the token with `path.join(os.homedir(), ".storytree", "secrets.json")`: a `"/.storytree/…"` string
  literal inside `node -e` is rewritten by Git Bash's path conversion, and the resulting EMPTY token
  surfaces as `OAuth session expired`. The raw streams are not committed; `runs.json` carries the
  fields read from each.
- A re-run is a new dated document, not an edit to this one.
