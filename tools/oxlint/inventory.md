# anti-slop violation inventory

Measured 2026-08-21 on `worktree-anti-slop-inc-01`, branched from `origin/main` at `990c2324`.
Produced by `anti-slop-adoption-arc` increment `inc-01`.

Tool: oxlint 1.79.0 + `@oxlint/plugins` 1.79.0, rules vendored from `dmmulroy/anti-slop` at
`6d538555cb151d4121ed51a27db81890eacf8ae9` (MIT). 1,280 files scanned in ~2.1s.

**Reproduce it:** copy `oxlint.config.ts` to a scratch file, set every `anti-slop/*` rule to
`"error"`, and run `pnpm exec oxlint -c <that file> --format=json`. Do not use `-A all` with `-D
anti-slop/<rule>` to do this — the CLI `-D` flags do not enable JS-plugin rules, and that
combination silently reports a near-empty run rather than failing.

## The numbers

| Rule | Total | Source | Test | Files | Lane |
|---|---:|---:|---:|---:|---|
| `require-safety-comment-for-type-assertion` | 2007 | 836 | 1171 | 438 | **rejected** (owner) |
| `no-runtime-typeof` | 727 | 585 | 142 | 221 | inc-05 |
| `no-conditional-empty-object-spread` | 646 | 564 | 82 | 168 | inc-04/05 — compiler collision |
| `no-unsafe-dictionary-type` | 612 | 345 | 267 | 157 | inc-04 |
| `no-known-value-widening` | 497 | 300 | 197 | 248 | inc-03 |
| `no-unknown-parameters` | 318 | 228 | 90 | 179 | inc-05 |
| `no-shape-in-symbol-names` | 263 | 163 | 100 | 47 | inc-05 |
| `no-chained-type-assertions` | 162 | 33 | 129 | 71 | inc-03 |
| `no-module-mocking` | 111 | 0 | 111 | 32 | inc-06 |
| `no-unknown-returns` | 40 | 15 | 25 | 31 | inc-05 |
| `no-object-parameters` | **0** | 0 | 0 | 0 | **adopted** |
| `no-reflect-apply` | **0** | 0 | 0 | 0 | **adopted** |
| `no-reflect-get` | **0** | 0 | 0 | 0 | **adopted** |
| `no-unknown-type-aliases` | **0** | 0 | 0 | 0 | **adopted** |
| `no-widen-then-assert` | **0** | 0 | 0 | 0 | **adopted** |

**Total: 5,383 violations across 10 rules. Five rules are already clean.**

## What the real numbers changed

The arc was chartered against grep estimates. Three of them were wrong in ways that matter, and the
arc's own prose says to replace them rather than carry them forward.

**Five rules are at zero, not two.** `no-object-parameters`, `no-unknown-type-aliases`, and
`no-widen-then-assert` were all estimated non-zero (the `object`-parameter grep guessed 47) and are
in fact clean. All five are now at `error`. That is five permanently closed doors on day one
instead of two, at no migration cost.

**`no-runtime-typeof` is 727, not ~59 — 12x the estimate.** The grep counted `typeof x ===`
comparisons; the rule visits every `typeof` expression regardless of shape. This does not make the
rule more right, it makes it blunter, and it moves the realistic outcome further toward "enable with
`allowInTypeGuards`" or "reject".

**`require-safety-comment-for-type-assertion` is 2007, not ~768.** At 2.6x the estimate, the
owner's decision to reject it holds a fortiori: it would mean an agent authoring two thousand
"safe because…" comments whose only value is being true.

**`no-conditional-empty-object-spread` was never estimated at all, and it is the most interesting
result in the table.** 646 violations, 564 of them in production source. The pattern it rejects —
`...(x !== undefined ? { x } : {})` — is the idiom that `exactOptionalPropertyTypes: true`
(`tsconfig.base.json:11`) forces for conditionally-present optional properties. This is a rule
colliding with a compiler setting we deliberately turned on, not with sloppy code. It is the
clearest refactor-panel case in the set: the question is not "is the rule right" but "is there a
shape that satisfies both", and "no viable refactor" is a legitimate answer here.

## Files per violation — read this column before sizing a lane

Violation count alone does not predict lane cost; the file spread does. `no-shape-in-symbol-names`
is 263 violations across only 47 files (5.6 per file — likely a handful of naming conventions
repeated), while `no-known-value-widening` is 497 across 248 files (2.0 per file — genuinely
diffuse). The second is a much larger lane than the first despite a comparable count.

## Two findings that are not about anti-slop at all

**1. A file in this repo was unparseable JavaScript, and the gate is blind to it.** *(Fixed here.)*
`packages/forest-world-r3f/harness/hardware-floor.mjs` had THREE single-quoted strings containing
unescaped apostrophes (lines ~255, ~260, ~262), each terminating its string early. `node --check`
refused the file outright. Fixed in this increment — three lines switched to double quotes, nothing
else touched — because the new `pnpm lint` would otherwise have arrived permanently red for a reason
unrelated to anything it checks.

It has exactly ONE commit (`949713c3`, 2026-08-19, *"research(chapter2): answer ADR-0380 D2 on the
Adreno"*), so **the file as committed has never been executable**, while research write-ups cite it
as the instrument that answered that question — `docs/research/chapter2-live-render-2026-08-19/README.md:99`
says it "asserts this rather than assuming it". Whether those published numbers came from a working
earlier draft is a live question, spun off as its own task; it is deliberately NOT resolved by
quietly fixing the syntax.

`pnpm gate` never caught any of this because `.mjs` harness files are neither typechecked nor
tested. A repo-wide `node --check` sweep of all 26 non-dependency JS/MJS files found no OTHER
unparseable file, so this is an isolated instance rather than a pattern.

This is the first **catch instance** on the arc, and it is exactly the kind end-state FOUR needs:
something real that shipped, would have kept shipping, and that no existing gate rung could see.

**2. oxlint's own default rules fire 155 times, independently of anti-slop.**
Fourteen built-in rules, dominated by `no-unsafe-optional-chaining` (53, of which 52 are in tests)
and `no-unused-vars` (47). Mostly small, but `no-unreachable` (1) and `require-yield` (1) are worth
a look on their own merits.

These arrived free with the linter and are **not** part of the anti-slop adoption. They are left at
their default severity (warning, non-blocking) and are deliberately out of scope for this arc —
adopting a rule set someone else designed is a different decision from adopting oxlint's defaults,
and conflating them would let 155 unadjudicated findings ride in on the arc's authority. If they are
worth acting on, they deserve their own increment.
