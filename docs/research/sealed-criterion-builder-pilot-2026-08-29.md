# Sealed-criterion builder pilot — 2026-08-29

**Increment:** `sealed-criterion-builder-pilot` · **Decision:** ADR-0474 (D2, D3, D4, D5)

Qualifying the **builder**, not its tests. A planter authors one acceptance criterion the builder
never sees; it runs after `CONFIRM_GREEN`. The question is whether builders build to the LETTER of a
spec or to its INTENT.

---

## 1. The number

**Trip rate: 0 of 5.** Every builder satisfied a criterion it was never shown.

| unit | the sealed criterion (a generalisation the visible spec entails but never states) | verdict |
|---|---|---|
| `parseDuration` | a multi-digit value (`'120s'`) — every visible example was single-digit | **passed** |
| `slugify` | surrounding whitespace yields no leading/trailing hyphen | **passed** |
| `chunk` | a length not divisible by `size` leaves a short final chunk | **passed** |
| `redactSecrets` | a *second* key in the same string is also redacted (the classic missing-`/g`) | **passed** |
| `mergeRanges` | unsorted input still merges — output order was promised, input order never was | **passed** |

Verdicts are mechanical: each sealed criterion is a `node:test` file run against the builder's
`impl.mjs`; `exit 0` is a pass. No model judged whether a builder "understood the intent"
(ADR-0474 D4).

---

## 2. Why they passed — the mechanism, from the builders' own artifacts

A zero trip rate could mean builders generalise, or it could mean the mines were trivial. The
builders' committed code distinguishes the two, and it says **generalise**:

| unit | what the builder wrote, unprompted |
|---|---|
| `parseDuration` | `/^(\d+)([smh])$/` — `\d+`, though it was only ever shown one digit |
| `slugify` | `.trim()` **and** `.replace(/^-+|-+$/g, '')` — it stripped edge hyphens nobody asked about |
| `chunk` | a `for (i += size)` slice loop, which handles a remainder by construction |
| `redactSecrets` | `/sk-[A-Za-z0-9]{8,}/g` — the **`g`** flag |
| `mergeRanges` | `[...ranges].sort((a,b) => a[0]-b[0])` — it sorted input it was only ever given pre-sorted |

Stronger still: **one builder independently wrote a test for the sealed criterion itself.** Unit 4's
builder authored `replaces multiple API keys in the same text` — a third test beyond the two visible
acceptance criteria, expressing exactly the held-out behaviour. Unit 2's builder likewise wrote
`result is a valid URL slug`, generalising criterion 3's phrasing into a property.

So the builders did not merely happen to pass. They reached the generalisation, and in two of five
cases wrote it down as a test of their own.

---

## 3. Isolation — verified, not assumed

A leaked criterion yields a pass that means nothing, which is worse than no experiment.

- **Structural.** Sealed criteria live in `pilot-sealed/`, a sibling directory of `pilot/`. Each
  builder prompt named exactly one path — `pilot/uN` — and instructed it to read and write nothing
  outside. No prompt contained the sealed behaviour, or any hint that a held-out criterion existed.
- **Pre-registered.** All five sealed criteria were frozen (`pilot-sealed/PRE-REGISTERED.md`) BEFORE
  any builder ran. Neither the criteria nor the fairness rule could be adjusted after seeing output.
- **Mechanically checked.** A grep of every builder-written file for the sealed markers
  (`sealed`, `120s`, `sk-wxyz5678`, `[[5,6]`, the whitespace fixture) returned **nothing**. No
  builder reproduced a sealed fixture, which is what a leak would look like.
- **No coaching.** The prompts said "keep it simple and idiomatic" and nothing about edge cases,
  robustness, or thoroughness. Coaching would have been contamination in the same way a visible mine
  is (ADR-0474 D2).

**The planter was not the builder** (ADR-0474 D3). The sealed criteria were authored by this session
in the story-author seat; each build ran in a separate agent with a fresh context that received only
the visible spec.

---

## 4. Fairness

ADR-0474 requires every trip classified fair / over-specified. **There were no trips, so the column
is empty** — recorded rather than silently dropped.

Classified as authored, against the stated test (*does the visible spec, read by a careful reader,
entail the sealed behaviour?*): four of the five are unambiguously **fair** — unit 4's visible spec
says "EVERY API key", unit 5's promises ascending *output* while never constraining *input*, unit 3's
"splits an array" must place every element, unit 1's says "parses a duration string" without
restricting magnitude. Unit 2's is the weakest: it leans on visible criterion 3's phrase "a valid URL
slug" to entail no edge hyphen. Had unit 2 been the only trip, it would have been the one to argue
about.

---

## 5. What this pilot does NOT establish

Stated plainly, because the recommendation rests on it.

1. **The units are small and synthetic.** Five self-contained functions, not five real storytree
   capabilities. This was forced, not chosen: `already-built-capability-has-no-red-to-observe`
   records that `CONFIRM_RED` is fail-closed, so a capability whose implementation and test already
   exist has no red left — and the repo's genuinely drivable remainder is **~3 capabilities**, not
   five. A five-story pilot over real story builds was not available at any price.
2. **Small units are where builders generalise most easily.** A 20-line pure function is exactly the
   case where the correct generalisation is obvious. A trip rate of 0/5 here is weaker evidence about
   a builder writing a 400-line integration than it looks.
3. **Five is a small n**, and one model family on one day.

The honest reading: **on units of this size, builders build to intent rather than to the letter, with
the generalisation visible in their code and sometimes in their own tests.** That is a real result and
it is the one the increment asked for. It does not license a claim about large units.

---

## 6. Recommendation to `adopt-what-the-experiments-earned`

**Adoption candidate 3 — sealed criteria as a story-authoring practice — is REFUSED.**

The increment's own decision rule settles it before any judgement is needed: *"A trip rate near zero
means builders already generalise correctly and the machinery should NOT be built."* The trip rate is
zero.

Three further reasons point the same way:

- **The cost is real and lands on the expensive seat.** ADR-0474 concedes sealed criteria roughly
  double the acceptance-criterion writing for a story, and story authoring is already the most
  expensive seat in the factory. Doubling it to detect a behaviour observed zero times out of five is
  a bad trade at any trip rate this pilot can support.
- **It would tax the honest case.** A sealed criterion that trips an honest builder is a guard the
  legitimate case must argue with, which this owner has rejected before
  (`owner-rejects-guards-that-tax-the-honest-case`). With a 0/5 trip rate the only trips a wider
  rollout would produce are disproportionately the *unfair* ones — the mine that was over-specified —
  because the fair ones do not trip. **The instrument's expected yield is skewed toward false
  accusations.** That is the strongest argument against it and it is not a cost ADR-0474 anticipated.
- **Isolation does not survive contact with the real factory.** Here it held because the units were
  toys in a scratch directory. In the real loop a builder reads the repo and queries the live store,
  and the sealed criterion would have to live *somewhere* — a store row, a file, a spec section —
  reachable by the very agent it is hidden from. ADR-0474 already names this as genuinely hard; this
  pilot did not solve it, it side-stepped it.

**The experiment has paid for itself** under ADR-0447 D5 / ADR-0474 D5: it bought the decision not to
build, plus a positive finding about builder behaviour that no surface in the factory measured before.

**Worth keeping, at no cost:** the finding in §2 — that builders generalise past the visible criteria
and sometimes test the generalisation unprompted — is the useful residue. It is evidence that the
acceptance-criterion tier does not need to enumerate every case to get correct behaviour on small
units, which is an argument for *shorter* specs rather than longer ones.
