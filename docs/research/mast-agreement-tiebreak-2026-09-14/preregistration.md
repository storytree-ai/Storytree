# Pre-registration: the `incorrect-verification` / `tool-defect` tie-break

**2026-09-14 · `follow-the-research-arc` · increment `follow-the-research-arc-tool-defect-tiebreak` · ADR-0515 D5/D6**

This file fixes the rule, the sample, the arms, the procedure and the verdict BEFORE any annotator
runs. It is committed on its own, ahead of every annotation output, so the order is checkable from
git history rather than asserted. Nothing below is edited once the first annotator starts; the
readout (`../mast-agreement-tiebreak-2026-09-14.md`) reports against it and names any deviation as a
deviation.

## The question

The second reading (`../mast-agreement-extended-2026-09-05.md`) found that `incorrect-verification`
(MAST FC3: a check RAN but was itself wrong) and `tool-defect` (extension: a command, verb, check or
script that EXISTS behaves wrongly) overlap by construction. A check that ran and validated the wrong
thing is both, and the frame supplies no tie-break. Does a tie-break rule, fixed in advance, take that
seam out of the disagreement table without lowering agreement?

## The rule under test

`tiebreak-rule.txt`, verbatim:

> TIE-BREAK — incorrect-verification versus tool-defect
> A check that RAN and validated the wrong thing fits both of those definitions. When a record is that
> case, decide by WHOSE check was wrong:
> - incorrect-verification — the wrong check is the agent's OWN: a test, assertion, probe or
>   measurement the agent wrote, or a check it chose, for the task in hand.
> - tool-defect — the wrong check is SHIPPED tooling: an existing verb, command, gate rung, check or
>   script that returns the same wrong verdict to every caller who runs it.
>
> The deciding question: would anyone who ran that check get the same wrong verdict? Yes →
> tool-defect. No, it is wrong only as this agent wrote or used it → incorrect-verification. This rule
> only breaks that one tie; it does not change any other definition.

It is the increment's own candidate (authored 2026-09-05, before this session): `incorrect-verification`
when the wrong check is the agent's own, a test or assertion it wrote or chose; `tool-defect` when the
check is a shipped verb or rung behaving wrongly for every caller. The only thing added is the single
deciding question, so the two halves cannot both claim the same record. The rule adds no label and
changes no definition: the frame stays at 19 labels.

## The sample

The same 40 `friction` records both earlier readings annotated, taken byte for byte from the second
reading's committed prompt (`../mast-agreement-extended-2026-09-05/prompt.txt`): id, title,
statement, evidence and impact, with `route`, `routeReason` and `provenance` stripped.

Re-drawn from the live store on 2026-09-14 (the friction tier, now 735 rows, sorted by `createdAt`,
stride 15, first 40), the draw reproduces all 40 ids in the same order. One trap for whoever re-draws
it next: 9 rows carry a date-only `createdAt` (`2026-07-17`, no time), which sorts ahead of that day's
timestamps. A parser that drops them shifts every later stride by one per dropped row, and this
session's first re-draw did exactly that, reading 36 of 40 items as different.

## The arms

Two arms, run the same day, on the same model, with the same invocation, concurrently. The ONLY
difference between them is the tie-break block.

| arm | prompt | sha256 (LF bytes) | annotators |
|---|---|---|---|
| CONTROL | `prompt-control.txt`: the second reading's prompt, unchanged | `8e4fbc3a263e87a08e908f8860656ed85cd4d7242c6cb87304852d5b7f586ce7` | C1, C2, C3, C4 |
| RULE | `prompt-rule.txt`: the same prompt with `tiebreak-rule.txt` inserted before THE ESCAPE HATCH, no other byte changed (+6 lines) | `a12d19aa827577c8c46f529f2d79bd1df3dc1d8d4502a59d68b35df711a4fb4b` | R1, R2, R3, R4 |

**Why a same-day control, not only the frozen second reading.** The second reading is ONE pair, drawn
once, nine days ago. A single pair at n = 40 moves by a few items between runs, and the model build
and CLI defaults behind it may have moved too. Comparing today's rule arm with that one frozen draw
would attribute run-to-run noise to the rule. The control arm re-runs the unchanged instrument under
identical conditions, so the comparison isolates the rule. The frozen reading is still reported, and
C1–C2 against it is a direct test-retest reading of the unchanged instrument.

**Why four annotators per arm when the method asks for two.** The PRIMARY reading in each arm is its
first pair (R1–R2, C1–C2): the two-annotator reading comparable with both earlier documents. The other
two annotators exist so that each arm yields six pairwise readings, which lets a difference between
the arms be read against the spread inside an arm rather than against nothing. The six pairs share
annotators and are not independent of each other; they are reported as a spread, never as six samples.

## The procedure

Each annotator runs in a fresh directory under this session's scratchpad: outside the repository, with
no `CLAUDE.md` anywhere up its parent chain (checked). `ANTHROPIC_API_KEY` is unset and
`CLAUDE_CODE_OAUTH_TOKEN` is hydrated from `~/.storytree/secrets.json`, then:

```
claude -p --model claude-opus-5 --tools "" --strict-mcp-config --no-session-persistence \
          --output-format stream-json --verbose  < prompt-<arm>.txt
```

This is Claude Code 2.1.212. No `--effort` is passed, so the CLI default applies to both arms alike.

**Blindness is checked mechanically on every run, never taken from the annotator's own account.** A
run's `init` event must report a `cwd` outside the repository, `tools: []` and `mcp_servers: []`, and
its stream must hold zero `tool_use` events. Separately, a configuration probe under the identical
invocation (`probe-prompt.txt`) reported no project documentation in context. It answered `UNKNOWN`
for `prove-it-gate`, a term this repository's CLAUDE.md defines, so a reader holding that file would
know it, and for `grow tell roam ask`, the tripwire earlier blind-reader work here validated. It
answered correctly for two ordinary controls, `merge base` and `Cohen's kappa`. The same probe also
listed tools it did not have (its `init` event says `tools: []`), which is why the mechanical record,
not self-report, is the check.

**Validity is judged on FORMAT only.** An output is valid when its result parses as a JSON array of
exactly 40 objects, every sample id appears exactly once, and every `mode` is one of the 19 labels
spelled exactly. An invalid output is kept under `rejected/`, reported, and its slot re-run from
scratch, at most twice. A slot that still fails is left empty and its arm is read over the annotators
it has, and the readout says so. No label is ever corrected by hand, and no run is discarded for what
it answered.

## The readings

`storytree resteer agreement` (`cohensKappa`, `packages/library/src/resteer-report.ts`) on every
within-arm pair (six per arm), at mode grain (19 labels) and category grain (5), with observed
agreement always beside kappa.

## The verdict, fixed now

**ADOPT the rule only if BOTH conditions hold. Otherwise DECLINE it and record the reading.**

**(A) It does not lower agreement.** At BOTH grains, the RULE arm's mean observed agreement over its
six pairs is no more than one item (0.025 at n = 40) below the CONTROL arm's mean over its six. The
criterion uses observed agreement, not kappa, because the rule is EXPECTED to move labels between
`tool-defect` and `incorrect-verification`. That changes how concentrated the label distribution is,
and kappa's chance correction moves with concentration, so a criterion on kappa could be passed or
failed by the marginals alone. Kappa is reported beside it throughout.

**(B) The seam leaves the disagreement table.** A SEAM SPLIT is an item on which the two annotators
of a pair answer exactly `incorrect-verification` and `tool-defect`. Summed over each arm's six pairs,
the RULE arm has fewer seam splits than the CONTROL arm. If the CONTROL arm has none at all, the RULE
arm must have none either; the criterion is then met vacuously, and the readout says so.

One boundary is deliberately NOT in (B): `incorrect-verification` versus
`no-or-incomplete-verification`. It sits inside MAST FC3 and the rule does not address it. The second
reading's `bun-test-runs-a-mis-parameterised-instrument-to-completion` disagreement sits on that
boundary, not on this seam, even though the increment counted it among the two seam items. Counting it
here would credit or charge the rule for a boundary it does not touch. It is reported separately, and
any damage the rule does to it is already caught by (A).

## Reported, but deciding nothing

- Each arm's primary pair against the frozen second reading (mode 0.875 observed / 0.832 kappa;
  category 0.975 / 0.933).
- The per-item PAIRED difference between arms. For each item, take the share of an arm's six pairs
  that agree on it; average the RULE-minus-CONTROL difference over the 40 items, with a
  normal-approximation 95% interval, at both grains.
- Label distributions per annotator, and how many labels moved between `tool-defect` and
  `incorrect-verification`. This is the category-grain consequence the increment named: verification
  failures routed into the extension.
- Every disagreement in each primary pair, with both stated reasons.

## What this reading cannot tell, stated before it is taken

1. **Whether the rule generalises.** The candidate was authored by the session that saw this sample's
   seam, and it is measured on that same sample. A pass says two blind readers apply it consistently
   to the records that exposed the seam without losing agreement on the rest of them. It does not show
   the rule holds on records nobody has looked at.
2. **Human-annotator reliability.** Every annotator is the same model and shares its priors. That most
   likely overstates independence, as both earlier readings recorded.
3. **Anything comparable to a published figure.** ADR-0513 D3: the only comparisons made are internal,
   between today's arms and against the earlier readings of this sample.

## What each verdict does

- **ADOPT:** the tie-break replaces `mast-failure-frame`'s "the frame supplies no tie-break"
  paragraph, this reading joins its list of measured readings, and ADR-0515's parked sentence is
  annotated in place. No enum changes, because the rule adds no label.
- **DECLINE:** no rule enters the frame. The frame's overlap paragraph and ADR-0515 record that a
  tie-break was measured and declined and point at the readout, so nobody re-runs the question without
  its answer.
