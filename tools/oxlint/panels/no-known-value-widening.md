# `no-known-value-widening` — adjudication record

`anti-slop-adoption-arc` increment **inc-08**. Adjudicated 2026-08-22.

**Terminal state: `error`, count driven to zero.** The rule is ADOPTED.

**No RULE panel was convened, and that is the correct procedure rather than a shortcut.** A rule panel
exists to justify a REJECTION (`panel-procedure.md`, "When you need a panel, and when you do not"), and
the owner narrowed the rejection bar on 2026-08-21 to a closed list of two: adopting would lose
functionality, or there is a genuine exceptional set the rule cannot express. The route this increment
was originally parked on — that 57% of the firings are a house-style position about inline object
return types — is neither, and the arc's intent says so in terms: *"an inline object return type is
neither a functionality loss nor an exceptional case, it is just a lot of sites."* Volume is explicitly
not a ground. So the rule was adopted without adjudication, and the one open question was the REFACTOR
SHAPE.

A **REFACTOR panel** was convened on that question, because it is a real fork with a real consequence
and the arc's standing rule is that a genuine disagreement is not settled by one session's preference.

---

## The measurement

Reproduced 2026-08-22 against `origin/main` at `1cb4ee5d`, with a copied config and `-c` (never
`-A all` plus `-D`, which silently under-reports JS-plugin rules). **518 firings** — the increment's
map of 513 still holds; `main` moved five sites under it.

| Family (widening target :: position) | Total | Source | Test | Files |
|---|---:|---:|---:|---:|
| anonymous object :: return value | 291 | 180 | 111 | 156 |
| open dictionary :: binding | 114 | 86 | 28 | 72 |
| open dictionary :: return value | 63 | 30 | 33 | 41 |
| anonymous object :: binding | 16 | 10 | 6 | 15 |
| open dictionary :: assertion | 9 | 3 | 6 | 7 |
| unknown :: return value | 9 | 1 | 8 | 9 |
| anonymous object :: assertion | 7 | 0 | 7 | 4 |
| unknown :: binding | 5 | 5 | 0 | 4 |
| other (property / `object` targets) | 4 | 1 | 3 | 3 |

**The site count is not the work count, and the difference is large enough to change how the lane is
sized.** The rule reports one finding per RETURN STATEMENT, so a function with four returns is four
findings. The dominant family's 291 findings are **220 distinct functions** — 115 in source across 77
files, 105 in tests across 79. `parseOfferFollow` alone is four of them. Nobody had this number before;
the increment's own note that "count and file spread did not predict this lane's cost" holds again here,
one level down.

A second split, taken because the panel's answer turns on it:

| Dominant-family functions | Source | Test |
|---|---:|---:|
| exported | 55 | 0 |
| internal | 60 | 105 |
| MUST be named (exported, or an empty `[]`/`{}` in some return) | 63 | 6 |
| may simply lose the annotation | 29 | 95 |

And for every `open dictionary` firing (186 across all positions), the KEY type of the target:

| Key | Count |
|---|---:|
| BROAD (`string` / `number`) | 143 |
| CLOSED (a finite union — `KnowledgeKind`, `ExpectedRed`, `Tier`, `ProbeLevel`, …) | 39 |
| unresolved by the scan | 4 |

The closed-key set is the one the rule's own stated ground does not describe: `Record<SomeUnion, V>` is
a TOTAL map, so annotating it discards no key knowledge at all. This is recorded as a finding about the
rule below, not as an exemption — every one of those sites still complies, and complies *better*.

---

## The refactor panel

Spec: `no-known-value-widening.refactor-panel.json`. Seed `anti-slop-inc-08-refactor-panel`,
12 sites per specimen, tests excluded (ADR-0407 D4). Three lenses, one judge each, no shared context,
each told to read its brief and nothing else.

Both controls are inc-04's, **reused verbatim** — their expected answers are held independently of this
panel and of that one, which is what makes reuse legitimate rather than lazy.

### Verdicts, by seat

| Seat | Rule A (control-uphold) | Rule B (control-reject) | **Rule C (target)** |
|---|---|---|---|
| `refactor-shape` | `refactor-found` (high) | `refactor-partial` (high) | **`refactor-found` (high)** |
| `functionality-loss` | `refactor-partial` (medium) | `refactor-partial` (high) | **`refactor-found` (medium)** |
| `boundary-integrity` | `refactor-found` (high) | `refactor-partial` (medium) | **`refactor-found` (high)** |

**Rule C: 3–0 `refactor-found`. No dissent on the verdict.** The dissent that exists is about
confidence and about which shape applies where, and it is recorded in the house answer below because it
changed the answer rather than merely qualifying it.

### The controls — the instrument discriminated

**Rule A — PASS, with a finding on one seat.** Two of three returned the expected `refactor-found`.
`functionality-loss` returned `refactor-partial`, and it is right: it isolated the one site
(`@xterm/headless` interop) where `typeof HeadlessTerminal` is a constructor type, the only available
runtime check is `typeof x === "function"`, and so no validating shape exists — "both compliant options
are worse than what is there now." The expected answer was written from the *aggregate* result of
inc-03's migration and flattened that residue. Record the correction against the control.

**Rule B — PASS WITH A FINDING, and the same finding inc-04 recorded against this same control.** All
three returned `refactor-partial` where the key said `no-viable-refactor`. All three reached
`verbatimModuleSyntax` unaided, all three stated the emit table correctly (`import type {X}` erases;
`import {type X}` emits `import {} from 'm'`, a real module load), and all three independently found the
same split the key had flattened: merging is FREE where a value import from that specifier already
exists (3 of the 12 sites), and converts a zero-emit type dependency into a runtime module edge for the
other 9. Two seats went further and identified, from a comment inside the evidence, that one such
conversion would go green locally and red only in CI Build.

That is one notch off the predicted label in the predicted direction, with a better reason than the key
carried. Per the procedure, this is **PASS WITH A FINDING**, not a pass — and the expected answer is
corrected here rather than restated: a small free subset does exist, and "none" was wrong.

**A panel that returned `refactor-found` for everything would be worthless. This one did not.** It
returned three different labels across three specimens, and the one it was least confident about is the
one where the ground truth was itself imprecise.

### Cost

**299,988 judge tokens** across 3 judges in one run (99,990 / 100,024 / 99,974). Wall clock 8.2–9.7
minutes per judge, run concurrently. This EXCLUDES the driving session's own spend, which is not
separately visible to it — naming that gap rather than quietly omitting it, per the procedure.

Against inc-04's ~293k for a three-judge refactor panel, this is the same price to within 2%, which is
now two independent measurements of the same instrument and can be planned against.

---

## The house answer

The increment asked for ONE answer applied uniformly rather than a per-site coin flip. The panel
returned one rule with a **mechanical predicate**, which is the same thing: the branch is decided by a
property of the site, not by taste.

### 1. Inline anonymous object RETURN annotation — the dominant family

> **NAME THE TYPE when the function is exported, or when any return branch contains an empty `[]` or
> `{}` literal. Otherwise delete the annotation and keep the inference.**

All three seats reached the naming half independently, and two of them called it *required* rather than
preferred:

- `boundary-integrity`: "The remedy is *name it*, not *infer it*."
- `functionality-loss`: "Deleting a return annotation moves the contract from the declaration to the
  callers. In a monorepo with no build step, where packages export raw TypeScript, the declaration site
  is the only API-surface document there is."
- `refactor-shape`: "Naming rather than dropping is **required** here: `return { lines: [], next: [] }`
  with no contextual type infers `never[]`, and the exported signature would become a union whose
  `never[]` member breaks any caller that pushes."

**The empty-literal trap is the load-bearing half of this answer and it was found by all three seats.**
A migration that mechanically deletes annotations produces a green typecheck at the declaration and
`never[]` errors at distant call sites — `refactor-shape` states the recipe as "name it, or check every
early-return literal, not delete the annotation."

Where a name is wanted but the shape is genuinely the body's, `export type X = ReturnType<typeof f>`
is available and cannot drift from the body — flagged by two seats, with the caveat that it inverts the
dependency and expands structurally in hover text.

### 2. `Record<ClosedUnion, V>` binding — 39 sites

> **`as const satisfies Record<Union, V>`.**

Free, and strictly better than what is there: `satisfies` still enforces totality, so a new union member
still fails to compile until it is mapped, and the literal types survive. Two seats noted this
*creates* an exhaustiveness fence that does not exist today — `refactor-shape` on `KIND_FOR_EXPECTED`,
`boundary-integrity` on `INCREMENT_STATUS_RANK` / `CATEGORY_TO_GROUP` / the `SceneKind` table: "a fifth
increment status, a new artifact kind, or a new scene role would go red at the map instead of silently
falling through."

### 3. `Record<string, V>` genuinely indexed by an arbitrary runtime string

> **A `Map`, or `satisfies` plus a reader function. NEVER `TABLE[key as keyof typeof TABLE]`.**

This is the one place the panel says the rule takes something away: `Record<string, V>` together with
`noUncheckedIndexedAccess` is exactly what makes `table[arbitraryString] ?? FALLBACK` a checked
expression, and narrowing the key set stops that compiling.

All three seats independently rejected the obvious minimal patch. `refactor-shape`: it "**swaps the
annotation for a type assertion** — it moves the unchecked claim rather than removing it."
`boundary-integrity` called the two-binding form "the one place in Rule C where a claim moves *away*
from its check rather than toward it" and priced it at one extra binding per map.

`functionality-loss` named the residual cost precisely, and it is real: `const M: ReadonlyMap<…> = new
Map([...])` is itself an annotation over a `new` expression and so is banned by this same rule, meaning
a `Map` binding gives up the `Readonly<>` fence unless it is hidden behind a named-return factory. That
is a genuine loss, bounded and nameable — recorded here, not treated as grounds for anything, because
the rule remains adoptable with it.

Two seats also warned that `Map` is not spreadable or JSON-serialisable, so each conversion must be
checked against whether the table is ever spread or crosses the studio's JSON API.

### 4. Annotations that discard nothing

> **Delete them.**

`#requestHeaders(): Record<string, string>` spreads an already-open record; inference yields the same
type. `refactor-shape` flags these as a real adoption cost rather than a correctness one:
"a rule whose flag list mixes load-bearing sites with no-op sites spends the attention the load-bearing
ones need."

---

## A finding about the rule, recorded and NOT acted on

`classifyWideningTarget` returns `open dictionary` for **any** `Record<K, V>` without ever inspecting
`K` — so `Record<"a" | "b", V>`, a total map over a closed key set, is classified identically to
`Record<string, V>`. The rule's own stated ground is that the annotation "discards known type
evidence"; over a closed key union it discards none, because the annotation requires every key the union
has.

The asymmetry is internal to the vendored rule rather than a matter of opinion: `dictionary-types.ts`
already ships `isBroadMappedKey`, and `classifyAliasBroadTarget` puts MAPPED types through it — a
mapped type is only an open dictionary if its key is broad. `Record` is simply never put through the
same check.

**This was NOT turned into a narrowing, and the reason is that a narrowing would be worse.** All 39
closed-key sites comply, for free, and complying makes them *better* — `as const satisfies` keeps the
totality check the annotation was buying and adds the literal types it was throwing away. Narrowing the
rule to skip them would remove a fence the panel identified as one of the rule's best returns in this
codebase. A narrowing is a first-class outcome on this arc, and this is a case where the evidence
pointed at one and the evidence against taking it was stronger. Filed here so the next reader does not
re-derive it.

---

## What the panel could not see

Recorded because two seats volunteered it rather than guessing, which is worth more than the answers
they gave:

- **Call-site blast radius for the lookup tables.** All three flagged that they could not size the
  `Record<string, V>` conversions from the brief, because the read sites were not in the excerpt window.
  That is a limit of the packet, not of the panel; the migration resolved each one against the compiler.
- **Whether specific tables are spread or serialised**, which decides whether the `Map` shape is
  available at that site.
- `functionality-loss` and `boundary-integrity` both named the same three unresolvable dependencies and
  declined to guess. Neither went to look, which is the constraint the panel's blindness rests on.
