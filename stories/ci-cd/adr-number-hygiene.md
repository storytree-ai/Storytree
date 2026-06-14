---
id: "adr-number-hygiene"
tier: capability
story: ci-cd
title: "ADR-number hygiene — atomic allocation plus a two-layer duplicate gate"
outcome: "ADR numbers are allocated atomically and any duplicate is refused — on the merge ref and across concurrently-open PRs."
status: proposed
proof_mode: integration-test
depends_on: []
---

# ADR-number hygiene — atomic allocation plus a two-layer duplicate gate

**Outcome —** ADR numbers are allocated **atomically** (`storytree adr new --pg` reserves the next
number from `events.adr_number`) and any duplicate is refused — by the `adr-number-unique` health
check on the PR's merge-with-main ref (in `pnpm -r test`) and by the cross-open-PR collision check
([`scripts/adr-pr-collision-check.sh`](../../scripts/adr-pr-collision-check.sh)) for truly-concurrent
pairs (ADR-0050; decision-binding hygiene is ADR-0037).

## Guidance

- **Proof-walkthrough first (integration test, against the real allocator + the real two-layer
  gate).** Three legs that have to be wired together, not one: (1) the allocator reserves
  monotonically and atomically — two near-simultaneous `adr new --pg` calls get DISTINCT numbers from
  `events.adr_number`, and offline it falls back to `max+1` with a loud "not reserved" warning; (2)
  `adr-number-unique` (the adr-health check inside `pnpm -r test`) FAILS when two ADR files share a
  number — which on a PR fires against the merge ref, so a number already on `main` reddens the PR;
  (3) `adr-pr-collision-check.sh` fails-CLOSED only when another OPEN PR adds the same number and
  fails-OPEN on any `gh`/network error.
- The two gate layers are complementary by design: the merge-ref `adr-number-unique` catches a number
  already on `main`; the cross-PR script catches the one gap that leaves — two PRs each ADDING the
  same number on their own branch, neither merged, so neither merge-ref contains the other's file.
  Don't collapse them into one — they cover different races.
- Live legs (the allocator's reservation from `events.adr_number`) need `pnpm db:up`; the registered
  offline proof should cover the pure layers (the duplicate detector over a fixture corpus, the
  collision script's diff parsing) and let the DB reservation follow the house live-gated pattern.

## Contracts (4)

1. **`atomic-allocation`** — `adr new --pg` reserves distinct, monotonically increasing numbers
   - **asserts —** two reservations against `events.adr_number` never return the same number and
     never go backwards; the scaffolded `docs/decisions/NNNN-slug.md` carries the reserved number.
2. **`offline-falls-back-loudly`** — no DB still yields a number, but warns
   - **asserts —** without `--pg`/a reachable store, allocation returns `max+1` over the on-disk ADRs
     AND emits a "not reserved" warning — so an offline allocation is never silently authoritative.
3. **`duplicate-on-main-ref-refused`** — `adr-number-unique` reddens a clash on the merge ref
   - **asserts —** a corpus with two ADRs sharing a 4-digit number fails the `adr-number-unique`
     adr-health check (exit non-zero in `pnpm -r test`); a number already on `main` therefore fails a
     PR that re-adds it, because the check runs on the branch-merged-with-main ref.
4. **`cross-open-pr-collision`** — concurrent same-number PRs are caught, tooling errors are not fatal
   - **asserts —** `adr-pr-collision-check.sh` exits non-zero (fail-CLOSED) when another open PR adds
     the same ADR number this PR adds, and exits zero (fail-OPEN) when `gh` is unavailable or returns
     an error — a flaky API never blocks all merges.
