---
status: accepted
decided: 2026-07-31
arc: flaky-test-coverage-arc
---
# ADR-0276: Wall-clock timing leaves the gate tier

## Status

accepted (2026-07-31) — decided/directed by the owner in conversation on 2026-07-31. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

Agent-authored tests quietly accumulated load-sensitive timing coverage, and under 5–6 concurrent
sessions it started redding gates on innocent diffs: 3 of 4 gate runs on docs-only diffs flaked
overnight 2026-07-31, each costing a 9–42 min re-run plus ~8 min proving innocence — with zero real
regressions caught, ever, by any timing assertion. The owner's framing: "AI test slop bloat".

The 2026-07-31 inventory (arc increment 1) found the slop **concentrated, not spread** — across all
24 gate-tier workspaces (`pnpm gate` runs an unfiltered `pnpm -r test`; every `packages/*` and
`apps/*` workspace declares a real `test` script):

1. **Exactly one measured wall-clock assertion**: `packages/forest-world/src/routing.test.ts`, test
   `'30 islands / 60 edges routes in under 2s'`, asserting a `performance.now()` delta `< 2000`.
   Confirmed flakes: 4737 ms loaded and **6185 ms isolated** (PR #1010, 07-29 — innocence locally
   unprovable; CI had to rule), 3795 ms overnight 07-31; 386 ms on a quiet box. A gate-tier
   wall-clock bound measures CPU starvation of the dev box, not the routine under test.
2. **Framework default per-test timeouts as implicit wall-clock bounds** — vitest's 5 s default
   killed starved-but-sound tests. Both instances were already patched to a 60 s ceiling
   (`apps/studio/vitest.config.ts` 07-02, `packages/app-surface/vitest.config.ts` 07-31), each with
   the same rationale: a hang still fails; load-induced slowness no longer does.
3. **testing-library's own 1 s `waitFor` default — still live**: ~74 call sites across 9 studio
   files, nothing configuring `asyncUtilTimeout`. The 60 s vitest ceiling cannot save a `waitFor`
   that gives up after 1 s of fork starvation. This class caused the 07-29 (#1014) and 07-30
   (#1033) studio flakes ("passed 154/154 isolated").
4. **Real sleeps/polls — latent, zero confirmed flakes**: 27 occurrences in 15 files (debounce
   outwaits, 20 ms mtime sleeps, 5 ms poll intervals with iteration caps). Timer ordering protects
   most.

Most timing-SUBJECT tests already follow the house pattern: injected clocks (`drive` db-control),
`mock.timers` (desktop advisory), pinned `FIXED_NOW` (context-traversal-telemetry), no-op sleep
seams (cli), outcome-not-duration SIGKILL proofs (orchestrator), CSS-parsed animation durations
(app-surface). The suite's own good practice is the rule; the slop is the exception.

Compounding the cost, AS MEASURED IN 2026-07: `pnpm gate` was one `&&` chain with `pnpm -r test`
mid-chain and eleven checks after it; `pnpm -r` halts at the first failing package, so any flake
silently skipped later packages AND all eleven tail checks — including the three zero-ceiling corpus
gates. This hid a real corpus RED on 07-29 and a real `packages/cli` snapshot RED behind an unrelated
studio flake (#1014).

> **Corrected in place 2026-08-04 (ADR-0139) — the outer half of that compounding is fixed; the inner
> half is not.** The `&&` chain is gone: `pnpm gate` now runs EVERY step through a runner and reports
> per-step PASS / FAIL / NOT RUN (`packages/cli/src/gate-run{,ner}.ts`, plan in `gate-order.ts`;
> parked entry `gate-runs-every-step-and-reports-per-step` on `verification-integrity-arc`), so a
> flake in `pnpm -r test` no longer skips the tail checks at all. What REMAINS true is the inner
> sentence: `pnpm -r` still halts at the first failing package, so a flake in one workspace still
> hides later workspaces' tests **within that one step**. This ADR's decision is untouched either way
> — it is why the fence exists rather than a scheduling workaround.

## Decision

**A wall-clock duration is never a gate-tier assertion. Gate-tier tests assert outcomes; timing
subjects get injected/fake clocks; perf numbers live in an opt-in tier where they mean something.**
Concretely, four increments (owner picked option A of four proposed; D — a quarantine/retry tier —
was rejected on principle: retries institutionalise flake and mask genuine regressions,
halted-is-never-a-pass applies to flake-retries too):

1. **The routing perf bound goes opt-in** (this PR). The gate keeps 100 % of the functional proof
   (routing completes, segment ids unique, chains continuous); the `elapsed < 2000` assertion runs
   only under `STORYTREE_PERF=1` — on demand, on a quiet box, where the number measures the routine.
2. **`waitFor` gets a load-proof ceiling** (this PR): `configure({ asyncUtilTimeout: 15_000 })` in
   `apps/studio/vitest.setup.ts` — the third instance of the precedented ceiling fix (studio + app-
   surface testTimeout). A genuinely-missing element still fails; a passing `waitFor` resolves the
   moment its condition holds, so green runs get no slower.
3. **A fence against recurrence** (LANDED 2026-08-03): a fail-closed `check:test-timing` in the gate
   + CI — the drain-ceiling pattern (ADR-0252 D3) over wall-clock measurement in gate-tier test files
   (`performance.now` / `process.hrtime`), ceiling = the one sanctioned env-gated survivor
   (routing), any new file blocked with the remedy named (fake timers / injected clock / the
   `STORYTREE_PERF` gate / a bench file). Plus the rule carried into agent-authored test guidance —
   prevention at authoring time, not just red at gate time.

   Two things about the delivered shape, recorded so a reader is not surprised by the diff. **The
   fence carries a SECOND axis this text did not anticipate:** an allow-list naming one file is a
   blanket pardon for that file, so deleting the `if (process.env.STORYTREE_PERF === '1')` guard
   would restore the exact flake increment 1 removed while the unsanctioned count sat honestly at
   zero. The survivor is therefore held to its env gate independently (G=0), and a sanctioned entry
   whose file no longer exists breaches there too. **And the authoring-time half is an EDIT, not a
   new guardrail:** the rule went into the existing `test-creation-principles` principle — the
   corpus's canonical test-authoring artifact — rather than minting an eighteenth guardrail that
   would restate, in prose, a fence the code now enforces at a zero ceiling. `edit-first-curation`
   makes edit the default and a new artifact the justified exception; a second copy of an enforced
   rule is not that exception. The decision here is unchanged — the rule reaches authoring guidance —
   only the vehicle is named accurately.
4. **The gate stops skipping silently** (follow-up): `pnpm -r --no-bail test`, tail checks that
   always run, and an aggregate scoreboard naming every red and every skip. Orthogonal to the
   still-undecided gate diff-scoping (overnight-audit remedies #2/#4): this changes failure
   REPORTING, not what runs; it composes with whatever subset a future scoping decision selects.

Not chosen: converting the 27 latent sleep/poll sites now (option C) — days of churn against a
class with zero confirmed flakes; the fence blocks its growth and it can drain organically.

## Consequences

- Innocent diffs stop paying the 9–42 min flake tax for load on the dev box; the two classes that
  actually redded gates (measured elapsed, `waitFor` 1 s) are dead after increments 1+2.
- The routing perf contract survives, honestly: `STORYTREE_PERF=1 pnpm --filter
  @storytree/forest-world test` asserts the 2 s bound on demand; the measurement code still runs
  (and prints) every gate pass, so it cannot rot unnoticed.
- Until increment 4 lands, a mid-gate flake still silently skips the tail checks — re-run them
  manually after any `-r test` failure (the standing trap).
- The window in which nothing but review stopped a NEW wall-clock assertion entering opened
  2026-07-31 and CLOSED 2026-08-03 with increment 3. `check:test-timing` now reds the gate and CI at
  a zero ceiling on the first unsanctioned occurrence in any gate-tier test file, naming it
  `file:line` with the four remedies. The baseline it shipped on is genuinely clean — 476 test files
  across 24 gate-tier workspaces, one wall-clock file, and it is the sanctioned, still-env-gated
  survivor — so there is no headroom to absorb a regression.
- A NEW permanent exemption now costs an `SANCTIONED_WALL_CLOCK` entry and the ADR-0269 evidence bar,
  which is the intended price. The escape hatch for a genuine timing need is not that list: it is the
  `STORYTREE_PERF` gate (keep the functional assertions gate-tier, guard the bound) or a bench file.
- A genuinely-hung `waitFor` now takes 15 s to fail instead of 1 s — slower diagnostics on real
  breaks, the same trade both testTimeout precedents accepted.

## References

- Arc: `flaky-test-coverage-arc` (increment 1 = the inventory + this decision).
- ADR-0252 (zero drain ceilings — the fence pattern), ADR-0110 (born-accepted ratification),
  ADR-0016 (file:symbol citations).
- Evidence: overnight audit 2026-07-31; `apps/studio/vitest.config.ts` and
  `packages/app-surface/vitest.config.ts` comments (the precedented ceiling rationale);
  PR #1010 / #1014 / #1033 flake post-mortems.
- Code (increments 1+2): `packages/forest-world/src/routing.test.ts` (env-gated bound),
  `apps/studio/vitest.setup.ts` (`asyncUtilTimeout` floor).
- Code (increment 3): `packages/cli/src/test-timing-gate.ts` (the sweep, the aperture, and the
  comment/string masker), `packages/cli/src/test-timing-drain.ts` (the two zero ceilings and their
  measured baselines), `packages/cli/src/check-test-timing.ts` (the shell), the `check:test-timing`
  root script wired cheap-first into the `gate` chain and into `PRE_EXPENSIVE_CHECKS`
  (`packages/cli/src/gate-order.ts`), the CI step in `.github/workflows/ci.yml`, and the
  authoring-time rule in the `test-creation-principles` principle.
