import { defineConfig } from "oxlint";

/**
 * storytree lint configuration — the anti-slop rule set, adopted one rule at a time.
 *
 * See `anti-slop-adoption-arc` (live store: `storytree arc show anti-slop-adoption-arc --pg`).
 *
 * THE RATCHET. Every rule below ends in exactly one of two terminal states:
 *   - "error", once its violation count is zero, or
 *   - "off",   with a written reason on the rule itself.
 * A rule parked at "warn" indefinitely is the failure mode this adoption must not produce — it is
 * the "kept but weakened" rung that `gate-machinery-audit-arc` names, and a warning nobody must
 * clear is a warning nobody reads. "warn" is legitimate ONLY while an increment is actively
 * driving that rule's count to zero.
 *
 * THE RULES ARE OURS. `tools/oxlint/anti-slop/` is VENDORED from dmmulroy/anti-slop at commit
 * 6d538555cb151d4121ed51a27db81890eacf8ae9 (MIT), on its author's own instruction to copy and
 * edit rather than depend. Narrowing a rule is a first-class outcome alongside adopting or
 * rejecting it — record the reasoning on the arc when you do.
 *
 * THE RULES CANNOT SEE TYPES. Oxlint's JS plugin API is alpha and these rules match the parse
 * tree with no type information, so a firing is evidence to be adjudicated, not a verdict. False
 * positives are expected and are what the arc's judge panels exist to settle.
 *
 * TESTS GET A LAXER BAR than production source (owner-decided 2026-08-21, ADR-0407 D4) — roughly
 * 60% of the total violation volume sits in test files, and a test faking a dependency is doing
 * something categorically different from production code lying about a type. The `overrides` block
 * at the bottom of this file is where that bar lives; `no-chained-type-assertions` is its first
 * entry. A laxer bar is still a DECIDED bar, so each entry carries its reason like any "off" does.
 * Do not write test globs literally in a block comment — the star-slash inside one terminates the
 * comment early.
 */
export default defineConfig({
  ignorePatterns: [
    // Agent tooling — installed assets and generated configuration, not application source.
    ".claude/**",
    ".codex/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    // The vendored rule sources themselves. They are third-party TypeScript held to their own
    // author's standards, and several rules deliberately violate each other (the `typeof` rule's
    // own implementation contains three `typeof` expressions).
    "tools/oxlint/anti-slop/**",
    // Read-only vendored submodules — reference material we do not own and must not edit.
    "legacy/**",
    "web/**",
    // Build output.
    "**/dist/**",
  ],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: {
    // ---------------------------------------------------------------------------------------
    // ADOPTED — at error, measured at ZERO violations by the inc-01 inventory. These cost
    // nothing today and are pure ratchet: they cannot fail now, and they permanently close five
    // doors. Three of them (object-parameters, unknown-type-aliases, widen-then-assert) were
    // expected to be non-zero from grep estimates and turned out clean — the tool disagreed with
    // the grep and the tool wins.
    // ---------------------------------------------------------------------------------------
    // ADOPTED BY MIGRATION, not by luck — anti-slop-adoption-arc inc-03 drove production source from
    // 33 sites in 18 files to ZERO. Three of those chains were hiding a claim that was FALSE: a
    // hand-written module mirror in the desktop tree fold that was missing seven fields of the real
    // `NodeSpec`, a `Record` value type the doc provably violated in the library's body renderer, and
    // a `window.desktopRepo` shape in the studio that CONTRADICTED the ambient global declaration of
    // the same object. See the increment for the full harvest. TESTS ARE ON THE LAXER BAR — see the
    // `overrides` block at the bottom of this file.
    "anti-slop/no-chained-type-assertions": "error",
    // ADOPTED BY MIGRATION — anti-slop-adoption-arc inc-06 drove 110 sites across 31 files to ZERO.
    // Every one was a test file; production source never had any.
    //
    // THE RULE'S ARGUMENT WAS ALREADY THIS REPO'S ARGUMENT EVERYWHERE ELSE, and the migration bore
    // that out: `storage-protocol` exists precisely so a caller can be handed `InMemoryStore`
    // instead of `PgLibraryStore`, and the studio's 110 module mocks were the same problem solved
    // the other way — by rewriting the module system at runtime instead of admitting a seam. Most
    // of them turned out to need no new seam at all: `AppDataContext` and the platform `fetch` were
    // already there, unused by the tests that were mocking around them.
    //
    // FOUR SEAMS WERE ADDED, each a narrow value + context + REAL DEFAULT, so no production caller
    // passes anything: `DiagramRenderer` (lib/diagram.ts), `TerminalToolkit`
    // (lib/terminalToolkit.ts), and `StudioSurfaces` + `Act2Choreography` (components/TreeView.tsx).
    // Two components gained ordinary slot props (`App.surfaces`, `BottomDock.panes`,
    // `TerminalRepoGate.renderDock`) beside the injection those files already used.
    //
    // WHAT IT CAUGHT (end-state FOUR evidence, harvested from the migration itself):
    //   1. ChatPanel.spawn.test.tsx exists to prove `isChatEvent` accepts a `spawn` frame. Under
    //      the mock the guard NEVER RAN — the file said so in its own header and fell back to
    //      grepping api.ts for the string. Deleting the clause left every render test GREEN; it now
    //      turns all five RED.
    //   2. TreeViewShell's "the tree was read" assertion was VACUOUS after its first test: one
    //      un-reset `vi.fn()` for the whole file.
    //   3. `api.arcs()` retries three times with a backoff. Every "the read failed" case in
    //      arcRollups.test.ts described a one-shot client that does not exist.
    //   4. Mocking `@storytree/app-surface` for its one un-renderable component took four PURE
    //      functions down with it, so the map's presentation model was never computed under test.
    //   5. Partial `useAppData` / `me` mocks let components read fields the tests never supplied.
    //   6. The real TreeView fetches `/art-sheets/…`, which no suite knew about until a fail-closed
    //      transport double refused it.
    "anti-slop/no-module-mocking": "error",
    // ADOPTED BY MIGRATION — anti-slop-adoption-arc inc-11 drove 666 findings (584 source / 82 test,
    // across 175 files) to EIGHT, and those eight are a declared fence, not a residue: see the
    // `overrides` block at the bottom of this file. Every production-source site outside that fence
    // is gone, and so is every test site — the ADR-0407 D4 laxer bar was MEASURED and turned out not
    // to be needed here, which is inc-03's precedent applied rather than assumed.
    //
    // THE RULE WAS NEVER CONTESTED. inc-04's three-judge REFACTOR panel returned `refactor-found`
    // 3-0 and named two shapes; under the owner's narrowed bar adopting needs no panel, so this
    // increment is a migration and not an adjudication. The panel also DISPROVED this config's own
    // former claim that the rule collides with `exactOptionalPropertyTypes` — EOPT forbids ASSIGNING
    // `undefined`, and a guarded assignment has already narrowed the value to a defined type, so an
    // annotated local plus one guarded assignment per optional satisfies both. 173 files of evidence
    // now stand behind that, with `-r typecheck` green.
    //
    // THE COMPLIANT SHAPES, both proved across nine parallel lanes:
    //   - an ANNOTATED local, then one guarded assignment per optional property; or
    //   - base-plus-ternary on the whole object, where the literal cannot be hoisted (a
    //     discriminated union, a nested literal, a lazily-evaluated argument).
    // The annotation is LOAD-BEARING and its absence is a SILENT regression, not a compile error:
    // `const x = {…}` infers a type without the optional property, and where it happens to compile
    // the literal is no longer fresh at the call, so excess-property checking disappears with
    // nothing going red. Every lane was held to it and a diff-level audit confirmed zero
    // un-annotated hoists, zero `as T` handovers, and zero ternaries merely relocated out of an
    // object literal.
    //
    // THE COST WAS OVERWHELMINGLY NOT NEW TYPE SURFACE, and the estimate that said otherwise is
    // corrected here rather than carried forward. inc-05 classified 439 of 581 source sites (76%) as
    // needing "a named type AUTHORED that does not exist today". Measured by doing it: 658 sites
    // migrated introduced NINE new exported types in total. The classification was of the enclosing
    // literal's TYPING CONTEXT, which is real — but an inline argument position typed only
    // contextually usually forwards into a callee whose parameter type is ALREADY NAMED, and where
    // it is not, an indexed-access annotation (`Parameters<typeof f>[0]`, `Foo["bar"]`) is exact and
    // adds no surface. `packages/cli/src/commands.ts` alone was 150 of the sites and needed zero.
    //
    // WHAT IT CAUGHT (end-state FOUR evidence, harvested from the migration itself):
    //   1. `packages/agent/src/sdk-author.ts` was writing a field into a type that did not declare
    //      it, and the compiler could not say so. The per-model accumulator was annotated
    //      `Record<string, TokenUsage & { costUsd?: number }>` while `contextWindow` — which the real
    //      contract `SdkRunInfo["byModel"]` DOES declare — arrived only through a conditional spread.
    //      SPREADS BYPASS EXCESS-PROPERTY CHECKING, so the mismatch was invisible for as long as the
    //      spread was there. Hoisting forced the annotation to the true contract.
    //   2. `packages/drive/src/uat-drive.run.ts` built a record that went straight into
    //      `UatDriveRecord.parse(...)`, i.e. into a `unknown`-typed parameter, so no excess-property
    //      check ever ran on it. Annotating the draft restored one; it compiles clean, which is the
    //      good outcome, but the check had been absent rather than passing.
    //   3. `apps/studio/src/lib/knowledgeDepth.test.ts` carried a trailing `as GuidanceAsset` that
    //      the annotated-local shape made unnecessary — a cast REMOVED by adopting this rule, which
    //      is the opposite of the trade inc-04's panel warned the migration might have to make.
    //
    // A NARROWING WAS NOT NEEDED AND NONE WAS TAKEN. The one thing this rule cannot see is worth
    // recording, because the rule's zero is not the whole truth in one file:
    // `packages/storage-protocol/src/store-wire.ts` has an `optional(key, value)` helper returning
    // `value === undefined ? {} : { [key]: value }`, spread at two sites. The rule matches a
    // ConditionalExpression argument, and a CallExpression is not one — so this is exactly the
    // laundering shape two panel judges named unprompted, sitting in the tree, invisible. It
    // PREDATES this migration and was deliberately left rather than folded into a shape migration's
    // diff; naming it here is what keeps the zero honest.
    //
    // ⚠ IF YOU HIT A `readonly` OPTIONAL, DO NOT REACH FOR `Mutable<T>`. inc-04's panel prescribed a
    // `Mutable<T>` mapped-type draft and that prescription is WRONG in this repo — MEASURED, by three
    // lanes independently. Annotating a binding with a same-file GENERIC alias over a mapped type
    // fires `anti-slop/no-known-value-widening`, because that rule's classifier resolves such an
    // alias through `resolvesToDictionary`, which any mapped type satisfies. Use `Omit<Named, "prop">`
    // on the base plus a plain spread, base-plus-ternary, or a NON-GENERIC alias hop
    // (`type XDraft = Mutable<Real>`), which routes through `classifyAliasBroadTarget` and correctly
    // finds `keyof T` is not a broad key. The whole migration's net effect on that sibling rule was
    // measured before and after and is ZERO: 133 findings either side.
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-widen-then-assert": "error",

    // ---------------------------------------------------------------------------------------
    // REJECTED — off, with the reason recorded here rather than only on the arc.
    // ---------------------------------------------------------------------------------------

    // Owner-decided 2026-08-21. 2007 violations (836 source / 1171 test, 438 files) — measured,
    // and 2.6x the grep estimate the decision was taken against, which strengthens rather than
    // weakens it. This is the highest-volume rule in the set by a wide margin and the
    // one where AI-driven compliance actively DEFEATS the rule's purpose: its entire value rests
    // on each safety comment being TRUE, and an agent asked to satisfy it will generate hundreds
    // of plausible comments that assert nothing — converting a real check into documentation-
    // shaped slop. This codebase is AI-authored end to end, so that is the expected outcome
    // rather than a risk. It is the one rejection on this arc that did not go through a judge
    // panel; anyone wanting to revisit it takes it to a panel like every other rule.
    "anti-slop/require-safety-comment-for-type-assertion": "off",

    // REJECTED BY A JUDGE PANEL, 2026-08-22 (anti-slop-adoption-arc inc-04). Five blind judges,
    // five REJECT verdicts, all at high confidence, no dissent on the verdict. Full record with
    // every judge's reasoning: `tools/oxlint/panels/no-unsafe-dictionary-type.md`.
    //
    // THE GROUND IS FUNCTIONALITY LOSS, which is one of the two the arc admits — not volume, and
    // the judges were never told the count. `Record<string, unknown>` is the only expressible
    // return type of a plain-object type guard, and this codebase has one:
    // `isPlainObject(value: unknown): value is Record<string, unknown>`
    // (`packages/context-traversal-transcript/src/correlate-transcripts.ts:67`). Under the rule
    // that predicate cannot be written at all — any narrower value type would be an unproven claim
    // made by the function whose whole job is to avoid unproven claims. Three judges reached that
    // site independently and called it decisive on its own.
    //
    // The same holds structurally at the seam this arc predicted would carry the argument:
    // `storage-protocol` persists documents WITHOUT knowing their shapes, and readers `.safeParse()`
    // on the far side (ADR-0068 §3). A store that declared a value type would not be that seam, and
    // `store-parity.ts` — the suite every backend is held to — could not be written.
    //
    // AND THE RULE'S OWN REMEDY IS CIRCULAR HERE. It says to "parse external payloads into that type
    // before putting them in the dictionary", but every flagged site IS the parse: an HTTP body
    // reader shared across routes with different schemas, a foreign CLI's JSON event stream, a
    // third-party `settings.json`. You cannot parse a value you have not yet given a type to, and
    // `unknown` is the only honest one. The rule also lumps `unknown` with `any`, which inverts the
    // safety ordering it is reaching for: `any` erases checking, `unknown` FORCES it, and under this
    // repo's `noUncheckedIndexedAccess` every read out of such a dictionary is already narrowed
    // before use. Banning it pushes authors toward `any` or toward a fabricated value type asserted
    // over unvalidated input — which is the harm `no-chained-type-assertions` exists to catch.
    //
    // ⚠ DO NOT "FIX" THIS BY NARROWING IT TO `any`/`object`/`{}` AND TURNING IT ON. That was built
    // and reverted in this increment. All 613 findings carry the `unknown` tag — zero `any`, zero
    // `object`, zero `{}` — so the narrowed rule fires on NOTHING here, and three judges named that
    // move unprompted and refused it: it would be a different rule adopted on no evidence, passing
    // under this panel's authority. A ban on `Record<string, any>` may well be right, and several
    // judges said they would support one; it needs its own proposal and its own evidence.
    "anti-slop/no-unsafe-dictionary-type": "off",

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // THE FOUR BELOW WERE REJECTED BY ONE BATCHED JUDGE PANEL, 2026-08-22 (inc-05). Five blind
    // judges, six specimens — four targets against the two controls inc-04 proved — in a SINGLE
    // packet, because the builder takes N specimens and the blinding gets STRONGER with more
    // rules, not weaker. Full record, every seat's reasoning and the dissent in its own words:
    // `tools/oxlint/panels/inc-05-contested-type-rules.md`.
    //
    // THE INSTRUMENT DISCRIMINATED, which is what makes four rejections a measurement rather
    // than an agreement. The uphold-control (`no-chained-type-assertions`, ground truth from the
    // COMPILER — inc-03 reduced its production chains to single assertions and three then failed
    // to compile) was never rejected by any seat: `adopt-narrowed` 5-0, REPEATING inc-04's result
    // on the same control exactly, down to the convergent narrowing. The reject-control (a
    // synthetic rule that `verbatimModuleSyntax` makes uncompliable) was refused 5-0. A panel that
    // upholds the rule the compiler already convicted, and refuses the one that would break the
    // build, is adjudicating.
    //
    // ⚠ ALL FOUR REJECTIONS LAND ON THE ARC'S CLOSED LIST OF TWO — functionality loss, or a
    // genuine exceptional set. NOT on volume: the builder refuses a packet that states a count,
    // and no judge was shown one.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    // REJECTED 5-0 at high confidence. Re-measured at HEAD 2026-08-22: 748 (606 source / 142 test,
    // 229 files) — the largest contested rule in the set, and the estimate that was 12x low.
    //
    // FUNCTIONALITY LOSS, AND IT IS CIRCULAR. The rule's remedy is "decode at the I/O boundary with
    // a schema, a parser or a constructor, then branch on the domain value" — but every parser and
    // every schema is BUILT OUT OF `typeof`. Four judges made the point independently: `stringsOf`,
    // `isPlainObject`, `docRecord`/`docString`, `finiteCount` ARE the boundary the rule demands, and
    // flagging the parser for containing a representation check forbids the boundary from existing
    // in this repo at all. zod's own primitives are `typeof x === "string"` one layer down.
    //
    // AND A LARGE CLASS IS NOT A DATA QUESTION AT ALL. `typeof globalThis.fetch !== "function"` and
    // `typeof window !== 'undefined'` are RUNTIME CAPABILITY PROBES; no schema can answer "does this
    // runtime have fetch", and the alternative is catching a ReferenceError. ~40 source sites are
    // this shape. Two more classes the rule cannot see: `typeof inc.outcome?.date === "string"`
    // exists BECAUSE `exactOptionalPropertyTypes` is on (banning it would force an unguarded
    // assignment plus a cast to silence EOPT — the rule would manufacture the unsound code its
    // siblings exist to remove), and `typeof chunk === 'string'` discriminates a genuinely
    // polymorphic Node overload (`ServerResponse['end']`), where the representation IS the contract.
    //
    // ⚠ `allowInTypeGuards` IS NOT THE ANSWER — measured, not assumed. Turning the option on removes
    // 64 of 748 (748 → 684; source 606 → 543), because it only exempts a `typeof` lexically inside a
    // function whose return type is a `TSTypePredicate`, and most of this repo's narrowing is in
    // plain validators, `asserts` functions and inline guards. The increment expected this option to
    // be the realistic outcome; it is an 8.5% dent. The false-positive seat reached the same place
    // unaided: the narrowing that would make the rule honest "leaves it with essentially no sites
    // left to fire on".
    "anti-slop/no-runtime-typeof": "off",

    // REJECTED 5-0 at high confidence. Re-measured on the shipped tree: 391 (225 source / 166 test,
    // 69 files).
    //
    // GENUINE EXCEPTIONAL SET, AND ONE HARD FUNCTIONALITY LOSS. The rule is a case-insensitive
    // SUBSTRING ban on "shape" in every `Identifier` / `PrivateIdentifier` / `JSXIdentifier` — it has
    // no options and no exceptions, so it cannot distinguish the word's structural sense from its
    // domain sense. Measured across all 207 SOURCE sites, not the panel's twelve:
    //   - 73 (32%) are in the geometry and rendering packages, where the brief's own words are that
    //     geometric modelling vocabulary IS the working vocabulary: `CanopyShape = 'spire' | 'dome'`
    //     names a tree silhouette, `part.shape.faces` is a solid's geometry, `shapeKey(poly)` is a
    //     translation-invariant polygon identity, and one site picks an SVG mark ('square'|'circle').
    //     Every judge named these; renaming them destroys meaning to satisfy a word.
    //   - 39 are closed classification unions whose members already carry the meaning the rule says
    //     is missing (`StartShape = "healthy" | "slow-but-proceeded" | "allocate-then-die" | …`).
    //     The rule's remedy yields `…Kind`/`…Outcome` — a synonym swap that teaches a reader nothing.
    //   - 2 ARE NOT OURS TO RENAME: `z.ZodRawShape` at `packages/library/src/library-doc.ts:139,143`,
    //     needed to type `z.ZodObject<z.ZodRawShape>`. It is a type ZOD exports. Aliasing the import
    //     does not help — the rule visits the imported identifier too — so the only compliant move is
    //     to stop naming zod's type, which loses the type. That is functionality loss in the strict
    //     sense, and it is the one ground here that is not a matter of taste at all. `commonShape` is
    //     the same vocabulary problem one step out: `shape` is zod's own published API term for an
    //     object's field set (`z.object(shape)`, `.shape`).
    //   - The remaining 111 firings reduce to FIFTEEN distinct identifiers, of which the panel judged
    //     one to three genuinely weak (`WORKSPACE_SHAPE`, `commonShape`, `isParsedLineShape`).
    // One-to-three real hits in twelve sampled — and in 207 measured — is the ratio that trains
    // people to ignore a linter. A narrowing was considered and refused by the panel for the reason
    // inc-04 refused the dictionary-type narrowing: exempting geometry and classification unions
    // removes most of the sites and leaves a rule too small to justify. Ban vagueness in review.
    //
    // ⚠ ONE HONEST LIMITATION OF THIS RUN, recorded rather than buried: the rule statement put to
    // the panel said the ban is "deliberately absolute: a term this weak has no position in which it
    // is the best available name". That sentence is the operator's gloss, not upstream's, and three
    // judges quoted it back as the thing they were refuting. It is ACCURATE — the implementation
    // has no options — but it is stronger than the vendored doc comment. The verdict does not rest
    // on it: the geometry population, the zod identifier and the residue count are all measured
    // facts that stand without it. See the record's "What this run got wrong" section.
    "anti-slop/no-shape-in-symbol-names": "off",

    // REJECTED 4-1. Re-measured on the shipped tree: 322 (236 source / 86 test, 183 files). THE ONE SPLIT
    // VERDICT ON THIS PANEL — the `codebase-architecture` seat returned `adopt-narrowed` (medium)
    // and its dissent is recorded in full in the panel record, because a 4-1 and a 5-0 are
    // different evidence and must not read the same.
    //
    // FUNCTIONALITY LOSS — the type predicate becomes inexpressible, which is inc-04's
    // `no-unsafe-dictionary-type` finding arriving from the other side. `isPlainObject(value:
    // unknown): value is Record<string, unknown>` cannot narrow anything if its parameter is
    // already narrowed; a guard whose input is the domain type is a tautology. 37 source sites are
    // predicates or `asserts` functions.
    //
    // AND THE RULE'S OWN EXCEPTION IS DRAWN TOO NARROW TO SURVIVE ITS OWN EVIDENCE, which four
    // judges found independently. It carves out an error `cause` — but `useUnknownInCatchVariables`
    // makes TypeScript type every caught value `unknown` BY CONSTRUCTION, so `.catch((error:
    // unknown) => …)` fires, and so does `teardownAndThrow(label, e: unknown)`, which forwards `e`
    // straight into `{ cause: e }` and is therefore literally the carved-out case. 45 source sites
    // are caught errors. A third class is variance, not habit: `OrientationRunner`'s `deps: unknown`
    // is the widest type that accepts every concrete deps object, and narrowing it breaks every
    // implementer — the comment at the site says so.
    //
    // WHAT THE DISSENT IS RIGHT ABOUT, and it is worth a later look: a residue exists. The clearest
    // is `injectedStatePath(sessionId: unknown)` in `packages/cli/definition-injection.d.mts:70` —
    // a value this program owns and named, sitting beside `isOperatorPrompt(prompt: string)` in the
    // same file. That is defensive drift, not a boundary. The majority position is not that the
    // residue is imaginary but that the rule as SHIPPED has no option able to express any of the
    // four permitted positions the dissent would need, so adopting it at error means firing on the
    // guards, the catch handlers and the wire readers at the same time.
    "anti-slop/no-unknown-parameters": "off",

    // REJECTED 5-0 at high confidence. Re-measured on the shipped tree: 38 (16 source / 22 test,
    // 29 files) —
    // the SMALLEST contested rule in the set, which is why its rejection is worth reading closely:
    // it was refused on the architecture, not on the cost of complying, and 16 sites is a morning's
    // work if the rule were right.
    //
    // FUNCTIONALITY LOSS AT THE STORE SEAM — the same structural commitment that carried
    // `no-unsafe-dictionary-type`. `packages/storage-protocol` persists and returns documents
    // WITHOUT knowing their shapes and readers `.safeParse()` on the far side (ADR-0068 §3), so
    // `HttpStore`'s `#get`/`#post` returning `Promise<unknown>` is that contract stated honestly.
    // Naming a domain return type there would require the transport to import every domain schema,
    // inverting the dependency direction — `storage-protocol` is the root that depends only on
    // `proof-protocol`. The rule's central claim, that "the producing function is the one place the
    // value's provenance is actually known", is precisely FALSE for a generic transport: `#get`
    // knows the route and nothing else, and every caller knows more than it does.
    //
    // TWO MORE CLASSES THE RULE CANNOT NAME. `readMember(node: unknown, segment: string): unknown`
    // (`packages/library/src/query.ts:124`) walks an arbitrary member path for `--where
    // cites=story:cli`; a path walker over arbitrary names has no nameable return. And
    // `appendEvent(…): Promise<unknown>` / `select1: (handle) => Promise<unknown>` are injected
    // seams whose result is DELIBERATELY discarded — `select1` is a `SELECT 1` whose only meaning
    // is that it resolved. Naming a type there invents a fact and makes every test double carry it.
    //
    // THE ONE GENUINE DEFECT THE PANEL FOUND, and it is not this rule's: `type RouteReply = Response
    // | Promise<Response> | unknown` in the studio's test HTTP double. The `unknown` member absorbs
    // the union and makes the first two arms decorative, so a reader is misled about what a route
    // may return. Three judges named it. The rule that catches it is "no `unknown` member in a
    // union" — a different rule, needing its own proposal and its own evidence, exactly as inc-04
    // ruled for the `Record<string, any>` ban.
    "anti-slop/no-unknown-returns": "off",

    // ---------------------------------------------------------------------------------------
    // NOT YET ADJUDICATED — off, not "warn", deliberately. A wall of warnings nobody must clear
    // trains sessions to ignore the linter, which is the precise habit this adoption exists to
    // avoid. Each rule leaves "off" via its own increment on the arc, carrying either a zero
    // count or a panel-backed reason. Counts below are from this increment's inventory.
    // ---------------------------------------------------------------------------------------
    // ADJUDICATED AND ADOPTED (inc-08) — but still `off`, because it reaches `error` only at ZERO
    // and 129 firings remain. This is a MIGRATION IN PROGRESS, not an open question: the rule is
    // agreed correct, and what is left is work rather than doubt. Record:
    // `tools/oxlint/panels/no-known-value-widening.md`.
    //
    // 518 measured; 389 driven out. `anonymous object :: binding` is at zero, and so is every
    // return-position site OUTSIDE the website-mirrored packages — see the fence below.
    // No rule panel was needed — a panel justifies a REJECTION, and
    // the owner's narrowed bar admits only functionality loss or a genuine exceptional set, neither
    // of which describes "we prefer inline object return types". A REFACTOR panel settled the one
    // live fork (delete the annotation vs name the type) 3-0: NAME it, because with no build step
    // and raw TypeScript exported the declaration site is the only API-surface document there is,
    // and a `return { xs: [] }` branch infers `never[]` once the annotation is gone.
    //
    // WHAT REMAINS, and it is a shape rather than a backlog. 68 `open dictionary :: binding` split
    // almost evenly by the compiler's own verdict:
    //   - LOOKUP (32) — a table read with a computed key. `ReadonlyMap` is the answer and is proved:
    //     the rule classifies neither `ReadonlyMap` nor an interface reference as a widening target,
    //     so the immutability fence the refactor panel thought this shape lost is in fact kept. Two
    //     MIME tables already moved this way.
    //   - ACCUMULATOR (33) — a binding that GAINS or LOSES keys after construction (`doc["x"] = y`,
    //     `delete doc["rules"]`). This is the increment's ground-2 candidate and the one place no
    //     compliant shape was found: `satisfies` pins the key set so the later write stops
    //     compiling, naming the type re-states the same widening, and resolving the conditionals
    //     into one literal requires exactly the idiom `no-conditional-empty-object-spread` bans.
    //     A NARROWING here needs its own rule panel per the procedure — it is not this lane's to
    //     take unilaterally, and it must never be taken by quietly exploiting the classifier's
    //     interface/alias asymmetry.
    // Plus 34 in the small tail (assertions, `unknown` targets, one property).
    //
    // ⚠ A FENCE, NOT A BACKLOG ITEM: 25 of the remaining firings sit in the FIVE files under
    // `packages/forest-world/src` and `packages/forest-world-r3f/src` that the website mirrors
    // (ADR-0093). They were migrated, CI's `check:web-engine` correctly refused the drift, and the
    // change was REVERTED rather than pushed through — because closing that drift means
    // `pnpm sync:web-engine`, a PR on the separate `storytree-web` repo, and MERGING it, and that
    // merge republishes the live site through its own `deploy.yml`. Publishing is the owner's call,
    // not a lane's. Note this is also the one class a local gate cannot see: `check:web-engine`
    // SKIPs without the `web/` submodule, so the laptop reads GREEN, NARROWED and CI is the first
    // honest verdict. Whoever takes these does the cross-repo ceremony deliberately and asks first.
    "anti-slop/no-known-value-widening": "off",
  },
  overrides: [
    {
      // THE LAXER TEST BAR (ADR-0407 D4, owner-decided 2026-08-21). Not a weakening of the ratchet
      // and not a `warn`: a decided scope, recorded with its reason like every other "off".
      //
      // `no-chained-type-assertions` is at "error" in production source, where inc-03 drove it to
      // zero. The 126 remaining sites are all in tests, and they are a different kind of thing. The
      // compiler was asked, not guessed at: reducing each chain to a single assertion left ~71 of
      // them compiling — pure noise — but ~55 genuinely rejected, because they are PARTIAL FAKES of
      // real contracts. A `FixtureStore` standing in for `Store` (20 sites in one file), object
      // literals standing in for `ServerResponse`, `Pool`, `Connector`, `HexWorld`, and the desktop
      // preload's `window` bridges. Each one wants a real double, which is a test-architecture
      // change rather than a type change — the same class of work the arc already gave its own lane
      // for `no-module-mocking`, and parked as its own increment here rather than folded into inc-03.
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.test.mts", "**/e2e/**"],
      rules: {
        "anti-slop/no-chained-type-assertions": "off",
      },
    },
    {
      // THE WEBSITE-MIRROR FENCE (ADR-0093). These three files are vendored WHOLESALE into the
      // separate `storytree-web` repository by `pnpm sync:web-engine`, and CI's `check:web-engine`
      // refuses any drift between the parent copy and the synced one. Editing them is therefore not
      // a local change: closing the drift means a PR on that repo, and MERGING it republishes the
      // live site through its own `deploy.yml`. Publishing is the owner's call, not a lane's.
      //
      // So this is a DECIDED SCOPE carrying its reason, like the test bar above — not a `warn`, and
      // not the rule being weakened. The eight sites behind it are uniform one-liners already
      // written out in full on `anti-slop-adoption-arc-inc-11`; they are work that is READY and
      // GATED, not work that is unknown.
      //
      // ⚠ Note this is the one class a LOCAL gate cannot see: `check:web-engine` declares SKIP
      // without the `web/` submodule checked out, so a laptop reads GREEN, NARROWED and CI is the
      // first honest verdict. inc-08 migrated the same two packages, read its local gate as green,
      // and had CI refuse the drift — the gate was honest, and proceeding past its named narrowing
      // was the error.
      //
      // `no-known-value-widening` (inc-10) has 25 more sites behind this same fence, in these same
      // files. Whoever clears the republish should clear BOTH rules in one deliberate cross-repo
      // increment rather than each lane doing half a republish, and should delete this entry when
      // they do.
      files: [
        "packages/forest-world/src/scene.ts",
        "packages/forest-world/src/routing.ts",
        "packages/forest-world-r3f/src/world-to-3d.ts",
      ],
      rules: {
        "anti-slop/no-conditional-empty-object-spread": "off",
      },
    },
  ],
});
