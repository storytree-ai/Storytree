---
id: "adr-health-gate"
tier: capability
story: ci-cd
title: "ADR-health gate — atomic number allocation plus the full adr-health + cross-PR decision-binding gate"
outcome: "Decision-binding hygiene is enforced on the dev-repo path: ADR numbers allocate atomically, every adr-health invariant (frontmatter, edge-integrity, supersede-consistency, story-decisions, green-flip, number-uniqueness) reddens a PR on the merge ref, and a cross-open-PR check catches concurrent same-number adds."
status: proposed
proof_mode: integration-test
depends_on: []
---

# ADR-health gate — atomic number allocation plus the full adr-health + cross-PR decision-binding gate

**Outcome —** Decision-binding hygiene is enforced on the dev-repo path. ADR numbers are allocated
**atomically** (`storytree adr new --pg` reserves the next number from `events.adr_number`); the
`adr-health` suite — **six** GATE checks, not just number-uniqueness — reddens a PR on the
merge-with-main ref; and a cross-open-PR collision check catches the one race the merge-ref can't see.
This is the **dev-repo (PR) half of ADR-0037** decision binding (plus ADR-0050 number allocation);
its build-drive counterpart is drive-machinery's `oq-hygiene-gate` (ADR-0037 §5).

## Guidance

- **Proof-walkthrough first (integration test, against the real allocator + the real `adr-health`
  suite + the cross-PR script).** Three wired-together legs: (1) the allocator reserves
  monotonically and atomically — two near-simultaneous `adr new --pg` calls get DISTINCT numbers from
  `events.adr_number`, offline falling back to `max+1` with a loud "not reserved" warning; (2) the
  `adr-health` checks (in `pnpm -r test`, [`adr-health.ts`](../../packages/cli/src/adr-health.ts)) all
  fail-CLOSED on a violation, firing on a PR against the **merge ref**; (3)
  [`adr-pr-collision-check.sh`](../../scripts/adr-pr-collision-check.sh) fails-CLOSED only when another
  OPEN PR adds the same number and fails-OPEN on any `gh`/network error.
- **`adr-health` is SIX GATE checks, not one.** ci-cd previously named only `adr-number-unique`; the
  suite actually enforces: **`adr-frontmatter`** (every `docs/decisions/*` parses with a known
  status), **`adr-edge-integrity`** (every `supersedes`/`supersedes_in_part`/`amends` target exists),
  **`supersede-consistency`** (`X.supersedes ∋ Y ⇔ Y.status = superseded`, both directions),
  **`story-decisions`** (every story's `decisions:` entry resolves and none names a fully-superseded
  ADR), **`green-flip`** (no `healthy` story rests on a still-`proposed` deciding ADR), and
  **`adr-number-unique`**. All are GATE-class — any one reddens `pnpm -r test`, hence the PR.
- **Two layers cover two different races.** The merge-ref `adr-number-unique` catches a number already
  on `main`; the cross-PR script catches the gap it leaves — two PRs each ADDING the same number on
  their own branch, neither merged, so neither merge-ref contains the other's file. Don't collapse
  them.
- **The ADR-0037 enforcement is deliberately split by TRIGGER SURFACE, not duplicated.** This gate is
  the **PR-path** half (§3–4 structural health + ADR-0050 numbers, run in CI `verify`). The
  **build-drive** half is drive-machinery's [`oq-hygiene-gate`](../drive-machinery/oq-hygiene-gate.md)
  (§5), which refuses a live `story build` while an operator answer on a deciding ADR's open question
  sits unprocessed — a different trigger (a storytree build, not a contributor PR). Keeping each half
  with its trigger surface is the owner's call (2026-06-14); a future `decision-binding` substrate
  story could absorb both, but is not authored.
- Live legs (the allocator's reservation from `events.adr_number`) need `pnpm db:up`; the registered
  offline proof should cover the pure layers (the `adr-health` checks over a fixture corpus, the
  collision script's diff parsing) and let the DB reservation follow the house live-gated pattern.

## Contracts (5)

1. **`atomic-allocation`** — `adr new --pg` reserves distinct, monotonically increasing numbers
   - **asserts —** two reservations against `events.adr_number` never return the same number and
     never go backwards; the scaffolded `docs/decisions/NNNN-slug.md` carries the reserved number.
2. **`offline-falls-back-loudly`** — no DB still yields a number, but warns
   - **asserts —** without `--pg`/a reachable store, allocation returns `max+1` over the on-disk ADRs
     AND emits a "not reserved" warning — so an offline allocation is never silently authoritative.
3. **`number-uniqueness-on-merge-ref`** — `adr-number-unique` reddens a clash on the merge ref
   - **asserts —** a corpus with two ADRs sharing a 4-digit number fails the `adr-number-unique`
     check (exit non-zero in `pnpm -r test`); a number already on `main` therefore fails a PR that
     re-adds it, because the check runs on the branch-merged-with-main ref.
4. **`decision-binding-health-reddens-pr`** — the structural adr-health checks each fail-closed
   - **asserts —** each of `adr-frontmatter`, `adr-edge-integrity`, `supersede-consistency`,
     `story-decisions`, and `green-flip` exits non-zero in `pnpm -r test` on its own violation
     (an unknown status, a dangling supersedes/amends target, a one-directional supersede edge, a
     story `decisions:` entry that doesn't resolve, a `healthy` story on a `proposed` ADR) — so a
     decision-binding break reddens the PR, not just a duplicate number.
5. **`cross-open-pr-collision`** — concurrent same-number PRs are caught, tooling errors are not fatal
   - **asserts —** `adr-pr-collision-check.sh` exits non-zero (fail-CLOSED) when another open PR adds
     the same ADR number this PR adds, and exits zero (fail-OPEN) when `gh` is unavailable or returns
     an error — a flaky API never blocks all merges.
