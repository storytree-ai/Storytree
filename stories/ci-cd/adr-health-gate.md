---
id: "adr-health-gate"
tier: capability
story: ci-cd
title: "ADR-health gate — atomic number allocation plus the full adr-health decision-binding gate"
outcome: "Decision-binding hygiene is enforced on the dev-repo path: ADR numbers allocate atomically from the store, allocation REFUSES rather than guessing when the store is unreachable, and every adr-health invariant (frontmatter, number-identity, edge-integrity, supersede-consistency, story-decisions, green-flip, load-bearing-live) reddens a PR through the `check:adr-health` rung — which fails, never skips, when its subject cannot be read."
status: proposed
proof_mode: integration-test
depends_on: []
---

# ADR-health gate — atomic number allocation plus the full adr-health decision-binding gate

**Outcome —** Decision-binding hygiene is enforced on the dev-repo path. ADR numbers are allocated
**atomically** (`storytree adr new --pg` reserves the next number from `events.adr_number`) and the
decision is written as the `adr-NNNN` **row**; the `adr-health` suite — **seven** GATE checks, not
just one — reddens a PR through the `check:adr-health` gate rung; and that rung **fails rather than
skips** when the decision log cannot be read, so a green means the decisions were read and judged.
This is the **dev-repo (PR) half of ADR-0037** decision binding (plus ADR-0050 number allocation);
its build-drive counterpart is drive-machinery's `oq-hygiene-gate` (ADR-0037 §5).

## Guidance

- **Proof-walkthrough first (integration test, against the real allocator + the real `adr-health`
  suite).** Two wired-together legs: (1) the allocator reserves monotonically and atomically — two
  near-simultaneous `adr new --pg` calls get DISTINCT numbers from `events.adr_number`, and with no
  reachable store both verbs REFUSE rather than mint a number; (2) the `adr-health` checks
  ([`adr-health.ts`](../../packages/cli/src/adr-health.ts), fired against the live store by
  [`check-adr-health.ts`](../../packages/cli/src/check-adr-health.ts)) all fail-CLOSED on a
  violation, firing on a PR against the **merge ref**.
- **The decision log is a DATABASE, and that moved this gate (ADR-0403 dec 1).** Decisions are
  ordinary `adr` Library rows; `docs/decisions/` no longer exists. Two consequences run through
  every contract below. First, `adr-health` **left `pnpm -r test`**: that suite is deliberately
  credential-free (ADR-0302 D3), so a check whose subject is a database could not stay in it, and
  ADR-0307 D4 puts real-corpus assertions on a `check:*` rung that may hold a connection. It is now
  the declared rung `check:adr-health` ([`gate-order.ts`](../../packages/cli/src/gate-order.ts)),
  sitting in the gate's block C because its subject is SHARED live state — another session's
  `adr new` or status flip can red it. CI runs it as its own step. Second, there is **no offline
  allocation path left**: the old `max-on-disk + 1` fallback read the deleted directory, and a
  session that cannot reach the store cannot write the decision either, so reserving a number it
  could never use would burn it.
- **`adr-health` is SEVEN GATE checks plus one WARN, not one.** ci-cd once named only
  `adr-number-unique`; the suite enforces **`adr-frontmatter`** (every decision row reads with a
  known status), **`adr-number-identity`** (a row's stored `number` agrees with the number in its
  id — which is what the allocator reserved), **`adr-edge-integrity`** (every `supersedes`/`amends`
  target exists), **`supersede-consistency`** (`X.supersedes ∋ Y ⇔ Y.status = superseded`, both
  directions), **`story-decisions`** (every story's `decisions:` entry resolves and none names a
  fully-superseded ADR), **`green-flip`** (no `healthy` story rests on a still-`proposed` deciding
  ADR), and **`load-bearing-live`** (a `load_bearing: true` ADR must be `accepted`). All seven are
  GATE-class and listed in `ADR_GATE_CHECKS`; **`enforced-by-anchors`** is WARN-class.
- **THREE RUNGS RETIRED WITH THE FILES, and the reasons differ — they are declared in
  `RETIRED_ADR_CHECKS`, not silently dropped.** `adr-number-unique` was **replaced** by
  `adr-number-identity`: two FILES could share a number, two ROWS cannot, because the id is the
  primary key — so the old question is structurally unanswerable and asking it would be a permanent
  vacuous green. `supersedes-in-part-retired` is **gone as unreachable**: ADR-0139 retired the edge,
  a row has no frontmatter, and the `adr` schema refuses the key outright. `adr-link-integrity` is
  **gone and was a real loss**, not a dissolved question — it guarded `](NNNN-slug.md)` cross-links
  between decision bodies against rename rot; its rot class is rehomed into `references` as
  `asset:adr-NNNN`, where `referential-integrity` already looks, and a number-based ref has no slug
  to rot.
- **THE CROSS-PR COLLISION CHECK IS GONE, and its race is structurally impossible now.**
  `scripts/adr-pr-collision-check.sh` closed the gap the merge ref could not see — two PRs each
  ADDING the same number on their own branch, neither merged. That gap existed only because a
  number was claimed by adding a FILE on a branch. A number reserved transactionally in the store is
  never claimed on a branch, so the script was deleted rather than ported. **Do not re-introduce a
  two-layer story here** — there is one layer, and it is the allocator.
- **An unreadable subject is a FAILURE, never a pass — this is the rung's most load-bearing
  property.** The most dangerous shape for a check whose subject just moved behind a network call is
  one that reads "I could not look" as "nothing wrong". `check:adr-health` exits non-zero, naming
  which case it hit, when the pool will not open, when the rows will not parse, and on each of three
  ZERO-FLOORS: no decisions (the store IS the log and there is no file tree to reload from, so zero
  means the wrong database), no stories (`story-decisions` and `green-flip` judge stories, so zero is
  two rungs passing over an empty list), and no guardrails carrying `enforcedBy`. The decision floor
  survived the move; the other two were dropped and nothing noticed, because the real corpus is never
  empty — exactly the shape that only fails on the day it matters.
- **The ADR-0037 enforcement is deliberately split by TRIGGER SURFACE, not duplicated.** This gate is
  the **PR-path** half (§3–4 structural health + ADR-0050 numbers, run in CI `verify`). The
  **build-drive** half is drive-machinery's [`oq-hygiene-gate`](../drive-machinery/oq-hygiene-gate.md)
  (§5), which refuses a live `story build` while an operator answer on a deciding ADR's open question
  sits unprocessed — a different trigger (a storytree build, not a contributor PR). Keeping each half
  with its trigger surface is the owner's call (2026-06-14); a future `decision-binding` substrate
  story could absorb both, but is not authored.
- Every leg now needs `pnpm db:up` — the allocator's reservation from `events.adr_number` and the
  rung's read of the decision rows alike. The registered offline proof should cover the pure layers
  (`adrHealth` takes injected views and returns `CheckResult[]`; the suite proves each rung's logic
  against literals with no store and no filesystem) and let the live legs follow the house
  live-gated pattern.
- **The allocation envelope carries one thing the gates cannot (ADR-0339).** The allocator catches a
  duplicate NUMBER; nothing catches a parallel DECISION — two ADRs on different branches that
  contradict each other, which reaches CI as a merge conflict long after both designs are settled
  (the 2026-08-09 ADR-0335 / ADR-0337 near-miss). The allocator already knows: reserving `N` when the
  highest decision this run observed is `M < N - 1` proves other sessions took `M+1 … N-1`.
  `adr new` / `adr next` say so. It is a HEADS-UP and deliberately not an eighth gate check — a
  reported number may be a burned allocation, so the only honest claim is "allocated elsewhere, not
  seen by this run", and `process:justify-a-gate-rung` has no catch evidence to price a rung on.

## Contracts (6)

1. **`atomic-allocation`** — `adr new --pg` reserves distinct, monotonically increasing numbers
   - **asserts —** two reservations against `events.adr_number` never return the same number and
     never go backwards; the scaffolded decision is written as the `adr-NNNN` ROW carrying the
     reserved number in its id and its `number` field.
2. **`allocation-refuses-without-a-store`** — no store yields no number, loudly
   - **asserts —** `adr new` and `adr next` invoked without `--pg`, and with `--pg` against an
     unreachable store, both exit non-`ok` with a refusal naming the reason and pointing at
     `pnpm db:up` — neither mints a number nor falls back to any on-disk maximum. A number reserved
     by a session that cannot write the decision is a number burned for nothing (ADR-0403 dec 1),
     so refusing is the contract, not a degraded mode.
3. **`number-identity-on-the-row`** — `adr-number-identity` reddens a row whose number drifted
   - **asserts —** a decision row whose stored `number` disagrees with the 4-digit number in its own
     id fails the `adr-number-identity` check (non-zero exit from `pnpm check:adr-health`). This is
     the reachable successor to `adr-number-unique`: duplicate ids are refused by the primary key, so
     the failure that survives is a row's `number` field drifting from what the allocator reserved.
4. **`decision-binding-health-reddens-pr`** — the structural adr-health checks each fail-closed
   - **asserts —** each of `adr-frontmatter`, `adr-edge-integrity`, `supersede-consistency`,
     `story-decisions`, `green-flip` and `load-bearing-live` exits non-zero from
     `pnpm check:adr-health` on its own violation (an unknown status, a dangling supersedes/amends
     target, a one-directional supersede edge, a story `decisions:` entry that doesn't resolve, a
     `healthy` story on a `proposed` ADR, a `load_bearing` ADR that isn't accepted) — so a
     decision-binding break reddens the PR, not just a number problem. `enforced-by-anchors` warns
     and does not.
5. **`unreadable-subject-fails-never-skips`** — the rung cannot report green having read nothing
   - **asserts —** `check:adr-health` exits non-zero, with a message naming which case it hit, when
     the pool will not open, when the decision rows will not parse, and when any of its three
     subject populations comes back EMPTY (zero decisions, zero stories, zero guardrails carrying
     `enforcedBy`). Zero is never a clean bill of health here. This is the successor to the deleted
     cross-PR collision script's fail-closed leg: the collision race went with the files, but "a
     check that passes having proven nothing" is the failure mode that outlived it.
6. **`parallel-allocations-are-named`** — allocation reports the numbers this run did not see
   - **asserts —** reserving a number more than one above the highest decision this run read from
     the store makes `adr new` / `adr next` name every number in between as allocated by other
     sessions, and point at `storytree library artifact adr-NNNN` to read one (an empty answer means
     reserved, not yet written); a contiguous reservation says NOTHING, and an unreadable log
     refuses outright rather than reporting a spurious gap; and the envelope stays `ok` with the
     decision written either way — a heads-up, never a gate (ADR-0339).
