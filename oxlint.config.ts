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

    // ---------------------------------------------------------------------------------------
    // NOT YET ADJUDICATED — off, not "warn", deliberately. A wall of warnings nobody must clear
    // trains sessions to ignore the linter, which is the precise habit this adoption exists to
    // avoid. Each rule leaves "off" via its own increment on the arc, carrying either a zero
    // count or a panel-backed reason. Counts below are from this increment's inventory.
    // ---------------------------------------------------------------------------------------
    // 646 (564 / 82, 168 files) — COLLIDES WITH A DELIBERATE COMPILER SETTING. `...(x !== undefined
    // ? { x } : {})` is the idiom `exactOptionalPropertyTypes: true` (tsconfig.base.json) forces on
    // us for conditionally-present optional properties. This is the clearest "our codebase fights
    // the rule" case in the set and goes to the arc's REFACTOR panel, not the rule panel.
    "anti-slop/no-conditional-empty-object-spread": "off",
    // 513 (312 source / 201 test, 253 files) — RE-SORTED OUT OF inc-03 AND CONTESTED, on that lane's
    // own instruction to remove a rule that turns out not to be cheap rather than let the lane sprawl.
    // The arc predicted "pure profit": the `satisfies` idiom, `const x: Record<string, H> = { start }`
    // throwing away the knowledge that `start` exists. That family is real but is only 110 of the 513
    // (open dictionary on a binding). The DOMINANT family, 290 of 513 (57%), is something else
    // entirely — an inline anonymous object RETURN annotation over a returned object literal, e.g.
    // `function f(): { adrs: AdrMeta[]; parseErrors: string[] }`. Satisfying it means either deleting
    // the annotation (making a package's public return types inferred) or naming a type per site, at
    // ~290 sites across 134 source files. That is a house-style position on whether this codebase may
    // write inline object return types at all — defensible, but a genuine disagreement, and the arc's
    // rule is that a disagreement goes to the RULE PANEL and never to one session's preference. Its
    // own lane; see the arc.
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
    // 612 (345 / 267, 157 files) — the store seam's document values are genuinely unknown until
    // parsed, which is the seam's whole point. inc-04, where the judge panels get built.
    "anti-slop/no-unsafe-dictionary-type": "off",
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
