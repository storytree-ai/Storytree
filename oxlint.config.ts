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

    // ---------------------------------------------------------------------------------------
    // NOT YET ADJUDICATED — off, not "warn", deliberately. A wall of warnings nobody must clear
    // trains sessions to ignore the linter, which is the precise habit this adoption exists to
    // avoid. Each rule leaves "off" via its own increment on the arc, carrying either a zero
    // count or a panel-backed reason. Counts below are from this increment's inventory.
    // ---------------------------------------------------------------------------------------
    // 646 (564 / 82, 168 files); re-measured 654 at HEAD 2026-08-22. Still `off`, but the reason
    // this comment used to give is WRONG and is corrected here rather than carried forward.
    //
    // It said the rule COLLIDES with `exactOptionalPropertyTypes` — that
    // `...(x !== undefined ? { x } : {})` is the idiom that setting forces on us. A three-judge
    // REFACTOR panel put it to the test on 2026-08-22 and returned `refactor-found` 3-0: a
    // compliant shape exists for every sampled site and typechecks under EOPT, because EOPT
    // forbids ASSIGNING `undefined`, and a guarded assignment has already narrowed the value to a
    // defined type before it runs. So there is no collision — an annotated local plus one guarded
    // assignment per optional property satisfies both.
    //
    // The lane is `inc-05`, and it is expected to ADOPT AND REFACTOR rather than adjudicate. Read
    // `tools/oxlint/panels/no-conditional-empty-object-spread.md` first: the panel named five costs,
    // two of which would manufacture a `no-chained-type-assertions` violation if the migration takes
    // the obvious shortcut, and one — the hoisted local MUST carry an explicit type annotation, or
    // excess-property checking silently disappears — that a mechanical fixer would get wrong.
    "anti-slop/no-conditional-empty-object-spread": "off",
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
    // 111 (0 / 111, 32 files) — entirely test files. inc-06, a test-architecture lane.
    "anti-slop/no-module-mocking": "off",
    // 727 (585 / 142, 221 files) — the rules cannot see types, so this flags EVERY `typeof`
    // expression: environment guards and validator internals fire identically to lazy narrowing.
    // Ships an `allowInTypeGuards` option (default false). inc-05.
    "anti-slop/no-runtime-typeof": "off",
    // 263 (163 / 100, 47 files) — highest violations-per-file ratio in the set, so likely a small
    // number of naming conventions rather than a broad problem. inc-05.
    "anti-slop/no-shape-in-symbol-names": "off",
    // 318 (228 / 90, 179 files) — structural tension: a function that PARSES an unvalidated value
    // has no honest signature other than `unknown`. inc-05, rule panel.
    "anti-slop/no-unknown-parameters": "off",
    // 40 (15 / 25, 31 files) — the smallest contested rule. inc-05.
    "anti-slop/no-unknown-returns": "off",
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
  ],
});
