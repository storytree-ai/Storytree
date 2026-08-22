# Refactor panel — `anti-slop/no-conditional-empty-object-spread`

**Convened** 2026-08-22 by `anti-slop-adoption-arc` increment `inc-04`, under ADR-0407 D3.
**Panel** REFACTOR panel, three judges, blind, two controls.
**Spec** `tools/oxlint/panels/no-conditional-empty-object-spread.refactor-panel.json`
**Procedure** `tools/oxlint/panel-procedure.md`

**This is a PROOF RUN of the refactor panel, and its verdict is `inc-05`'s to act on, not this
increment's.** `inc-04` was chartered to build *and prove* both panels. The rule panel proved itself on
`no-unsafe-dictionary-type` and rejected it — which meant the refactor panel correctly did not convene
there, because it runs only after a rule panel upholds. Rather than hand `inc-05` a gating instrument
with an unexercised half, it was run against the rule the arc itself names as the clearest
refactor-panel case. **The rule's terminal state is unchanged — it stays `off`, awaiting `inc-05`.**

---

## The finding

| Seat | Rule A *(control-uphold)* | Rule B *(control-reject)* | **Rule C — the target** |
|---|---|---|---|
| `refactor-shape` | refactor-partial (medium) | refactor-partial (high) | **refactor-found (high)** |
| `functionality-loss` | refactor-partial (medium) | refactor-partial (high) | **refactor-found (high)** |
| `boundary-integrity` | refactor-partial (medium) | refactor-partial (high) | **refactor-found (medium-high)** |

Rule A = `anti-slop/no-chained-type-assertions` · Rule B = `synthetic/no-separated-type-imports` ·
Rule C = `anti-slop/no-conditional-empty-object-spread`.

**3–0 `refactor-found` on the target.** A viable shape exists for all twelve sampled sites, all three
judges produced the same two shapes independently, and none reported anything becoming impossible or
unsound.

### The shape the panel converged on

**Where one optional property is involved** — a base object plus a ternary, or a guarded assignment:

```ts
const result: PushResult = { branch, commitSha, pushed: true, detail };
if (prUrl !== undefined && prUrl.length > 0) result.prUrl = prUrl;
return result;
```

**Where two or more are** — an annotated local, then one guarded assignment each:

```ts
const payload: PatchDocRequest = { id: input.id, fields: input.fields };
if (input.actor !== undefined) payload.actor = input.actor;
if (input.kind !== undefined) payload.kind = input.kind;
```

Both typecheck under `exactOptionalPropertyTypes`: it forbids *assigning `undefined`*, and every
assignment sits inside a guard that has already narrowed the value to a defined type. **The compiler
setting the arc expected to collide with the rule turns out not to.**

### Five costs the panel named — every one of them is a real instruction for `inc-05`

1. **The annotation is load-bearing, and omitting it is a silent regression.** `const x: T = {…}` keeps
   excess-property checking on the initializer and checks every later assignment against `T`. Written
   `const x = {…}`, TypeScript infers a type *without* the optional property, the assignment fails —
   and where it happens to compile, the literal is no longer fresh at the return, so excess-property
   checking silently disappears. Two judges raised this independently; one called it the single place
   this rule can move an unchecked claim rather than remove one. **A fix that hoists without
   annotating must be treated as a regression, not a pass.**
2. **Key insertion order changes wherever the conditional property is not last.** Inert for most
   consumers, and *not* inert for anything hashed or compared byte-wise. This repo signs verdicts and
   computes anchors over spans, and one sampled site builds an HTTP wire body
   (`storage-protocol/src/http-store.ts:143`). Check per site; the gate will not check it for you.
3. **`readonly` optional properties cannot be conditionally assigned.** The compliant shape there is a
   `Mutable<T>` mapped-type draft handed over by a checked assignment. ⚠ **Not** an `as T` — that
   trades this rule's violation for a `no-chained-type-assertions` one.
4. **Discriminated unions cannot be built incrementally**, so they need the base-plus-ternary shape.
   Same trap: reaching for a cast to make an incrementally-built object fit a union manufactures a
   violation of an already-adopted rule.
5. **Anonymous shapes acquire names.** Several sampled sites rely on contextual typing from an inline
   argument position and would need a named — sometimes exported — type. That is real added surface,
   and it is where the lane's cost actually sits.

### The cross-rule collision — the most valuable thing this run produced

All three judges, independently and unprompted, found that **this rule and the already-adopted
`no-chained-type-assertions` pull against each other.** Forwarding optional properties across a
re-typed function seam under `exactOptionalPropertyTypes` — which is the honest fix for a chained
assertion — is written with *exactly* the conditional-spread idiom this rule bans. As one judge put
it: whichever is adopted second inherits the cost.

`no-chained-type-assertions` is already at `error` in production source. So `inc-05` is not choosing
between two candidates; it is adopting a rule whose compliant shape is the one construct the standing
rule's remedy needs. That is not a blocker — the shapes above avoid it — but a lane that discovers it
mid-migration will have to redo work.

---

## Did the instrument discriminate? Both controls passed on mechanism, and both exposed a flaw in MY control design

Recorded honestly rather than as a clean sweep, because neither control returned the label I predicted.

**Rule A — expected `refactor-found`; returned `refactor-partial` ×3.** Ground truth is that the
refactor *was performed*: `inc-03` drove all 33 production sites to zero with the typecheck green.
Every judge found compliant shapes for most sites, but each reported 1–3 as resisting — chiefly the
vendored UMD/JSON module interop, where they judged the available shape (a `declare module` override)
wider in blast radius and no more true than the local assertion. That is a defensible position rather
than a miss, and it is *more* conservative than what actually shipped. **Recorded as a partial pass:
the control was not failed — no judge said `no-viable-refactor` — but "partial ×3" is not
"found ×3", and a reader should know the panel under-reports feasibility on vendored-type interop.**

They also found something the control was not looking for. All three independently identified a hole
in `no-chained-type-assertions` **as adopted**: the chain can be laundered across a statement
boundary —

```ts
const raw: unknown = value;
const typed = raw as T;      // legal, lints clean, checks exactly as much as the chain did
```

— which satisfies the rule's letter and defeats its stated purpose, and which no syntactic matcher can
distinguish from a real fix. One judge warned that a mechanical fixer would convert twelve visible
chains into twelve invisible ones. **`inc-09` needs this before it touches the 126 test-file sites:
score the fix by whether a runtime check appeared, not by whether the cast disappeared.**

**Rule B — expected `no-viable-refactor`; returned `refactor-partial` ×3, with the mechanism exactly
right.** Every judge reached `verbatimModuleSyntax` unaided: `import type { X } from "m"` is erased,
`import { type X } from "m"` emits `import {} from "m"`, a real module load — and identified the
documented vite config-load trap in the sampled evidence as the concrete break. But all three were
*more precise than my expected answer*: there is a free subset — the handful of sites that genuinely
do import the same module twice — where merging is emit-identical and costs nothing. **My `expected`
overstated the control.** The correct expected answer was "no viable refactor for the type-only
majority; a free merge for the true duplicate pairs", and the judges supplied the correction. One went
further and named a durable trap in even the safe merges: delete the last value binding later and
`import { createServer, type IncomingMessage } from "node:http"` silently becomes a side-effect
import nobody intended, detected by nothing.

**The lesson for the procedure, now written into it:** a control's expected answer is a claim the
operator has to get right, and a panel more precise than its control is evidence the control was
sloppy — not that the panel drifted.

---

## Cost

| | Refactor panel |
|---|---:|
| Judges | 3 |
| Judge tokens | 293,037 |
| Wall clock (parallel) | ~9m 27s |

Per judge ~97.7k tokens — the same per-seat cost as the rule panel, so **the three-judge refactor
panel is ~61% of a five-judge rule panel**. Wall clock ran longer per judge than the rule panel
(the shape seat had to write actual compliant code for twelve sites), so parallel wall clock was
comparable despite two fewer judges.

**Increment `inc-04` total judge spend: 1,252,521 tokens across 13 judges in three runs** (two rule
panels — one discarded — and one refactor panel). Excludes the driving session's own spend, which is
larger and not separable from the increment's other work.

---

## What `inc-05` should do with this

- **Adopt-and-refactor is the expected outcome here.** Under the owner's narrowed bar, adopting needs
  no panel; the rule is not contested. This run says a shape exists and names it.
- **Start from the five costs above**, particularly the mandatory annotation (1) and the two traps
  that would manufacture a `no-chained-type-assertions` violation (3, 4).
- **The rule stands at 654 findings** measured at HEAD on 2026-08-22, up from the 646 in
  `inventory.md`. 564 of the original count were production source.
- **The terminal state is still `off`.** This increment proved the instrument; it did not do the
  migration.
