# Blind-comprehension test of the twelve promoted definitions — 2026-08-30

**Do not re-run this sweep.** It is the judgment half of the promotion bar for the twelve
`definition` artifacts landed by PR #1729 (`self-sustaining-sessions-arc`, increment
`blind-test-the-promoted-terms`). The frequency half was already measured; this asks the other
question — *would a reader who mis-resolves this term do the wrong work?* — of readers who hold no
project context at all.

## Why an in-repo subagent cannot be the reader

A first attempt on the same design was **invalid** and its verdicts must not be reused. Three
`general-purpose` subagents were spawned inside this repo, and a subagent inherits the project's
`CLAUDE.md` as a system-reminder — which is the very text the twelve definitions were derived from.
One arm confirmed it verbatim when asked afterwards: its context held the full project instructions,
and for five terms "the project text was the source, not my prior knowledge." Its own tell was that
"my confidence tracked the presence of the term in my context, not my independent knowledge of the
domain."

## The reader that was used, and how blindness was established

Four arms, each one `claude -p` invoked with **cwd outside the repository** (a scratch directory
under `%LOCALAPPDATA%\Temp`), so no project `CLAUDE.md`, no project `.claude/settings.json`, and
therefore no `UserPromptSubmit` definition-injection hook was discovered. `CLAUDE_CODE_OAUTH_TOKEN`
was hydrated from `~/.storytree/secrets.json` the way the storytree CLI does it, because a bare
`claude -p` reads a stale `~/.claude/.credentials.json` and returns a false 401. `--model` was passed
explicitly; without it the run comes up Sonnet.

- Arms 1–3: `claude-opus-5` (the primary reader — the model that actually receives the injected
  definitions in this project). The pre-registered decision rule is applied to these three.
- Arm 4: `claude-sonnet-5`, a secondary cross-model observation, not part of the decision rule.

Blindness was verified two ways before any answer was trusted, and both discriminated:

1. **Tripwire.** `grow tell roam ask` is a corpus term that appears nowhere in `CLAUDE.md`. All four
   arms answered "I don't know". (Every contaminated arm in the first attempt also answered it that
   way, which is what makes it a discriminator rather than a formality.)
2. **Direct context check.** Each arm was asked whether any project documentation was in its context.
   Three answered that only the Claude Code harness's own system prompt was present; one answered NO
   outright. None had a `CLAUDE.md`, `AGENTS.md`, memory file, or repository content.

**One residual, and it is a real finding rather than a flaw.** Three arms volunteered that the
*harness's own* prompt uses three of the seventeen terms — `worktree` (subagent
`isolation: "worktree"`), `fan out` (the Explore agent and the Workflow tool), and `drive` (the
verify/run skill text, "drive the affected flow"). That is not contamination to be removed: it is a
permanent floor for every reader in this system, so a definition of one of those three is competing
with a meaning the reader already holds. It cuts both ways below — it is why `fan out` is redundant,
and why `drive` needs a stronger correction than it had.

## The design

Seventeen terms, mixed so the classes are indistinguishable: the **12 promoted**, **3 corpus terms
deliberately not promoted** (confabulation control — should come back unknown), and **2 ordinary git
terms** (over-caution control — should come back known). Each answer gives one best guess, a
confidence, whether the phrase has an established ordinary meaning, and what the guess rests on.
"I don't know" was stated to be a valuable answer.

**Both controls behaved.** `merge base` and `squash merge`: HIGH and correct in 4/4 — the arms were
not merely cautious. `proof mode` and `node rollup`: LOW/MEDIUM generic guesses with no confabulated
system-specific detail. `grow tell roam ask`: "I don't know" in 4/4.

## Rubric (pre-registered before any arm returned)

| verdict | meaning | action |
|---|---|---|
| KNOWN | reaches the system-specific meaning *including the distinguishing property* | redundant — retire, or cut back to the non-obvious clause |
| PARTIAL-WRONG | confident, plausible, lands elsewhere | strongest keeper; check "What it is not" names that reading |
| GENERIC-ONLY | ordinary meaning, does not reach the specialisation | keep |
| UNKNOWN | no useful guess | keep |

Decision rule: 3-of-3 KNOWN retires the term; any arm PARTIAL-WRONG at HIGH/MEDIUM keeps it.

## Verdicts

| term | verdict | max conf. | what the blind readers actually said | action |
|---|---|---|---|---|
| **fan out** | **KNOWN 4/4** | HIGH ×4 | "dispatching many agents concurrently over independent slices, then collecting results — contrasted with doing the work serially in one agent's context" | **RETIRED** |
| **land** | GENERIC-ONLY | HIGH ×3 | "get a change merged into the trunk — merged, not just approved or pushed"; named as Chromium/Mozilla/Meta industry slang | **TRIMMED** to the ceremony clause |
| worktree | GENERIC-ONLY | HIGH ×4 | the git feature and parallel-agent isolation, "discarded when the agent's work is done" — **none** reached that it *is* the session's identity | keep (strongest) |
| reonboard | PARTIAL-WRONG | MEDIUM | 4/4 inverted the direction: re-onboarding *the agent* after context loss, not the owner | keep |
| self-perpetuating session | PARTIAL-WRONG | MEDIUM | 4/4: "keeps itself alive by scheduling its own next wake-up" — the mechanism `inert` explicitly forbids | keep + clause added |
| drive | PARTIAL-WRONG | MEDIUM ×4 | 4/4: "exercise the running software end-to-end, as opposed to running tests" — reinforced by the harness's own wording | keep + clause added |
| residue | PARTIAL-WRONG | LOW | 4/4 inverted the obligation: "leftover junk — scratch scripts, debug logging — cleaned before the change lands" | keep + clause added |
| chip | UNKNOWN / wrong | LOW ×4 | split between "a very small unit of work, smaller than an increment" and "a unit of budget, like a poker chip" | keep + clause added |
| inert | PARTIAL-WRONG | LOW×3 / MED | 3 Opus arms read it as **code** (dead code, dark launch); Sonnet read it as a session that is *idle* — the reading the artifact already refutes | keep |
| increment | GENERIC-ONLY | MEDIUM | the Scrum product increment — "a shippable chunk", not a parked record with a four-state lifecycle | keep |
| lane | GENERIC-ONLY | MEDIUM | the kanban swimlane; one arm added "the owner allocates work across a **fixed number** of lanes", which is the concurrency cap the owner refused | keep |
| friction | GENERIC-ONLY | HIGH (Sonnet) | the UX/DX sense — obstacles in a process — never a filed, capped, evidence-bearing artifact | keep |

**Both pre-registered hypotheses resolved, and they did not resolve the same way.**

- `worktree` — **confirmed.** 4/4 HIGH confidence, 4/4 the generic git feature, 0/4 reached the
  property that matters. Three arms described it as scaffolding "discarded when the work is done",
  which is a reader who would not understand why declaring presence requires being inside one. It is
  the strongest of the twelve.
- `land` — **not confirmed as a retirement.** The prediction that it would come back KNOWN at HIGH
  was right about the ordinary meaning and wrong about the rubric bar: no arm reached any
  distinguishing property (CI performs the merge from a non-draft PR; the closing leg is part of
  landing; an escalation is also a landing). So it is GENERIC-ONLY rather than KNOWN, and the rubric's
  *cut it back to the non-obvious clause* remedy applies instead of retirement.

## Actions taken

- **`fan-out` retired.** The only 4-of-4 KNOWN verdict, reaching this artifact's own distinguishing
  content unaided, and reinforced from outside the corpus by the harness prompt. Its extra clauses
  ("not a way around a claim"; the refused concurrency cap) are properties of `lane` and the claim
  fence and are stated there. No inbound edges at retirement. **A later `storytree vocabulary` pass
  will nominate "fan out" again on frequency — decline it with this measurement.**
- **`land` trimmed.** The injected `oneLine` now carries only the residual a blind reader lacks, and
  `whatItIs` opens with a note saying so, so a later curator does not "restore" the obvious half.
- **Four "What it is not" clauses added** — `drive`, `residue`, `chip`,
  `self-perpetuating-session` — each naming the specific reading four blind readers produced. This is
  the rubric's own prescribed action for PARTIAL-WRONG, and until now none of those four artifacts
  named the reading it exists to correct.

## Before / after, one instrument, one corpus

Measured with the **shipped** `matchDefinitions` from `packages/cli/definition-injection.mjs`
(imported, never re-implemented) over this repo's owner-prompt corpus, using `storytree vocabulary`'s
extraction: `promptSource` present and `isSidechain` false, the machine-text prose guard,
verbatim-identical prompts counted once, a 25-character floor, scoped by the `C--code-storytree`
slug prefix. 3,557 transcripts, **936 distinct owner prompts**.

| projection | defs | resolved ≥1 | cap-hit prompts | definitions evicted by the 5-cap |
|---|---|---|---|---|
| pre-promotion (before PR #1729) | 53 | 550 — **58.8%** | 91 | 338 |
| after PR #1729 (this change's baseline) | 65 | 683 — **73.0%** | 125 | 671 |
| **after this change** | 64 | 678 — **72.4%** | 122 | 665 |

Retiring `fan-out` costs **5 prompts** of hit rate: it matched 40 prompts, but in 35 of them
something else matched too. It returns 3 prompts of cap pressure and 6 evictions.

⚠ **These absolutes are not comparable to the 774-prompt / 55.0% figures recorded on the arc.** That
extraction ran earlier the same day against a smaller corpus; a day of definition-dense sessions has
since been added, which lifts both the hit rate and the cap pressure. The three rows above are the
claim, because they are one instrument over one corpus at one moment.

## What this says about the promotion bar

Eleven of twelve earn their slots, and the reason is not that the terms are obscure — it is that the
*ordinary* meaning of an ordinary English word is confidently wrong here. `residue` reads as junk to
delete when it is a note to write. `chip` reads as a small task or a budget token when it is an offer
of a whole session. `self-perpetuating session` reads as a timer loop, which is the one mechanism the
system forbids. `reonboard` points at the agent instead of the owner. Those are not gaps in
knowledge; they are confident mis-resolutions, and a confident mis-resolution is worse than an
unknown one.

The single retirement is the term whose ordinary meaning was already exactly right — and it was also
the term the harness itself teaches. **Frequency nominated all twelve; judgment kept eleven.** The
frequency half of the bar could not have found the one that failed.
