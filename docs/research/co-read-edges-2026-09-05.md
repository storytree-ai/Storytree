# Co-read edges — does reading two decisions in one sitting mean anything?

Measured 2026-09-05 for `follow-the-research-arc-inc-04`. Reproduce with:

```
pnpm probe:co-read-edges --top 25
```

**Answer: yes, and by a wide margin on the one test that can be checked.** Co-reading recovers the
edges we DID author at **13.3x the rate chance predicts**. The novel pairs it surfaces are therefore
worth looking at — with two caveats below that a reader must carry, and one confound that turned out
smaller than hand inspection first suggested.

---

## 1. Why this was asked

Every traversal here follows an **authored** edge — `library tree focus`, the depth walk,
`adr list`'s back-edges, the calibrate-set closure — so all of them are blind to the same thing: the
decision that bears on your subject and that nobody linked. The only existing answers,
`library search` and `library related --unlinked`, rank by TEXT SIMILARITY, which is a guess.

A co-read is an **observation** instead: two decisions read in one sitting were, by someone's working
judgment at the time, relevant to the same problem. The precedent is Hebbian co-activation (HeLa-Mem,
`arXiv 2604.16839`), where edge weight strengthens on co-retrieval.

## 2. The population, and the two decisions that shape it

Source is the **host transcripts**, not the traversal trace store — the same call `gatherReads`
already makes, because transcripts are the only source carrying the host CONTEXT WINDOW id, and the
two sources overlap by construction so unioning them would double-count.

| | |
|---|---:|
| transcript files scanned | 3,799 |
| resolved decision reads | 2,625 |
| reads naming a non-decision | 0 |
| reads carrying no window id | 0 |
| context windows | 404 |
| windows reading 2+ distinct decisions | 278 (68.8%) |
| distinct decisions read | 412 |

**THE SESSION KEY IS `windowId`, NEVER THE WORKTREE SLOT.** Slots are pooled — shared by a parent
session, every subagent it spawns, and every later session handed the same slot; one slot hosted 11
parent sessions over 15 days. Keying on the slot would join decisions read WEEKS APART BY DIFFERENT
SESSIONS into a "co-read", and it would do so in the direction that inflates exactly the number this
probe reports. Pinned by `co-read: the SAME two decisions in DIFFERENT windows make NO pair`.

**IDS RESOLVE THROUGH THE ONE DOOR.** A raw-string join was measured on this population at 31 of
3,391 (0.9%) against 1,098 of 3,391 (32.4%) once both sides resolve to a decision number — a ~35x
under-count that reports no error (ADR-0403 dec 7).

## 3. The result

| | |
|---|---:|
| possible pairs (412 decisions) | 84,666 |
| distinct co-read pairs | 4,049 (**4.8%** of possible) |
| already connected by an authored edge | 390 (9.6%) |
| **novel — no authored edge reaches them** | **3,659 (90.4%)** |
| novel, seen in 2+ windows | 447 |
| novel, numerically adjacent (gap ≤ 5) | 258 (7.1% of novel) |
| support populations, never summed | amends 517 · dependsOn 795 |

### ★ The validating test, and why the raw recall figure alone is unreadable

| | |
|---|---:|
| authored edges whose BOTH ends were read | 614 |
| ...of those, ever co-read | **390 (63.5%)** |
| expected by chance at this density | 29.4 |
| **observed / chance** | **13.3x** |

**"63.5% of authored edges were co-read" means nothing on its own.** If the observed pair set covered
most of the possible pairs, that recall would be arithmetic rather than evidence. The null is what
makes it a finding: at 4.8% density, chance predicts 29.4 recoveries and we observe 390.

The denominator matters too — only edges whose BOTH ends were read *could* have been co-read, so
scoring against all 1,312 support edges would report a low number that says nothing about co-reading
and everything about what went unread.

## 4. ⚠ Three things a reader must carry

**(a) THE CHANCE MODEL IS CRUDE, AND 13.3x IS AN UPPER BOUND.** It assumes pairs are drawn uniformly
at random from all possible pairs. Real reads cluster by topic whether or not an edge exists, so a
topic-matched null would be more conservative than a uniform one. The direction of the finding is
safe; the multiplier is not a precise effect size. Do not quote 13.3x as if it were one.

**(b) PAIR COUNT IS QUADRATIC IN A WINDOW'S READS, and one window produced 406 pairs on its own** —
roughly 29 distinct decisions in one sitting. A reader who cannot see that figure cannot tell a broad
signal from one session's wandering, which is why the probe prints it. The 90.4% novel headline is
inflated by long sittings; **447 novel pairs in 2+ windows is the credible candidate set**, not 3,659.

**(c) THE ADJACENCY CONFOUND IS REAL BUT SMALL — and hand inspection overstated it.** Consecutively
numbered decisions are usually authored in one sitting about one subject, so a session reading both
has discovered nothing that the numbering did not already say. The top novel pairs look alarming on
exactly this axis:

```
  9 windows   ADR-0294 + ADR-0295
  8 windows   ADR-0323 + ADR-0324
  7 windows   ADR-0323 + ADR-0325
  7 windows   ADR-0324 + ADR-0325
```

But across the whole novel set only **258 of 3,659 (7.1%)** are within a gap of 5. **The confound is
concentrated in the high-strength tail, not pervasive** — which is the opposite of what the sample
suggested, and is why the probe counts it rather than leaving it to the eye.

## 5. What this does NOT license

**No weighting, ranking, decay or surfacing.** A co-read edge is a HYPOTHESIS about relatedness, not
a relation. ADR-0513 D6 requires the weighting work — ACT-R base-level activation, exposure-bias
correction, agent-allocated relevance — to land as ONE unit with its bias correction designed in,
because on a corpus that is 89% long tail a frequency-weighted edge reproduces the Matthew effect and
progressively buries what is read once or twice. This increment reports; it does not promote.

**Nothing here is comparable to a published result** (ADR-0513 D3).

## 6. What it unblocks

- **`-inc-03` (Personalized PageRank)** gains a second edge population to spread over. Worth running
  both ways — authored-only and authored-plus-co-read — since that comparison is nearly free once the
  PPR harness exists.
- **`-inc-06/07/08` (the weighting trio)** are no longer speculative: there IS signal to weight. The
  447 multi-window novel pairs are the population any weighting scheme should be judged on, and the
  chance null in §3 is the shape of test it should be held to.
