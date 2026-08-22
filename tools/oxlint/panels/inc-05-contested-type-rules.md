# Rule panel — the four contested type rules, batched

**Convened** 2026-08-22 by `anti-slop-adoption-arc` increment `inc-05`, under ADR-0407 D3.
**Panel** RULE panel, five judges, blind, **four targets against two controls in ONE packet**.
**Spec** `tools/oxlint/panels/inc-05-contested-type-rules.rule-panel.json`
**Procedure** `tools/oxlint/panel-procedure.md` (§5a — batch)

**All four targets REJECTED. Terminal state `off` for each, with the reason recorded on the rule in
`oxlint.config.ts`.** Three unanimous, one 4–1 with the dissent recorded below in its own words.

---

## The verdict

| Seat | Rule A *(control-reject)* | Rule B *(control-uphold)* | **C — unknown returns** | **D — "shape" in names** | **E — unknown params** | **F — runtime `typeof`** |
|---|---|---|---|---|---|---|
| `rule-merits` | reject (high) | adopt-narrowed (med) | **reject (high)** | **reject (high)** | **reject (high)** | **reject (high)** |
| `codebase-architecture` | reject (high) | adopt-narrowed (med) | **reject (high)** | **reject (high)** | **adopt-narrowed (med)** | **reject (high)** |
| `future-maintainer` | reject (high) | adopt-narrowed (med) | **reject (high)** | **reject (high)** | **reject (high)** | **reject (high)** |
| `skeptic` | reject (high) | adopt-narrowed (med) | **reject (high)** | **reject (high)** | **reject (high)** | **reject (high)** |
| `false-positive` | reject (high) | adopt-narrowed (med) | **reject (high)** | **reject (high)** | **reject (high)** | **reject (high)** |

Rule A = `synthetic/no-separated-type-imports` · Rule B = `anti-slop/no-chained-type-assertions` ·
C = `anti-slop/no-unknown-returns` · D = `anti-slop/no-shape-in-symbol-names` ·
E = `anti-slop/no-unknown-parameters` · F = `anti-slop/no-runtime-typeof`.

**Every rejection lands on the arc's closed list of two — functionality loss, or a genuine
exceptional set. None lands on volume, and no judge was shown a count:** the builder refuses a packet
that states one, and the counts below were measured by the operator afterwards, for this record.

---

## Did the instrument discriminate? Both controls passed, and one of them REPEATED.

Read before the target verdicts, per the procedure. Four rejections out of four targets is exactly
the shape a rubber-stamp panel would produce, so the controls are what separate this from agreement.

**Rule B — expected UPHOLD, held independently by the compiler. PASS, and a repeat.** Not rejected by
any seat. Every judge returned `adopt-narrowed`, and — with no contact between them, and no contact
with `inc-04` — they converged on the *same* line `inc-04`'s five judges drew on this same control:
permit the assertion where the target **claims nothing** (an index-signature or all-`unknown` bag,
where the following code re-establishes every field it reads), and error where it asserts a
**concrete contract this repo owns**. Two seats independently reached `tree-verdicts.ts`'s
hand-written orchestrator mirror as the paradigm error case — the site the compiler had already
convicted in `inc-03`. A control that returns the same answer twice, on two different packets, is the
strongest calibration evidence this instrument has produced.

**Rule A — expected REJECT on functionality grounds. PASS, with a finding.** Refused 5–0 at high
confidence. Four of five seats reached `verbatimModuleSyntax` unaided and named the mechanism
exactly: `import type { X } from "m"` is erased, `import { type X } from "m"` emits a real module
load, and `apiRouter.ts`'s own comment documents that the vite config-load path breaks on precisely
that difference. **The fifth seat (`future-maintainer`) reached `reject (high)` on a different and
still-valid mechanism** — that the split statement *carries* information the merged form destroys,
namely which edges survive to runtime — without naming the compiler setting. Recorded as a pass with
a finding rather than a clean sweep: the verdict and the direction are right, one seat's route to it
was not the predicted one. Several judges again went beyond the control and observed that the rule's
own duplication rationale does not apply to most of its evidence.

A panel that upholds the rule the compiler already convicted, and refuses the plausibly-worded rule
that would break the build, is adjudicating rather than agreeing.

---

## Why each rule was rejected

Counts are the operator's, measured at HEAD 2026-08-22 with the documented `-c <copy>` command, and
were **not** shown to any judge.

### F — `no-runtime-typeof` · 748 (606 source / 142 test, 229 files) · rejected 5–0

**FUNCTIONALITY LOSS, AND THE REMEDY IS CIRCULAR.** The rule says to decode at the I/O boundary with a
schema, a parser or a constructor — and every parser and every schema is *built out of* `typeof`.
Four seats made the point independently: `stringsOf`, `isPlainObject`, `docRecord`/`docString` and
`finiteCount` **are** the boundary the rule demands, so flagging them forbids the boundary from
existing in this repo. As `rule-merits` put it, *"whatever replaces it will contain `typeof`
inside."*

**A large class is not a data question at all.** `typeof globalThis.fetch !== "function"` is a runtime
**capability probe**; `typeof window !== 'undefined'` is the SSR/Node guard. No schema can answer
"does this runtime have fetch", and the alternative is catching a `ReferenceError`. The operator
measured ~40 source sites of this shape.

**And two classes where the compiler's own settings demand the check.**
`typeof inc.outcome?.date === "string"` exists *because* `exactOptionalPropertyTypes` is on — three
seats noticed the comment saying so, and `skeptic` drew the sharpest conclusion: banning it "would
force the author to write the assignment unguarded and then reach for a cast to silence EOPT — the
rule would manufacture the very unsound code its siblings are trying to eliminate."
`typeof chunk === 'string'` discriminates a genuinely polymorphic Node overload (`ServerResponse['end']`),
where the representation *is* the contract because Node defines it that way.

**`allowInTypeGuards` is not the escape hatch the increment predicted — measured.** Turning the
shipped option on removes **64 of 748** (748 → 684; source 606 → 543), an 8.5% dent, because it
exempts only a `typeof` lexically inside a function whose return type is a `TSTypePredicate`, while
most of this repo's narrowing lives in plain validators, `asserts` functions and inline guards. The
increment expected "on with the option" to be a realistic outcome; it is not. `false-positive`
arrived at the same place unaided: the narrowing that would make the rule honest *"leaves it with
essentially no sites left to fire on."*

The operator's own family split of the 606 source sites, for the record: 165 `=== "string"`, 118
compared against a non-literal, 86 `=== "object"`, 80 `!== "object"`, 66 `!== "string"`, 40
`=== / !== "undefined"` (the environment guards), 25 numeric, 18 bare, 6 `"function"`, 2 boolean.

### D — `no-shape-in-symbol-names` · 363 (207 source / 156 test, 56 files) · rejected 5–0

**A GENUINE EXCEPTIONAL SET, PLUS ONE HARD FUNCTIONALITY LOSS.** The rule is a case-insensitive
**substring** ban on `"shape"` in every `Identifier`, `PrivateIdentifier` and `JSXIdentifier`. It has
no options and no exceptions, so it cannot tell the word's structural sense from its domain sense —
`skeptic` called it *"a substring grep dressed as a design principle."*

The operator classified **all 207 source sites**, not the panel's twelve:

| | |
|---:|---|
| **73 (35%)** | geometry / rendering packages, where geometric vocabulary IS the working vocabulary |
| **21** | closed classification unions (`StartShape`, `DecisionReadShape`) |
| **2** | `z.ZodRawShape` — **a type zod exports, which we cannot rename** |
| **111** | everything else — and it reduces to just **15 distinct identifiers** |

**The zod sites are the one ground here that is not a matter of taste.**
`packages/library/src/library-doc.ts:139,143` needs `z.ZodObject<z.ZodRawShape>`. Aliasing the import
does not help — the rule visits the imported identifier too — so the only compliant move is to stop
naming zod's type, which loses the type. `commonShape` is the same problem one step out: `shape` is
zod's own published API term for an object's field set (`z.object(shape)`, `.shape`), so the rule
bans the library's vocabulary.

**The geometry family was named by every seat.** `CanopyShape = 'spire' | 'dome'` names a tree
silhouette; `part.shape.faces` is a solid's geometry; `shapeKey(poly)` computes a
translation-invariant polygon identity; one site picks an SVG mark between `'square'` and `'circle'`.
`rule-merits`: *"in these five sites there is no better name, and every substitution would be a
euphemism."* The classification unions defeat the rule on its own reasoning — the members already
carry the meaning the rule says is missing, and its remedy yields `…Kind`/`…Outcome`, which
`future-maintainer` called *"a synonym swap that teaches the future reader nothing new."*

Every seat found the same thin residue: one to three genuinely weak names in twelve
(`WORKSPACE_SHAPE`, `commonShape`, `isParsedLineShape`) — and the population measurement agrees, at
15 distinct identifiers across 111 firings. **A narrowing was considered and refused**, for the
reason `inc-04` refused the dictionary-type narrowing: exempting geometry and classification unions
removes most of the sites and leaves a rule too small to justify. `skeptic` added the enforcement
objection — renaming `CanopyShape` to `CanopySilhouette` satisfies the rule while changing zero
meaning, which is a rule that produces churn instead of quality.

### E — `no-unknown-parameters` · 323 (236 source / 87 test, 183 files) · **rejected 4–1**

**FUNCTIONALITY LOSS — the type predicate becomes inexpressible.** This is `inc-04`'s
`no-unsafe-dictionary-type` finding arriving from the other side.
`isPlainObject(value: unknown): value is Record<string, unknown>` cannot narrow anything if its
parameter is already narrowed; `false-positive` put it plainly — *"a guard that accepted a named
domain type would have nothing left to prove. Flagging these means flagging the remedy."* The
operator measured **37 source sites** that are predicates or `asserts` functions.

**The rule's own exception is drawn too narrow to survive its own evidence,** which four seats found
independently and `false-positive` called decisive. It carves out an error `cause` — but
`useUnknownInCatchVariables` makes TypeScript type every caught value `unknown` *by construction*, so
`.catch((error: unknown) => …)` fires, and so does `teardownAndThrow(label, e: unknown)`, which
forwards `e` straight into `{ cause: e }` and is therefore literally the carved-out case. **45 source
sites** are caught errors. A third class is variance rather than habit: `OrientationRunner`'s
`deps: unknown` is the widest type that accepts every concrete deps object, and the comment at the
site says so.

#### The dissent — `codebase-architecture`, `adopt-narrowed` (medium), in its own words

> *"The rule's diagnosis is right about a specific failure and wrong about the position it attacks.
> It is right that `unknown` parameters proliferating inward is a real disease: if `stringsOf`,
> `docString`, `finiteCount` and friends each re-derive what a value is, the boundary was never
> established and each downstream function is guessing. But the sites show that almost every flagged
> parameter is AT the boundary rather than downstream of one … What survives is worth enforcing.
> Site 1's `injectedStatePath(sessionId: unknown): string | null` takes a session id — a value this
> program owns, with a name, in a `.d.mts` that already declares `isOperatorPrompt(prompt: string)`
> beside it; `unknown` there is defensive drift, not a boundary. … The rule as written would delete
> the codebase's foreign-data competence; narrowed to internal contracts it removes real slop."*

Its proposed narrowing, stated precisely enough to implement, was four permitted positions: (1) type
predicates and `asserts` functions; (2) catch and `cause` positions, extending the rule's stated
exception to its obvious siblings; (3) declared I/O and IPC boundaries within a named file set
(`storage-protocol`, the studio/desktop route dispatchers, the foreign-data reader packages); and (4)
contravariant seam parameters on exported function *types*.

**Why the majority prevails, and what the dissent buys anyway.** The dissent is not that the residue
is imaginary — the majority did not claim it was, and two other seats named
`injectedStatePath(sessionId: unknown)` and `res.end = ((chunk?: unknown) => …)` as fair criticisms
in the same breath as rejecting. The disagreement is about whether the rule *as shipped* can express
any of those four positions, and it cannot: it has no options at all, so adopting it at `error` means
firing on the guards, the catch handlers and the wire readers simultaneously. Under the arc's
terminal-state rule there is no third state to park it in. **The dissent's residue is worth a later
proposal on its own evidence** — a rule about `unknown` on parameters *this program produced and
named* — and like `inc-04`'s `Record<string, any>` ban it must carry its own justification rather
than inherit this panel's.

### C — `no-unknown-returns` · 41 (16 source / 25 test, 31 files) · rejected 5–0

The **smallest** contested rule in the set, which is what makes its rejection worth reading: 16
source sites is a morning's work, so nothing here was decided on cost.

**FUNCTIONALITY LOSS AT THE STORE SEAM** — the same structural commitment that carried
`no-unsafe-dictionary-type`. `packages/storage-protocol` persists and returns documents *without
knowing their shapes*, and readers `.safeParse()` on the far side (ADR-0068 §3), so `HttpStore`'s
`#get`/`#post` returning `Promise<unknown>` is that contract stated honestly. Naming a domain return
type would require the transport to import every domain schema, inverting the dependency direction —
`storage-protocol` is the root that depends only on `proof-protocol`. Four seats reached this
independently, and `rule-merits` identified the rule's own premise as the error: *"'the producing
function is the one place the value's provenance is actually known' is precisely false for a generic
transport"* — `#get` knows the route and nothing else, and every caller knows more than it does.
`codebase-architecture` closed off the obvious salvage: a generic `<T>` is worse, since it
manufactures a compile-time promise from a runtime read with no validation behind it.

**Two more classes the rule cannot name.** `readMember(node: unknown, segment: string): unknown`
(`packages/library/src/query.ts:124`) walks an arbitrary member path for `--where cites=story:cli`; a
path walker over arbitrary names has no nameable return. And `appendEvent(…): Promise<unknown>` /
`select1: (handle) => Promise<unknown>` are injected seams whose result is *deliberately discarded* —
`select1` is a `SELECT 1` whose only meaning is that it resolved. Naming a type there invents a fact
and makes every test double carry it.

**The one genuine defect the panel found is not this rule's.** `type RouteReply = Response |
Promise<Response> | unknown` in the studio's test HTTP double: the `unknown` member absorbs the union
and the first two arms are decorative, so a reader is misled about what a route may return. Three
seats named it unprompted. But as `skeptic` said, *"the rule that would catch it is 'no `unknown`
member in a union' — a different rule entirely."* It needs its own proposal and its own evidence,
exactly as `inc-04` ruled for the `Record<string, any>` ban.

---

## What this run got wrong, recorded rather than buried

**Rule D's statement carried an absolutist sentence the upstream rule does not state.** The statement
put to the panel ended *"The rule is deliberately absolute: a term this weak has no position in which
it is the best available name."* That is the operator's gloss. The vendored rule's own doc comment
says only *"Disallow the case-insensitive substring 'shape' in JavaScript, TypeScript, private, and
JSX symbol names"* — the absolutism is true of the *implementation* (there are no options and no
exceptions) but it was not upstream's argument, and **three of five judges quoted that sentence back
as the thing they were refuting.**

This is the leak the procedure warns is the one no refusal can catch: *"a statement hedged toward the
answer you want will produce the answer you want, and nothing in the tool will tell you."* It is
recorded here because the alternative — noticing it and not saying so — is the exact failure this
instrument exists to prevent.

**The verdict does not rest on it, and the check is a measurement rather than an argument.** Rather
than re-run a 5-judge panel to settle one sentence (~550k tokens), the operator measured the whole
population the sample was drawn from: 73/207 source sites in packages whose working vocabulary is
geometry, 2 naming a type zod exports and we cannot rename, and a residue of 111 firings that reduces
to 15 distinct identifiers. Those facts stand with the sentence removed. **A later lane wanting to
re-open D should re-state the rule in upstream's own words and re-run it** — and should expect the
zod sites to survive any rewording, because they are not a matter of how the rule is argued.

**What was not repeated from `inc-04`:** the byte-offset defect. All 48 sampled target sites were
mechanically verified against the real source at the stated line before the packet went out — the
flagged excerpt matched the file at that line in 48 of 48. No judge reported anything odd about the
evidence.

---

## Cost — and the batching arithmetic, now measured rather than projected

| | This panel |
|---|---:|
| Judges | 5 |
| Target rules adjudicated | **4** |
| Specimens in the packet | 6 (4 targets + 2 controls) |
| Sites in the packet | 72 |
| Judge tokens | **551,160** |
| Wall clock (parallel) | **~1m 52s** |
| Tool calls per judge | 1 (read the brief) |

Per judge ~110.2k tokens, against `inc-04`'s ~96k for a 3-specimen packet — so **doubling the
specimens cost 15% more per seat**, not 100%.

**The recommendation `inc-04` made is confirmed with a number.** Seven separate five-judge panels
were projected at ~3.4M judge tokens; the four rules that actually needed adjudicating were settled
in **one panel for 551k**, which is **1.15x the cost of `inc-04`'s single-target panel** and roughly
**29% of a four-panel-per-rule alternative** (~1.92M). Batching is the bigger economy, and the
blinding was not weakened by it: the controls both passed, and the uphold control repeated `inc-04`'s
answer exactly.

**What this does NOT include, stated rather than quietly omitted:** the driving session's own spend —
measuring the inventory, building the spec, verifying the sample, and writing this record — which is
larger than the panel itself and is not separable from the increment's other work.

---

## Terminal states out of this panel

| Rule | State | Ground |
|---|---|---|
| `anti-slop/no-runtime-typeof` | **`off`** | functionality loss — the remedy is circular; capability probes have no domain type |
| `anti-slop/no-shape-in-symbol-names` | **`off`** | exceptional set (geometry vocabulary) + functionality loss (`z.ZodRawShape` is not ours to rename) |
| `anti-slop/no-unknown-parameters` | **`off`** | functionality loss — the type predicate becomes inexpressible; 4–1, dissent above |
| `anti-slop/no-unknown-returns` | **`off`** | functionality loss at the shape-blind store seam |

## What a later lane should take from this

- **The `unknown` family and the dictionary-type family are one argument, not three.** `inc-04`
  rejected `no-unsafe-dictionary-type` because `Record<string, unknown>` is the only expressible
  return of a plain-object type guard. This panel rejected `no-unknown-parameters` because that
  guard's *parameter* cannot be narrower, and `no-unknown-returns` because the store seam that
  consumes it must not know document shapes. Three rules, one commitment — ADR-0068 §3. If that
  commitment is ever revisited, all three rejections are back in play together.
- **Two follow-on proposals were named by the judges and neither may inherit this panel's
  authority.** (1) "No `unknown` member in a union", from the `RouteReply` defect. (2) A rule about
  `unknown` on parameters *this program produced and named*, from `codebase-architecture`'s dissent —
  its `injectedStatePath(sessionId: unknown)` case. Both need their own evidence, the same ruling
  `inc-04` made for the `Record<string, any>` ban.
- **`no-conditional-empty-object-spread` is the arc's one remaining ADOPT-AND-REFACTOR lane and was
  deliberately NOT folded into this diff — it is parked as `anti-slop-adoption-arc-inc-11`** — `inc-05`'s own instruction is to batch the adjudication
  and migrate one rule at a time. Its measured inventory is on the rule in `oxlint.config.ts`: 663
  findings, and **~439 of the 581 source sites (76%) need a named type authored that does not exist
  today** (299 sit in inline argument position typed only contextually, 140 are bare `return {`
  literals with an inferred type). Only ~69 are mechanical. That is why it is its own lane, and it is
  a scoping fact, never a reason to reject.
- **A control that repeats is worth more than a control that passes once.** `no-chained-type-assertions`
  has now returned `adopt-narrowed` ×5 on two different packets, with the same convergent narrowing
  both times. Keep using it; `inc-09` should start from that narrowing rather than re-deriving it.
