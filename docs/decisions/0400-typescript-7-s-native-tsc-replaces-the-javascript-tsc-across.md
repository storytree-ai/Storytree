---
status: accepted
decided: 2026-08-21
arc: typescript-7-native-compiler-arc
load_bearing: true
---
# ADR-0400: TypeScript 7's native tsc replaces the JavaScript tsc across the monorepo

## Status

accepted (2026-08-21) — the owner directed driving `typescript-7-native-compiler-arc`, whose end
state is stated in as many words: "`tsgo` is what typechecks this monorepo — locally, in `pnpm gate`,
and in CI". Adopting the native compiler is therefore the arc's charter rather than a discretionary
fork of mine, and ADR-0110 applies: design-time alignment is ratification.

Two things needed deciding that the arc could not have known when it was written, and both are
decided here: WHICH package to adopt (§Decision 1), and what to do about the compiler API that
TypeScript 7 no longer exports (§Decision 3). The second is the one a reader should not skim.

## Context

### The arc's premise was overtaken between chartering and execution, in our favour

The arc was written expecting to install a second, separate compiler — "the `tsgo` binary in
`@typescript/native-preview`" — and to run it alongside `tsc` before choosing between them. That was
the correct shape BEFORE GA. It is not the shape now:

  - `@typescript/native-preview` was the PREVIEW channel. Its last publish is `7.0.0-dev.20260707.2`,
    dated 2026-07-07 — the day before GA. It is not where the shipped compiler lives.
  - The native compiler shipped as **the `typescript` package itself**. `typescript@7.0.2` is npm
    `latest`; its `bin` is `tsc` (there is no `tsgo` bin); and the Go implementation rides as
    per-platform optional dependencies (`@typescript/typescript-win32-arm64` and 19 siblings).

So there is no second toolchain to install and no "which compiler is authoritative" fork to settle
for TYPECHECKING — after the bump there is one `tsc`, and it is native. Every package's `typecheck`
script is already `tsc --noEmit`, and CI already runs those same scripts
(`.github/workflows/ci.yml:235` → `pnpm ${{ affected }} typecheck`), so the gate and CI cannot
diverge here: they invoke one thing, and one thing changed underneath it.

**Why this repo crosses cleanly**, re-confirmed rather than assumed from the arc's prose. The two
blockers usually cited against the native compiler are incomplete `--build` for project references
and incomplete declaration emit. Neither binds: we declare no `references` anywhere, and every
`typecheck` script is `tsc --noEmit`, so the emit path is never exercised by the leg being changed.
`esModuleInterop` is already `true`.

### The measurement (arc increment 1), and the flaw in its first instrument

Both compilers were run over **all 27 typecheck targets** — the 25 packages carrying a `typecheck`
script, counting `apps/studio` and `apps/desktop` twice each for their second tsconfig — from each
package's own directory, arms INTERLEAVED per package so box-load drift hits both equally, medians
of 3, on a box confirmed quiet via `storytree own --all`.

That first pass reported 73.5s → 12.9s (5.7x) and **exactly one** diagnostic divergence. The speed
held up. The divergence count did not, and the reason is worth recording because it is a general
trap: the harness invoked the 7.0.2 BINARY by path while each package's `node_modules/typescript`
still resolved to 5.7.3, so `import ts from "typescript"` was being checked against **5.7's type
declarations**. The instrument measured a state that would never exist — new compiler, old types —
and was silent on the single largest consequence of the upgrade. It surfaced only when the real
`pnpm -r typecheck` leg ran red after the bump. **An A/B that installs neither arm the way the arm
will actually be installed is not an A/B.** Compare `the-gate-costs-what-the-change-risks-arc`, where
the instrument rather than the subject was twice the defect.

Corrected, the divergence set has two members.

**Divergence 1 — TS2882, and it is the new compiler being RIGHT.**
`packages/app-surface/src/SemanticGrowthWorldView.tsx:33` does `import './semantic-growth.css'`.
TypeScript 5.7 ignored it silently; TypeScript 7 reports
`Cannot find module or type declarations for side-effect import`. The import genuinely had no type
declaration — 5.7 simply did not check side-effect imports. Fixed with the idiom this repo already
uses for this exact problem: `apps/studio` carries an `env.d.ts` holding
`/// <reference types="vite/client" />` and names it in its tsconfig `include`.
`packages/app-surface` already had `vite` as a devDependency and now carries the same two lines.
**It is green under BOTH compilers**, so it is not a hostage to this ADR.

**Divergence 2 — `typescript@7` does not export the compiler API.** Its package entry point is
`./lib/version.cjs`, a version stub. The AST surface moved to subpaths upstream explicitly labels
**unstable**: `typescript/unstable/ast`, `.../ast/is`, `.../ast/visitor`, `.../sync`. Three files
here consume the old API as a source PARSER for static analysis of our own code — not to compile
anything:

  - `packages/cli/src/verification-decay.ts` — locates registered proof bindings
  - `packages/orchestrator/src/proof/contract-coverage.ts` — reads test call titles
  - `packages/library/src/store/connection.test.ts` — asserts an import stays lazy

All three use `createSourceFile` / `forEachChild` / `SyntaxKind` / the `is*` guards. Under
`typescript@7` they produce roughly 90 errors across three packages, all one root cause.

### What this is worth to the gate, stated as the arc demanded rather than as hoped

The arc asked for the typecheck/test split FIRST, precisely so the payoff would be a number rather
than a hope, and instructed: if typecheck is a small fraction, SAY SO plainly.

**It is a small fraction, and that is the honest headline.** On a quiet box, `pnpm -r --no-bail
typecheck`:

| arm | runs | median |
| --- | --- | --- |
| `tsc@5.7.3` | 51.5s, 47.0s, 40.6s | **47.0s** |
| `tsc@7.0.2` | 7.3s, 6.8s, 6.9s | **6.9s** |

**6.8x on the real leg** — better than the 5.7x the per-package sum predicted, because the native
compiler's near-zero startup also collapses the leg's serial tail. Note the SPREAD as well as the
median: 11s for the old arm against 0.5s for the new one. The native leg is not merely faster, it is
predictable, on a box whose central instrument lesson is that it is not.

The test leg was measured five times by `the-gate-costs-what-the-change-risks-arc` at
300s / 512s / 548s / 749s / 820s (median 548s) and is deliberately NOT re-measured here — that arc's
closure records that re-running it costs about six full test runs.

The gate's own per-step instrumentation corroborates the shape in situ: this change's full-scope
`pnpm gate` reported **typecheck 14.8s against test 6m48s**. That typecheck figure is higher than the
6.9s standalone median (it runs cold, after four other steps) which is precisely why the controlled
interleaved measurement above is the one quoted — but the RATIO it puts the leg at, ~3.5% of the two
expensive legs, is the same story from an instrument nobody tuned for this ADR.

So of the gate's two expensive legs, typecheck was **47 of 595 seconds — 7.9%** — and this change
takes about **40 seconds off a full gate, roughly 7%**. Real, and nowhere near the headline a "10x
compiler" invites. **The case for this change is therefore NOT primarily the gate.** It is the editor
and the inner loop, where a typecheck is not one event per gate but one per keystroke-pause:
`apps/studio` alone drops 11.65s → 1.25s, which is the difference between a check you wait for and
one you do not notice. CI gets the same multiple on its own typecheck job.

Stating that plainly is the point. An arc sold on a gate win it cannot deliver would be the fourth
instance of the failure `the-gate-costs-what-the-change-risks-arc` recorded three times — hardening
a flattering reading into a claim.

## Decision

**1. `typescript` moves from `~5.7.3` to `~7.0.2` in all 25 packages that declare it.** No
`typecheck` script changes, no CI change, and no new gate step. The arc's
`@typescript/native-preview` route is NOT taken, because after GA it points at a stale preview
channel rather than at the shipped compiler.

**2. One compiler, named once (arc end state 3).** After this change `tsc` IS the native compiler
everywhere. The end state's alternative — the JavaScript compiler "retained deliberately as a named
cross-check" — is declined for CHECKING: a second checker would be a second set of diagnostics to
reconcile on every run, and the measured divergence over 27 targets is two items, one of which the
new compiler was right about and one of which is not about checking at all.

**3. TypeScript 5.7 is retained as a PARSING LIBRARY under the `typescript5` alias, in the three
packages that walk our AST — and this is the part of end state 3 that needs stating precisely.**
Those three files now `import ts from "typescript5"` (`npm:typescript@5.7.3`), each with a comment
at the import saying why. The rule this draws, and the one a later session should apply:

> **Nothing typechecks with anything but native `tsc@7`. `typescript5` is a source parser, never a
> compiler, and it must never appear in a `typecheck` script.**

The alternative — porting three non-trivial static-analysis files onto `typescript/unstable/ast` —
is deliberately NOT taken now, for one reason: upstream calls that API unstable, so the port would
buy churn rather than stability, and it is a rewrite needing its own red→green proof rather than a
line in an adoption change. It becomes the right move once that API stabilises, and until then the
5.7 parser is pinned, small, and honest about what it is. Parsing our own source with a 5.7 parser
is sound because the constraint is only that it understands the syntax we WRITE, which it does.

**4. Rollback is one commit (arc end state 5), and this states it rather than assuming it.** Revert
the version ranges to `~5.7.3`, drop the three `typescript5` aliases, restore the three imports to
`"typescript"`, and run `pnpm install`. No script, workflow, or compiler option has to move. The
`env.d.ts` may stay — it is correct under 5.7 too — so a rollback does not re-open the divergence it
closed.

## Consequences

**Good.** The typecheck leg gets 6.8x faster and far more predictable, and the editor/inner loop gets
the same multiple, which is where the value actually lands. One fewer silently-unchecked import class
in the codebase.

**The cost that is genuinely new: the compiler is a NATIVE BINARY per platform**, not portable
JavaScript. Any platform npm has no `@typescript/typescript-*` build for cannot typecheck. We run
Windows-on-ARM64 locally and Linux-x64 in CI, both of which ship; but this is a "works on my machine"
class that `tsc`-as-JavaScript did not have.

**The cost that is a wart, named as one: two TypeScript packages are now on disk.** That is
strictly more than the arc anticipated and it should not be quietly enjoyed. It is bounded — three
import sites, one alias name, a comment at each — and Decision 3 states the rule that keeps it from
spreading. If a fourth consumer appears, that is the signal to do the `unstable/ast` port rather than
add a fourth alias.

**A risk deliberately accepted.** 27 targets agreeing on everything except one CSS import is strong
evidence, but it is evidence from THIS codebase's current shape, not a guarantee about code not yet
written. A future divergence is a bug report upstream and a local fix — not a reason to keep a second
checker standing by.

**What did NOT change, so nobody re-derives it.** Bundling, emit, and the `apps/desktop` esbuild path
are untouched — the arc scoped them out. `declaration: true` in `tsconfig.base.json` stays; `--noEmit`
means the typecheck path never exercises it.

## References

- `typescript-7-native-compiler-arc` — the chartering arc; increment 1 is the measurement recorded
  above, and this ADR is its design fork.
- `the-gate-costs-what-the-change-risks-arc` — source of the test-leg figures reused here, and of the
  instrument rule (per-process medians reproduce; suite wall-clock on this box does not).
- ADR-0304 / ADR-0195 — the one-classifier rule keeping `pnpm gate` and CI predicting each other.
  Safe by construction here: both callers run the same package scripts.
- ADR-0110 — an owner-directed decision is born accepted.
- `packages/cli/src/verification-decay.ts`, `packages/orchestrator/src/proof/contract-coverage.ts`,
  `packages/library/src/store/connection.test.ts` — the three `typescript5` parser consumers.
