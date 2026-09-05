# Do a session's knowledge-graph reads have phases? — testing ADR-0524 D5

**Date:** 2026-09-06 · **Branch:** `claude/infallible-lovelace-09fe94` ·
**Increment:** `composition-bar-replaces-occupancy-bar` on `context-window-composition-arc`

## The question, and why it was asked before anything was drawn

ADR-0524 D5 records an owner hypothesis about how the knowledge-graph segment of the new composition
bar should break down:

> *"The knowledge graph also needs a breakdown in my opinion, sessions navigating the knowledge graph
> have distinct phases i imagine, theres the mandatory context injection, then onboarding themselves
> on the task, and then follow on searches as the agent finds it needs more knowledge to forfill its
> task."*

The word `i imagine` is load-bearing, and the decision holds it: **the implementing work must
establish from the traces that the phases exist and are separable BEFORE drawing them**, and must
report honestly if the shape is different — two phases, four, or a continuum. Drawing three invented
bands would manufacture exactly the false structure this arc exists to remove.

**Verdict: the first boundary is real and exact. The second is not there. The third phase, as
characterised, does not exist. Nothing was drawn.**

---

## Method

Two probes over this machine's host transcripts (`~/.claude/projects/**/*.jsonl`), each typechecked
before it was run (`tsc --strict --noUncheckedIndexedAccess`) so its numbers rest on something the
compiler agreed with.

- **Population.** 4,232 **window-keyed** transcripts — a uuid base name, i.e. one context window.
  Slot-keyed legacy files were excluded: a worktree slot pools several windows, and a "position
  within the session" is meaningless across a pooled file.
- **Analysed subset.** 559 windows with **≥20 tool calls and ≥4 knowledge-graph reads**. Below either
  floor a window has no phase structure to have, in the same way a three-point series has no shape.
  That subset carries **7,007** knowledge-graph reads.
- **Classification.** `packages/context-traversal-transcript/src/tool-subjects.ts` — the same
  classifier this increment shipped, so the finding and the drawn bar cannot disagree. A
  knowledge-graph read is a `storytree` CLI read recognised positively from the command's argv shape;
  writes (`--set`, `arc increment close`, `question settle`, …) are excluded by name.
- **Position.** Each read's index among **all** the window's tool calls, normalised to `0` (first
  call) … `1` (last). Repeated on a **cumulative tool-bytes** axis, because bytes is what the bar
  actually draws.
- **Cross-check.** The knowledge-graph share of tool output came out at **9.0%** here against the
  **10.40%** measured on a different 60-window sample in
  `context-window-composition-2026-09-05.md` §2 — close enough to say the two classifiers agree, and
  the gap is the expected direction (that sample was allowlist-based over a smaller, more recent set).

---

## 1. The distribution is a BATHTUB, not a decay

Where all 7,007 reads sit in their window, by decile of session progress:

| decile | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| reads | **1,730** | 549 | 461 | 446 | 480 | 492 | 453 | 598 | 686 | **1,114** |

Quartiles: p10 `0.020` · p25 `0.103` · **median `0.461`** · p75 `0.808` · p90 `0.951`.
32.6% of reads land in the first fifth.

There **is** an opening burst — 24.7% of every knowledge-graph read in a session lands in the first
tenth of it. That much of the hypothesis holds.

What follows it is not a taper. Deciles 1–6 are almost flat (~450–500 reads each, ~6.5% apiece), and
then reads **rise again** to a second peak at the end: deciles 8 and 9 together hold **25.7%**.

On the **cumulative tool-bytes** axis — the axis the bar draws — the back-loading is stronger still:

| decile | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| reads | 974 | 537 | 384 | 406 | 411 | 516 | 513 | 682 | 753 | **1,833** |

First fifth **21.6%**, last fifth **36.9%**. Measured in the unit the picture would use, the
"onboarding burst" is not even the dominant feature.

## 2. The late burst is CEREMONY, not "follow-on knowledge"

Surface composition per decile (top four each):

| decile | composition |
|---|---|
| 0 | `library-artifact` 54.6% · `arc` 39.7% · `adr` 2.5% · `friction` 1.0% |
| 1 | `library-artifact` 58.6% · `arc` 22.4% · `adr` 8.8% · `library-search` 3.1% |
| 4 | `library-artifact` 58.8% · `arc` 17.5% · `adr` 13.3% · `tree` 5.2% |
| 7 | `library-artifact` 59.0% · `arc` 20.0% · `adr` 9.5% · `friction` 7.3% |
| **9** | **`arc` 49.8%** · `library-artifact` 41.0% · `adr` 4.8% · `friction` 2.4% |

Deciles 1 through 8 are compositionally near-identical. The last decile inverts: `arc` becomes the
majority surface. That is the **closing leg** — `arc show` to write the increment residue — and
`friction` peaking in deciles 6–8 (5.1% / 7.3% / 5.4%) is the **retro**. The second burst is the
merge ceremony, not an agent discovering it needs more knowledge.

## 3. "Follow-on searches" is not a phase — searches do not sit later

Median position by surface, over the same 7,007 reads:

| surface | n | median position | p25 | p75 |
|---|---:|---:|---:|---:|
| `library-artifact` | 3,759 | 0.435 | 0.097 | 0.770 |
| `arc` | 2,122 | 0.458 | 0.041 | 0.914 |
| `adr` | 572 | 0.540 | 0.294 | 0.780 |
| `friction` | 215 | **0.701** | 0.426 | 0.812 |
| `tree` | 124 | 0.457 | 0.326 | 0.661 |
| **`library-search`** | **121** | **0.515** | 0.179 | 0.782 |
| `library-query` (`related`) | 36 | **0.281** | 0.179 | 0.499 |
| `open-question` | 15 | **0.044** | 0.032 | 0.201 |

The owner's third phase is named by a verb: *follow-on searches*. Search verbs are **1.7% of all
knowledge-graph reads** (157 of 7,007), and they do not sit late — `library-search`'s median (0.515)
is barely above `library-artifact`'s (0.435), and `library-query` sits **earlier** than the corpus
average. The two surfaces that genuinely separate are `open-question` (very early — orienting on what
is waiting) and `friction` (late — the retro), and both are ceremony.

## 4. And no per-window boundary is findable, which settles it

The aggregate shape above cannot be drawn anyway. A bar is drawn for **one** window, so a band needs
a boundary in **that** window. Testing for one: within each window, take the largest gap between
consecutive knowledge-graph reads and compare it with the second-largest. A clean split has a
dominant gap.

- largest-gap ÷ second-largest ratio: p25 `1.38` · **median `2.15`** · p75 `4.06` · p90 `11.40`
- windows where the largest gap is ≥2× the next: **308 / 559 (55.1%)** — barely better than half
- where those dominant gaps sit: p10 `0.014` · p25 `0.029` · median `0.075` · p75 `0.271` ·
  p90 `0.473` — a **34-fold spread**
- share of a window's reads falling before that gap: p25 `28.6%` · median `48.8%` · p75 `67.2%`

So for 45% of windows there is no dominant gap at all, and for the 55% that have one it sits anywhere
from 1% to 47% through the session. A drawn boundary would have to pick a threshold that roughly half
the windows contradict, and the "first phase" it carved off would be anywhere between a quarter and
two-thirds of the reads depending on which window you opened.

---

## What this means for the bar

**The first boundary is real, exact, and ALREADY DRAWN — just not inside the knowledge-graph
segment.** "Mandatory context injection" is not a knowledge-graph *read*; it is labelled harness
injection that arrives before the session calls anything — `project-guidance`, `harness-catalogue`,
`hook-injection` (which is where the library-definition injections land), `harness-reminder`, plus the
`harness-floor` residual. Every one of those is its **own segment** on the shipped bar, separated by a
label rather than by a threshold. The owner's phase 1 is therefore visible already; it simply sits
*beside* the knowledge-graph segment rather than inside it.

**Phases 2 and 3 are not separable and were not drawn.** What the traces show is one opening burst, a
long compositionally-uniform middle, and a closing ceremony burst — and no per-window boundary a
picture could honestly place.

**One sub-breakdown IS exactly separable, and is computed but not drawn.**
`WindowComposition.knowledgeSurfaces` carries the knowledge-graph segment split by the surface each
read reached (`library-artifact`, `arc`, `adr`, `library-search`, …). That is a **label**, not a
threshold, so it needs no hypothesis. It answers *what kind of knowledge*, not *when* — a different
question from the one D5 asked, and a change to this picture is its own question with its own
decision (ADR-0511). It is carried on the wire so that whoever asks it next finds the data waiting.

## Reproducing this

Both probes are disposable and were not committed — they are a measurement, not machinery, and
`context-window-composition-2026-09-05.md` set the precedent that a reader worth keeping becomes a
package module (which is what `tool-subjects.ts` now is). The classifier they used **is** committed
and tested, so a re-run is a fold over `classifyToolSubject` plus the positional arithmetic in §1–4.

## A caveat worth carrying, found while measuring

On this machine the bar's **`file reads` segment is frequently empty**, and that is not a defect. The
root guidance instructs sessions in bypass-permissions mode to read files through `Bash` (`cat`,
`sed -n`) rather than the `Read` tool, so those bytes land under **`shell`**. The subject cut reports
what the transcript recorded; it cannot look inside a shell command to see that it was a file read
without inspecting a body, which ADR-0516 D3 forbids. Read `shell` as *"a command, and this classifier
does not open commands"* — the honest reading, and the reason the segment is named for the mechanism
rather than for a guess about intent.
