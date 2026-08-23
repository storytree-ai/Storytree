# The house TypeScript standard

**What this is.** The fifteen rules this codebase holds itself to, or has decided not to, each with
the reason. It is a DECIDED POSITION, not a migration log: every rule below is in one of exactly two
terminal states, and none is parked at `warn`.

**Where it is enforced.** `oxlint.config.ts` is the executable copy — every rule's severity and its
reason live on the rule itself. `pnpm lint` runs them, and `pnpm gate` runs `pnpm lint` as its first
step. This document is the readable one; when the two disagree, the config is right and this file
needs correcting.

**Where it came from.** `anti-slop-adoption-arc`, 2026-08-21 to 2026-08-24. The rules are
[dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) (MIT), **vendored** at
`tools/oxlint/anti-slop/` on its author's own instruction to copy and edit rather than depend —
upstream ships fifteen generic rules plus one Effect-specific rule this repo does not vendor,
because it does not use Effect.

---

## Why an outside rule set at all

Every line of this codebase was written by a model. These rules were written by people with deep
TypeScript expertise and no knowledge of this repo. So when a rule fired 2,007 times, that number
was not primarily a migration cost — it was a **measurement of the gap** between what we produce and
what a practitioner would accept, and the first outside opinion this codebase had ever received.

That framing is the owner's, and it inverted the first research pass, which costed the volume as a
burden and recommended against adopting. It also sets the bar for turning a rule OFF, below.

## The two terminal states

1. **`error`, at zero violations.** The rule is adopted and the count is nil, so it cannot fail
   today and it permanently closes a door.
2. **`off`, with a written reason on the rule itself.** The rule is rejected or does not fit, and
   the reason is recorded where a reader will meet it.

**`warn` is not a state.** A rule parked at `warn` indefinitely buys the appearance of a standard
without the substance — it is the "kept but weakened" rung `gate-machinery-audit-arc` names, and a
warning nobody must clear is a warning nobody reads. `warn` is legitimate only *inside* an increment
actively driving a count to zero.

## The bar for rejecting a rule

A closed list of two grounds:

1. Adopting the rule would **lose functionality** — some correct thing becomes inexpressible.
2. There is a **genuine exceptional set** the rule cannot express — bounded and nameable, not a
   broad seam we would rather not touch.

**Volume, house style, effort, churn and review surface are explicitly NOT grounds.** A big
migration is a reason to schedule work, never a reason to decide the rule is wrong.

Because of that bar, **adopting needs no adjudication**: a rule we agree with is simply migrated to
zero. A **panel** — five blind LLM judges — exists only to justify a REJECTION, and it must find one
of the two grounds above. Where the rule is agreed correct but the architecture resists it, a
smaller three-judge **refactor panel** hunts for a shape that satisfies both; "no viable refactor
found" is a legitimate result and the strongest available reason to turn a rule off. The procedure,
including how a packet is kept blind, is `tools/oxlint/panel-procedure.md`; the records are in
`tools/oxlint/panels/`.

---

## The nine we hold ourselves to

All at `error`, all at zero.

| Rule | What it refuses | How it got here |
|---|---|---|
| **`no-chained-type-assertions`** | `x as unknown as T` — an assertion chain, which checks nothing at either end | 33 production sites (inc-03) then 122 test sites (inc-09) migrated to zero. No exceptions anywhere. |
| **`no-module-mocking`** | `vi.mock` and friends — rewriting the module system because the code offers nowhere to substitute at | 110 sites across 31 files (inc-06), every one a test. Four seams added; production callers pass nothing. |
| **`no-conditional-empty-object-spread`** | `...(cond ? { x } : {})` — hiding a property omission behind an empty object | 666 findings across 175 files (inc-11, finished by a cross-repo republish). |
| **`no-known-value-widening`** | Annotating a value you already know as `unknown` / `object` / `Record<…>` / an anonymous shape | 518 findings (inc-08 measured and migrated, inc-10 closed the lane). |
| **`no-object-parameters`** | A parameter typed `object` | Already at zero when the inventory ran. |
| **`no-unknown-type-aliases`** | `type X = unknown` | Already at zero. |
| **`no-widen-then-assert`** | Widening a value only to narrow it straight back | Already at zero. |
| **`no-reflect-apply`** | `Reflect.apply` | Already at zero. |
| **`no-reflect-get`** | `Reflect.get` | Already at zero. |

### The four remedies, in order of preference

This is the part worth carrying into new code. When one of the adopted rules fires, reach for the
first of these that fits — the order matters more than any single remedy.

1. **Use the real thing.** A double that can be a real instance should be one:
   `new IncomingMessage(new Socket())`, `new KeyboardEvent(…)`, a real `EventEmitter` where the
   subject extends one, a real `Map`, an `InMemoryStore` subclass with the one method overridden to
   fail. Everything else then behaves, so the thing under test is the only difference.
2. **Narrow the seam, when the contract is ours.** If a fake cannot satisfy a seam, the usual reason
   is that the seam names somebody else's class instead of the surface we use. Declare the surface.
   `TerminalToolkit` named `typeof Terminal`; it now names the sixteen members the dock drives, and
   the doubles are ordinary values of it.
3. **Name the type.** For an inline anonymous-object RETURN annotation, name it — do not delete it.
   With no build step and raw TypeScript exported, the declaration site is the only API-surface
   document this repo has.
4. **Declare an accumulator, when the key set is genuinely dynamic.** A migration output over a
   legacy row, a doc built from a per-kind field spec, an env bag with computed keys: write
   `const out: Record<string, unknown> = {}` and fill it. The empty literal is an explicit exemption
   in `no-known-value-widening`, because that is the accumulator idiom its own author sanctioned.

Two more, for the shapes those four do not reach:

- **A deliberately non-conforming value** — an explicit `undefined` under
  `exactOptionalPropertyTypes`, a role the union does not name, a payload the parser is supposed to
  refuse — takes a **widened binding plus ONE assertion**. That keeps the narrowing a legal
  downcast, and it says out loud that the refusal under test is a runtime one.
- **An external contract a unit test cannot construct** (`pg.Pool`, a cloud-sql `Connector`) takes
  **`satisfies Partial<X> as X`**. One assertion, and every member the double defines is checked
  against the real signature. That is what caught a `getOptions` double declared
  `() => Promise<{}>` against a real `(opts: ConnectionOptions) => Promise<DriverOptions>`.

### When two rules pull against each other

They do, three times so far, and the resolutions are recorded in `oxlint.config.ts` rather than
rediscovered. The sharpest: an object with **required fields plus one conditional optional field**
can satisfy neither rule's obvious remedy — a conditional `{}` spread is what
`no-conditional-empty-object-spread` bans, and an annotated accumulator is what
`no-known-value-widening` bans. What works is **one unconditional spread over a base, chosen by a
ternary**, and it keeps the optional field ABSENT rather than present-and-undefined, which is what
`exactOptionalPropertyTypes` wanted anyway.

### Ask the compiler, not the diff

Transform, then run `pnpm -r --no-bail typecheck`, and let the errors choose the shape. It corrected
a judge panel three times and the migrating sessions several more, and none of the corrections were
visible at the declaration site — a dropped annotation silently losing a tuple, a `satisfies` that
pins an accumulator's key set so the next write stops compiling, `as const` narrowing a table's
entries far enough that optional fields stop being readable.

---

## The six we decided against

All at `off`, each with its reasoning on the rule in `oxlint.config.ts` and, where a panel sat, a
full record in `tools/oxlint/panels/`.

### `require-safety-comment-for-type-assertion` — owner-decided, no panel

2,007 violations, the highest-volume rule in the set by a wide margin, and **the one where
AI-driven compliance actively defeats the rule's purpose**. Its entire value rests on each safety
comment being TRUE; an agent asked to satisfy it will generate hundreds of plausible comments that
assert nothing, converting a real check into documentation-shaped slop. In an AI-authored codebase
that is the expected outcome, not the risk. The one rejection on this arc that did not go through a
panel, because the owner decided it directly.

### `no-unsafe-dictionary-type` — rejected 5-0, high confidence

**Functionality loss.** `isPlainObject(v: unknown): v is Record<string, unknown>` cannot be written
under the rule — a type predicate needs to name the shape it narrows to, and the rule bans the only
name for it. The panel that settled this is also the one that proved the procedure. Judges named a
narrower rule they would support — a ban on `Record<string, any>` specifically — and it does not
inherit this panel's authority: it needs its own proposal and its own evidence.

A narrowed variant ("ban `any`/`object`/`{}`, permit `unknown`") was **built and reverted**: all 613
findings carry the `unknown` tag, so the narrowed rule fires on nothing.

### `no-runtime-typeof` — rejected 5-0

**The remedy is circular.** Every parser and every schema in this repo is built out of `typeof`, so
flagging the validators forbids the boundary from existing. Roughly forty of the 748 sites are not
data questions at all but runtime CAPABILITY probes — `typeof globalThis.fetch !== "function"`,
`typeof window !== 'undefined'`.

⚠ `allowInTypeGuards` is **not** the escape hatch, measured: it removes 64 of 748 (8.5%), because it
exempts only a `typeof` lexically inside a function whose declared return type is a type predicate,
and most narrowing here is in plain validators, `asserts` functions and inline guards.

### `no-shape-in-symbol-names` — rejected 5-0

**A genuine exceptional set.** The rule is a case-insensitive SUBSTRING ban with no options. 73 of
225 source sites are in the geometry and rendering packages, where "shape" IS the domain word; 39
are closed classification unions; and two name `z.ZodRawShape`, which is not ours to rename —
aliasing does not help, because the rule visits the imported identifier too.

*Recorded against ourselves:* the packet's rule statement ended with a sentence the operator wrote
rather than upstream ("the rule is deliberately absolute…") and three of five judges quoted it back
as the thing they were refuting. The verdict does not rest on it — the geometry population, the zod
identifier and the residue count are measured facts that stand alone — and the lesson is in the
procedure: write a rule statement from the vendored rule's own `docs.description` and `messages`,
and stop there.

### `no-unknown-parameters` — rejected 4-1

**The arc's only split verdict, and the dissent is recorded in full**, because a 4-1 and a 5-0 are
different evidence and must not read the same. The majority: the type predicate becomes
inexpressible (the dictionary-type finding arriving from the other side), and the rule's `cause`
exception cannot reach `.catch((e: unknown) => …)` because `useUnknownInCatchVariables` types every
caught value `unknown` by construction.

**What the dissent is right about:** a residue exists — `injectedStatePath(sessionId: unknown)` is a
value this program owns and named, sitting beside `isOperatorPrompt(prompt: string)` in the same
file. That is defensive drift, not a boundary. The majority position is not that the residue is
imaginary, but that the rule as SHIPPED has no option able to express any of the four positions the
dissent would need.

### `no-unknown-returns` — rejected 5-0

**Functionality loss at an architectural seam.** Naming a return type in `HttpStore.#get` would make
`packages/storage-protocol` import every domain schema — inverting the dependency the package exists
to keep. Refused on the ARCHITECTURE, not the cost: sixteen source sites is a morning's work.

Judges named a follow-on rule from a real defect found in passing —
`type RouteReply = Response | Promise<Response> | unknown`, where the `unknown` absorbs the union
and makes the first two arms decorative. "No `unknown` member in a union" is a different rule and
needs its own proposal.

---

## The gate rung

`pnpm lint` is the **first step of `pnpm gate`**, added 2026-08-24 by this arc's last increment.

It was held to `gate-machinery-audit-arc`'s inverted burden of proof — a rung must name what it
caught, when, and what would ship without it — and the arc explicitly reserved the right to say no.
The answer to the third question is not hypothetical:

- Within 24 hours of `no-conditional-empty-object-spread` reaching `error`, **eight** fresh
  violations landed on `main`, and `pnpm lint` was exit 1 on `main` with nobody aware.
- Across ONE later session's three merges from `main`, **twelve more** arrived — of three different
  already-adopted rules, all hours old.

Twenty fresh violations of rules the repo had already driven to zero, in two days, because nothing
ran the linter after the increment that adopted each rule. A rule at `error` in a config nothing
runs is not a standard; it is a comment.

**Measured cost: 2.7 s** over the whole repo (three runs: 2755 / 2671 / 2682 ms, warm). It was
measured rather than assumed, because oxlint being written in Rust proves nothing here — these rules
run on the JS-plugin path, which is Node and not the Rust fast path. It is the cheapest step in the
gate by an order of magnitude, and it deliberately does not narrow to the affected scope: a ratchet
has to look at everything.

**`ci.yml` runs it too, unconditionally (inc-17, 2026-08-24).** The local gate rung above enforces
the zero only on the honour of each session running one before landing — and `origin/main` went
exit 1 on `pnpm lint` twice within hours of the rung's own PR, because nothing on the merge path
ever ran it. CI now runs the same `pnpm lint` command as its own step, unnarrowed like every other
gate rung it mirrors, so a fresh violation can no longer merge on a green `verify` alone.

---

## Changing this standard

- **Adopting a rule** needs no panel — migrate it to zero and set it to `error`.
- **Rejecting or narrowing one** needs a panel finding one of the two grounds above.
- **Correcting this document** when the config moves is ordinary work; the config is the source of
  truth for severity and reason, and this file is the readable projection of it.
