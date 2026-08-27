# Which EARS templates earn their place? — a sample of the contract corpus

**Date.** 2026-08-27. **Arc.** `test-strength-beyond-red-green-arc`, increment
`ears-grammar-at-the-contract-line`. **Decision.** ADR-0459. **Parent decision.** ADR-0447 D4.

ADR-0447 D4 declined every spec-driven-development tool and adopted exactly one idea from EARS: the
constrained sentence form at the contract line. Its increment left one question open and told the
consuming session to settle it **by measurement, not by assumption** — *do all five EARS templates
(ubiquitous / event-driven / state-driven / optional-feature / unwanted-behaviour) earn their place
here, or does a narrower grammar cover our contracts?*

This is that measurement. It is the reason ADR-0459 adopts **two** forms and not five, and the reason
the grammar's keyword vocabulary is read off this corpus rather than off the notation.

**Do not re-run this sweep to re-derive the same numbers.** Re-run it only to check whether the corpus
has moved enough to reopen a refusal.

---

## 1. Method

The subject is the `asserts —` bullet of every contract declared under `stories/**`. That bullet is the
contract SENTENCE — the prose an agent reads to infer trigger, system and response before writing the
test — and it is the only place the three slots could be named.

Contracts were extracted with the repo's **own** parser, `parseContracts` in
`packages/library/src/contracts.ts` (ADR-0262), never a second regex written for the occasion. A
throwaway script walked `stories/**/*.md`, parsed each body, and pulled each contract's `asserts` and
`covers` obligations. The script was deleted after the run; every number below is reproducible from
`parseContracts` plus the classifications stated inline.

**Population.** 1,254 declared contracts across 255 capability specs. 1,234 carry an `asserts` bullet;
**20 do not**.

---

## 2. The headline: two forms, not five

Classifying each sentence by what opens it:

| EARS template | how it opens | population | share |
|---|---|---:|---:|
| **ubiquitous** | its own subject — the invocation IS the trigger | **927** | 75.1% |
| **event-driven** | a trigger clause | **307** | 24.9% |
| *state-driven* | `while` / `during` | *8* | *0.6%* |
| *optional-feature* | `where` | *1* | *0.08%* |
| *unwanted-behaviour* | `if` / `unless` | **0** | **0%** |

(The three italicised rows are subsets of the trigger-led 307, not separate populations — they are
shown to size each EARS template against the corpus that would have to adopt it.)

### 2.1 The unwanted-behaviour template has no population at all

Zero sentences of 1,234 are written `IF <condition> THEN the <system> SHALL <response>` — while **673
carry refusal or negative semantics** (`refuses`, `rejects`, `denies`, a 4xx status, `throws`, `fails
honestly`, `never`).

Our authors write a refusal as an ordinary sentence whose RESPONSE is the refusal:

> `question new` refuses a missing `--arc`, a dangling `--arc`, and an `--arc` naming a doc of another
> kind — before writing anything.

That already names all three slots. Adopting `IF…THEN` would mean rewriting 673 sentences into a form
nobody here writes, in order to name slots they already name. **Refused.**

### 2.2 State-driven and optional-feature are real but tiny, and mechanically identical here

8 `while`-led and 1 `where`-led. Both are genuine English distinctions — a state that HOLDS is not an
event that FIRES — but the grammar exists to serve three consumers, and for all three the distinction
is inert:

- the **example test** arranges a state exactly as it arranges an event;
- the **property test** quantifies over the trigger's input domain either way;
- the **mutation expectation** binds to the response, not to the trigger's tense.

So they fold into one TRIGGERED form. Nothing is lost that any consumer could have used.

---

## 3. The introducer vocabulary is read off the corpus, not off the notation

This is the load-bearing half, and it is where importing EARS whole would have done real damage.
Leading words of the 1,234 sentences, counted:

| introducer | count | | introducer | count |
|---|---:|---|---|---:|
| `with` | 75 | | `on` | 10 |
| `given` | 37 | | `while` | 8 |
| **`when`** | **27** | | `against` | 3 |
| `for` | 18 | | `where` | 1 |
| `over` | 17 | | `without` | 1 |
| `after` | 12 | | `under` | 1 |
| | | | `from` | 1 |
| **gerund lead** (`clicking …`, `rendering …`, `typing …`) | **96** | | `if` / `unless` | **0** |

**EARS's own four keywords would reject the majority of our trigger-led contracts.** `with` and
`given` each outrank `when`. Gerund-led triggers alone (96) outnumber `when` + `after` + `on` combined
(49). A grammar built from the notation would have redded the house style.

ADR-0459 therefore accepts EARS's four **plus** every lead measured here — 19 introducers — and a
lowercase gerund. Keeping EARS's four costs nothing and means a contributor who writes the notation
properly is not rejected.

### 3.1 `SHALL` is not adopted

**Zero occurrences in 1,234 sentences.** House style is the third-person present indicative — `returns`,
`refuses`, `renders`, `emits`. `shall` is a *deontic* modal: it says what the system OUGHT to do, where
a test asserts what it DOES. Importing it would be taking the notation for its own sake, which is the
failure ADR-0447 D4 declined the SDD tools to avoid.

---

## 4. Which slot is our corpus actually thin on? — the SYSTEM

The finding that decided what the rung checks, and it is not the one the notation predicts. Our
contracts are **trigger-rich and response-rich in prose**; what they inconsistently name in
machine-readable form is the **system**.

| | count | share of 1,234 |
|---|---:|---:|
| no code span anywhere in the sentence | 299 | 24.2% |
| no code span in the first 120 characters | 382 | 31.0% |
| **no code span AND no `covers —` bullet** | **113** | **9.2%** |

The third row is the honest offender set: 113 contracts name their system *nowhere a machine can read*.
Those are the sentences a test binding, a property's domain and a mutant have nothing to attach to:

> representative world state becomes the public model; Studio effect handles never cross into the view.
>
> selection/focus events invoke the current controller and return through the model.
>
> scene/sprite/trail/arrival and Storybook/Vector tests stay green; unchanged legend/inspector/chat/camera
> tests remain a regression wall, not moved scope

The third of those asserts about the TEST SUITE rather than about any system at all.

**Adopted rule set, and its standing population:** `asserts-missing` (20) + `system-unnamed` (113) =
**133 of 1,254 (10.6%)**, spread over 77 capability specs. Non-vacuous, and small enough that a ratchet
over new and edited contracts is the proportionate instrument.

---

## 5. Four candidate rules were tried and REFUTED by this same sample

Recorded so nobody re-invents them. Each was measured before being judged, and each failed on its own
offenders rather than on taste.

**5.1 A response-verb vocabulary. REFUTED.** A hand-written list of house verbs "failed" 104 sentences
(8.4%). Inspection showed the LIST was wrong, not the sentences — `becomes`, `mounts`, `joins`,
`builds`, `bakes`, `imports`, `states` were all missing. A closed verb list is precisely the document
this increment was warned against ("anything that grows into a document is this increment going
wrong"), and its maintenance cost is unbounded.

**5.2 A trigger clause must close with a comma. REFUTED.** 29 trigger-led sentences carry no comma. All
inspected offenders are correct English whose slot boundary is perfectly clear:

> after archival the post's prior events (incl. cites) are unchanged in the log
>
> with `selection={null}` the card renders nothing (returns null)

The rule enforces punctuation, not slot naming.

**5.3 A TRIGGERED sentence must name its system in the sentence itself, not only in `covers`. REFUTED.**
68 of 307 triggered sentences carry no code span, and their `covers` bullets name the system perfectly:

> **asserts —** after a first send settles to a terminal frame and a second send is made, BOTH exchanges
> are present in the transcript, in order
> **covers —** `apps/studio/src/components/ChatPanel.tsx` (the ordered-transcript accumulation on submit)

Demanding both is redundant ceremony.

**5.4 Segmenting the response into clauses. REFUTED WITHOUT RE-MEASURING** — this corpus already
refused it once. ADR-0262 declined a clause-granular coverage denominator because the segmentation is
unfaithful ("splitting on `;` reads a four-obligation contract written in comma-and-dash prose as ONE
clause") and because the numerator does not exist. Rebuilding it here would repeat a refuted move.

The consequence, stated plainly: **the RESPONSE slot is not mechanically judged.** That is a refusal,
not a gap, and it bounds what a green on this rung means — see ADR-0459's Consequences.

---

## 6. Reproduction

The sweep needs no database and no credential. Walk `stories/**/*.md`, run each body through
`parseContracts` from `@storytree/library`, and take each contract's `asserts` / `covers` obligation by
label. Classify the lead with the same two patterns the rung uses
(`packages/cli/src/contract-grammar.ts` → `TRIGGER_INTRODUCERS`, the gerund lead), and count.

The rung itself prints the live form census on every run, so the two headline numbers never need a
script again:

```bash
pnpm check:contract-grammar
```

On 2026-08-27 that printed `1254 contracts declared (307 triggered / 947 ubiquitous)`. The 947 exceeds
§2's 927 by exactly the 20 contracts carrying no sentence at all, which the rung counts as ubiquitous
and charges under `asserts-missing`.
