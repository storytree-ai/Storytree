# Rule panel — `anti-slop/no-unsafe-dictionary-type`

**Convened** 2026-08-22 by `anti-slop-adoption-arc` increment `inc-04`, under ADR-0407 D3.
**Panel** RULE panel, five judges, blind, two controls.
**Spec** `tools/oxlint/panels/no-unsafe-dictionary-type.rule-panel.json`
**Procedure** `tools/oxlint/panel-procedure.md`

**Terminal state: `off`.** Rejected unanimously, on functionality loss.

---

## The verdict

Two runs. **Run 2 is the verdict of record**; run 1 was discarded after the panel found a defect in
the packet (below). The labels were identical in both runs — same seed — so the two are comparable.

### Run 2 — the record

| Seat | Rule A *(control-uphold)* | **Rule B — the target** | Rule C *(control-reject)* |
|---|---|---|---|
| `rule-merits` | adopt-narrowed (high) | **reject (high)** | reject (high) |
| `codebase-architecture` | adopt-narrowed (medium) | **reject (high)** | reject (high) |
| `future-maintainer` | adopt-narrowed (high) | **reject (high)** | reject (high) |
| `skeptic` | adopt-narrowed (medium) | **reject (high)** | reject (high) |
| `false-positive` | adopt-narrowed (medium) | **reject (high)** | reject (high) |

Rule A = `anti-slop/no-chained-type-assertions` · Rule B = `anti-slop/no-unsafe-dictionary-type` ·
Rule C = `synthetic/no-separated-type-imports`.

**5–0 REJECT on the target, at high confidence, with no dissent on the verdict.** Run 1 returned the
same 5–0 reject, so the verdict survived the packet repair unchanged.

### Did the instrument discriminate? Both controls passed.

**Rule A — expected UPHOLD, held independently by the compiler.** Not rejected by any judge in either
run. Every judge narrowed rather than plainly adopting, and their narrowings converged without
contact: permit the chain where the assertion target *claims nothing* — an index-signature or
all-`unknown` bag — and error where it asserts a concrete contract. Three judges independently
identified `knowledge-render.ts:33` as the site that looks like the permitted family and is not,
because its target names concrete value types the document violates. That is the site the compiler
had already convicted, found blind. **Recorded as a PASS with a finding**: the expected answer was
uphold, and uphold is what came back — but "adopt-narrowed ×5" is not "adopt ×5", and the narrowing
is real evidence for `inc-09`, which owns the remaining test-file sites.

**Rule C — expected REJECT on functionality grounds.** Rejected 5–0 at high confidence, and every
judge reached the predicted mechanism on their own: `verbatimModuleSyntax` is on, so
`import type { X } from "m"` is erased while `import { type X } from "m"` emits `import {} from "m"`
— a real runtime module load. Complying would manufacture runtime edges that do not exist. Several
judges went further than the control required and found that the rule fires on nine of twelve sites
where its own duplication rationale does not apply at all.

A panel that upholds a rule the compiler already convicted, and refuses a plausibly-worded rule that
would break the build, is adjudicating rather than agreeing.

---

## Why the rule was rejected

The panel's grounds, and they land on the arc's closed list of two admissible reasons — **not** on
volume, which no judge was shown.

**1. FUNCTIONALITY LOSS — the plain-object type guard becomes inexpressible.**
`packages/context-traversal-transcript/src/correlate-transcripts.ts:67` is
`function isPlainObject(value: unknown): value is Record<string, unknown>`. Under the rule that
predicate cannot be written: any narrower value type would be an unproven claim, asserted by the
function whose entire purpose is to avoid unproven claims. Three judges reached this site
independently and called it decisive alone — *"a rule that errors on the narrowing predicate is a
rule that will be suppressed at every honest boundary in the repo."* The same holds for
`claim-history.ts:94`'s tolerant doc lift.

**2. GENUINE EXCEPTIONAL SET — the shape-blind store seam, which is a structural commitment.**
`storage-protocol` persists and returns documents *without knowing their shapes*; readers
`.safeParse()` on the far side. `store-parity.ts:269` — the conformance suite every backend is held
to — could not be written under the rule. As one judge put it, the rule would make the seam
inexpressible in its own package.

**3. The rule's own remedy is circular at every flagged site.** It says to parse payloads into a real
type *before* insertion, but each site **is** the parse: an HTTP body reader shared across routes with
different schemas (`backend-entry.ts:262`), a foreign CLI's JSON event stream
(`codex-author.ts:292`), a third-party `settings.json` (`ambient-presence.ts:194`). You cannot parse
a value you have not yet given a type to.

**4. It inverts the safety ordering it is reaching for.** The rule bans `unknown` in the same breath
as `any`, and they are opposites: `any` erases checking and propagates, `unknown` forces a check at
every read. With `noUncheckedIndexedAccess` on, every read out of these dictionaries already arrives
narrowed — the obligation the rule complains is "handed to every caller" is discharged three lines
below each site. Banning it pushes authors toward `any`, or toward a fabricated value type asserted
over unvalidated input, which is exactly the harm `no-chained-type-assertions` exists to catch. Two
judges observed that adopting Rule A and Rule B together is self-contradictory.

**What the panel conceded to the rule.** One site is a fair hit: `SceneView.tsx:485`'s
`handlersFor(): Record<string, unknown>` returns React handlers whose type is knowable, so `unknown`
there discards information the author owns. Four of five judges named it. One defensible site out of
twelve does not carry an error-level rule.

---

## The dissent — and it is about the REMEDY, not the verdict

There was **no dissent on rejecting the rule**. There was a live disagreement about what to do next,
and it is recorded here because it changed this increment's outcome.

The obvious salvage is to narrow: ban `any` / `object` / `{}` as dictionary value types and permit
`unknown`. **It was built in this increment and then reverted**, because three judges raised it
unprompted and refused it:

> *"That narrowed rule flags zero of the twelve evidence sites: it is a different rule, not a
> narrowing of this one, and adopting it under this heading would let a wrong proposal pass by
> quietly swapping its content."* — `skeptic`

> *"The part of the claim that is true catches nothing here, and the part that catches everything
> here is false. That asymmetry is why I reject rather than narrow."* — `rule-merits`

> *"I will not manufacture an adoption out of a rule that has demonstrated nothing."* —
> `false-positive`

Measured against this repo the same day: **all 613 findings carry the `unknown` tag — zero `any`,
zero `object`, zero `{}`.** So the narrowed rule fires on nothing here, and adopting it would have
been an adoption on no evidence, wearing this panel's authority.

**This is not a refusal of the idea, only of the route.** Four judges said they would likely support a
`Record<string, any>` ban proposed on its own evidence. That is a separate proposal for a later
increment, and it must carry its own justification rather than inherit this one.

**The REFACTOR panel did not convene, correctly.** It runs only after a rule panel upholds
(`inc-04`'s charter). The rule panel rejected, so there was no shape to hunt for.

---

## The instrument found its own defect, and that is the most reusable finding here

**Run 1's evidence was corrupted, and the panel is what caught it.** oxlint reports span offsets as
**byte** offsets; the sampler sliced UTF-16 code units. Every non-ASCII character earlier in a file
pushes the two apart, and this codebase's comments are full of em-dashes — three bytes against one
code unit. So the line reading *"The rule flags: X"* pointed somewhere else entirely:
`arc-rollup.ts:307` rendered as `v === "string" ? v : ""` instead of `Record<string, unknown>`.

The context window was built from the diagnostic's `line`, not its offset, so it was correct — which
is why the packet looked fine and the judges still reasoned about real code. Two judges reported the
mismatch. **One of them counted the apparently-broken diagnostics against the rule under
adjudication**, writing that a rule whose reported location is not the thing it objects to *"cannot
be adjudicated at the site by the person it stops."*

That is the damage worth naming: a defect in the *instrument* was read as a defect in the *subject*,
and it pushed the verdict toward the answer the operator already expected. The verdict was re-taken
on repaired evidence rather than kept. Fixed in `readSite` (byte slicing), held by a regression test
carrying em-dashes ahead of the span, and written into the procedure's traps.

**The generalisable rule, now in `panel-procedure.md`: if a panel reports something odd about the
evidence, treat it as a finding about the packet before treating it as a finding about the rule.**

---

## Cost

| | Run 1 | Run 2 | Total |
|---|---:|---:|---:|
| Judges | 5 | 5 | 10 |
| Judge tokens | 479,856 | 479,628 | **959,484** |
| Wall clock (parallel) | ~4m 45s | ~4m 47s | ~9m 32s |

Per judge: ~96k tokens, ~3–5 minutes, one tool call each (read the brief). Runs are parallel, so
wall clock is the slowest judge, not the sum.

**Read as ~480k output tokens per five-judge rule panel.** That is the number the owner asked for when
he authorised panels on the basis that they are normally too expensive — *"We dont use llm judge
panels much because they are expensive but in this case i think its viable."*

**What this does NOT include, stated rather than quietly omitted:** the driving session's own spend —
building the instrument, sampling, and writing this record — which is far larger than the panel
itself and is not separable from the increment's other work. The 959k is the judges only.

**For `inc-05`, which has seven rules to adjudicate:** seven five-judge panels at this rate is ~3.4M
judge tokens. That is affordable but not free, and there are two obvious economies — **batch several
target rules into one packet** (the builder already takes N specimens, and the controls are then
amortised across all of them rather than paid per rule), and **use the three-judge refactor panel
shape** where the question is narrower. Batching is the bigger win and is the recommended default;
the blinding gets *stronger* with more rules in the packet, not weaker.

---

## What a later lane should take from this

- **The rejection bar was met on ground 1 (functionality loss), not on volume.** The judges were
  never shown a count — the builder refuses packets that state one. That is what makes this a
  measurement rather than a negotiation.
- **`no-conditional-empty-object-spread` is the arc's named refactor-panel case** (646 findings, 564
  in source, colliding with `exactOptionalPropertyTypes`). It has not been panelled. Under the
  owner's narrowed bar, adopting needs no panel — so the question there is the refactor panel's
  ("is there a shape that satisfies both"), not the rule panel's.
- **`no-runtime-typeof` (727) is the next candidate to be mis-sorted**, for the reason `inc-03` filed
  as friction: lane cost is predicted by the rule's message shape, not by its count.
- **Rule A's convergent narrowing is free evidence for `inc-09`.** Five judges, no contact, all drew
  the same line: permit the chain where the target claims nothing (index-signature or all-`unknown`
  bags), error where it asserts a concrete contract. `inc-09` owns the 126 remaining test-file sites
  and should start from that line rather than re-deriving it.
