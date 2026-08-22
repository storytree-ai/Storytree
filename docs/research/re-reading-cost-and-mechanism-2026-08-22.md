# Is re-reading waste, or drift-resistance? Neither — 2026-08-22

Measured for `linked-session-context-arc-inc-27`. Reproduce with `pnpm probe:re-reads`.

**The short answer.** Re-reading a Library document is not a bill worth cutting, and it is not
observable drift-resistance either. It costs **0.014% of all context this project has ever written**.
The measurement that made it look expensive was counting several context windows as one session.
**No remedy is warranted, and the specific remedies previously listed — a within-session cache,
peek-before-pull, splitting large documents — would each buy a rounding error.**

The owner's hypothesis (2026-08-21) was that re-reading might be good model behaviour rather than a
bill. It is right to reject the bill. It is not supported as drift-resistance: the documents that
hypothesis predicts would be refreshed after long gaps are the ones refreshed soonest.

---

## 1. What was measured, and where it came from

Every `storytree library artifact <id>` invocation found in a Bash tool input across
**4,161 host transcripts** under `~/.claude/projects/*storytree*`, spanning **2026-06-08 to
2026-08-21**. Each invocation is joined to its own `tool_result`, so its cost is the characters that
actually entered the window rather than what the document weighs on disk.

**768 context windows** carried at least one Library read — **399 parent** windows and
**369 subagent** windows.

A host transcript is one context window by construction. That is the whole reason this probe reads
transcripts instead of the traversal trace, and section 3 is what that choice is worth.

| what the invocation did | count | share |
| --- | ---: | ---: |
| `body` — rendered a whole document into the window | 3,111 | 88.2% |
| `field` — `--raw <field>`, one field, not the document | 284 | 8.1% |
| `to-file` — `--out <path>`, bytes went to disk, not the window | 114 | 3.2% |
| `write` — `--set`, not a read at all | 17 | 0.5% |

Only the 3,111 `body` reads can be re-read in any meaningful sense. Counting the other 415 as
document reads is one of the ways the earlier figure inflated.

## 2. The cost, with a denominator

Across the same transcripts and the same window, total context **written** into all storytree
sessions — fresh input plus cache creation, excluding cache reads — is **1,551M tokens**
(14.1M uncached input + 1,537M cache creation), against 212M tokens of output. Cache reads, the
re-processing of already-resident context, total 49,156M.

| | tokens | share of context written |
| --- | ---: | ---: |
| all Library reading | ~3,987k | 0.26% |
| **re-reads specifically** | **~219k** | **0.014%** |

Re-reads are **13.4% of reads by count but 5.5% by cost** — the repeat is systematically cheaper than
the first read, because repeats skew toward small documents and toward `--raw`/clipped forms.

The cache-read multiplier does not rescue the waste case. Context written is re-processed ~31.7× on
average across this corpus (49,156M / 1,551M), but that multiplier applies to *all* resident context,
so the ratio is unchanged: ~0.011% of everything processed. Re-reads land late in a window
(median position 0.75 through the window's reads), so they accrue *less* re-processing rent than the
average token, making 0.014% an upper bound rather than an estimate.

**Per window this is roughly 285 tokens.** There is no bill here.

## 3. Why the earlier measurement said otherwise

The 2026-08-20 figures — 72 pulls, 39 re-reads, 1.29M characters, and the headline **28 pulls of one
document in one session** — came from the traversal trace. The trace mis-attributes reads in two
independent ways, and both inflate the answer.

**(a) Its `sessionId` is the worktree slot, and slots are pooled.** Every context window that ever
ran in a slot shares one id: the parent session, each subagent it spawns, and every later session the
pool hands the same slot to. Pooling turns N windows that each read a document once into one
"session" that read it N times.

The headline case is exactly this. Slot `clever-mestorf-1041a3` shows a 219.7-hour span with a
58.9-hour internal gap. Ground truth from the transcript directories for that slot: **11 parent
sessions over 800 KB each, between 2026-07-30 and 2026-08-14**, plus roughly seventy short ones, plus
18 subagent windows. Segmenting the slot's trace at a 4-hour idle gap yields 9 segments, and the 28
`plan` pulls distribute as **5, 5, 5, 3, 3, 2, 2, 2, 1**.

> **The worst genuine single session read `plan` five times, not 28** — about 22k tokens, not 123k.

Measured across the whole corpus, pooling by slot rather than by window moves the re-read share from
**13.4% to 32.0% (×2.39)**, and the re-read *cost* share from **5.5% to 31.2% (×5.7)**. The median
slot holds 2 context windows; the p90 holds 8; one holds 137.

**(b) The observer only records the bare three-token form.** `observeCliInvocation` returns no events
when `argv.length !== 3`, so every read carrying a flag is invisible to it. In this corpus that is
**72.3% of all reads** — 2,054 `--pg`, 464 `--raw`, 96 `--pg` variants, 38 `--json`, and the rest.

So the trace over-counts repeats and under-counts reads at the same time. Any per-session ratio taken
from it is wrong in a knowable direction, and the two errors do not cancel.

**A third inflation was in the counting, not the instrument.** Field extractions and output paging read
as repeats. An agent pulling `--raw status`, then `--raw outcome`, then `--raw body` of one artifact
is doing one targeted lookup three ways, not reading a document three times; an agent re-running a
command with `| tail -20` and then `| sed -n '/^## Options/,$p'` is paging one read through the
output limit. Even after classification 68.8% of re-reads still have zero intervening reads, and
inspecting those pairs shows 71% are one document paged across two commands with different output
filters — so the immediate-repeat class is mostly this, not forgetting.

## 4. The drift-resistance hypothesis, tested directly

If re-reading holds instructions steady across a long session, the effect should be concentrated in
**operating** documents — the ceremonies, agent definitions and standing rules an agent must keep
obeying — and should show as refreshes after long stretches of other work. Work documents, the
subject matter of one task, should show no such pattern.

| bucket | body reads | re-reads | share | gaps > 60 min | median gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| operating | 596 | 82 | 13.8% | **2.4%** | 2.7 min |
| work | 403 | 63 | 15.6% | 9.5% | 2.7 min |
| other | 2,112 | 272 | 12.9% | 11.0% | 3.1 min |

**The prediction fails in the direction that matters.** Operating documents are not re-read more often
than work documents, and their long-gap tail is the *smallest* of the three — 2.4% against 9.5% and
11.0%. Where the hypothesis expects the longest gaps, the data shows the shortest.

What the gaps do look like: 88.5% of re-reads follow within two intervening reads, and the median gap
is under three minutes. That is the shape of an agent working *on* a document — pulling it, editing,
pulling it again to check — not of a session returning to its instructions after drifting away.

**This is a negative result about a mechanism, not about the owner's instinct.** It says the effect is
not visible in `library artifact` traffic. It does not rule out drift-resistance happening through
channels this probe cannot see (file re-reads, the guidance projections re-injected at session start),
and it does not test whether suppressing re-reads would hurt — nobody should suppress them, because
section 2 says there is nothing to gain by trying.

## 5. What was deliberately not built

The increment's step 3 asked whether re-reading correlates with session outcome, as the gate on any
remedy. **That experiment was not run, and the reason is that the gate closed earlier than expected.**
An outcome study — arms with and without the ability to re-read, blind prompts, a control — is the
right instrument for deciding whether to *remove* a behaviour. At 0.014% of context there is no
candidate removal to justify it, so the study would have cost real spend to inform a decision nobody
would take. If a future change makes re-reading expensive — much larger operating documents, or a
runtime that bills resident context differently — that is when the experiment earns its cost.

## 6. Reading this probe honestly

`pnpm probe:re-reads` is a **floor**. It counts `storytree library artifact <id>` in Bash tool inputs
only; reads through the studio, the desktop chat mount, or a direct store call are invisible to it.
Every figure is a property of one laptop's history, which is why it is a `probe:` and not a `check:` —
no repo invariant could be held to it, and wiring it into `pnpm gate` would turn "this box has a short
history" into a red.

A sweep costs about 90 seconds over 1.9 GB of transcripts and touches no database and no network.
