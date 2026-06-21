---
status: accepted
decided: 2026-06-14
---

# ADR-0050: ADR numbers are allocated from the store (no more parallel-authoring collisions)

## Status

**accepted** (2026-06-14; flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) — direct owner decision: parallel sessions kept picking the **same ADR
number** (0047 was taken twice; 0048 collided across two sessions and had to be renumbered to 0049
mid-PR). The owner asked for the numbers to "auto-increment from the db." Chosen shape: **a DB
allocator for proactive prevention PLUS a CI dup-number gate as the guarantee** (the owner picked
"Both" over allocator-only or gate-only). Builds on [ADR-0037](0037-decision-binding-and-hygiene-gates.md)
(the `adr-health` decision-binding gate this extends) and [ADR-0022](0022-ci-green-gate-and-auto-merge.md)
(the green gate the new checks ride). No outgoing supersede/amend edge: this ADD​s a mechanism; it
overturns nothing. (ADRs stay **git docs** — only the *number allocation* touches the store, a thin
counter, not the content; the "ADRs are docs, not DB rows" stance of ADR-0017 holds.)

## Context

ADR numbers are picked by hand: a session eyeballs `git log --all`, takes "the next free number," and
bakes it into the filename, the H1, the frontmatter edges, and every `ADR-NNNN` cross-reference. On
isolated branches that don't see each other's in-flight picks, two sessions routinely choose the same
number. When both go green and auto-merge (ADR-0022), `main` ends up with two files numbered the same
— a mess to untangle after the fact (rename the file, the H1, and every reference). It keeps happening.

The collision is fundamentally distributed: branches author offline-of-each-other, and some sessions
(the ephemeral web/remote containers) have **no DB access at all** (CLAUDE.md), so a DB allocator
cannot be the *only* path. The fix needs a proactive allocator for the common (online) case AND a
backstop that also covers the offline case and can never silently keep a duplicate on `main`.

## Decision

Two layers — the allocator prevents, the gate guarantees.

1. **A DB allocator — `storytree adr new` (and `adr next`).** A new `events.adr_number` table is the
   single point that serializes allocation across all concurrent branches. `PgAdrStore.allocate`
   reserves the next number transactionally: `GREATEST(localMax, max-handed-out) + 1`, where
   `localMax` is the caller's highest on-disk ADR — so it **reconciles** against ADRs that landed on
   `main` without the allocator (an offline-fallback author), never re-handing a used number.
   `number` is the PK; a contended double-allocation hits a unique violation (23505) and **retries**,
   recomputing the max. `adr new --title "..." --pg` reserves the number AND scaffolds
   `docs/decisions/NNNN-slug.md` (proposed frontmatter + the standard sections). Offline (no `--pg`,
   or no DB) it **falls back to `max-on-disk + 1` with a loud "NOT reserved" warning** — so a
   web/remote session is never blocked; the gate is its safety net.

2. **A CI dup-number gate — two checks.**
   - **`adr-number-unique` (in `adr-health`, runs in `pnpm -r test`).** No two ADR files share a
     number. Because CI runs on the PR's *merge-into-main* ref, this fails a PR whose number is
     already on `main`, and — the load-bearing property — makes a concurrent pair **un-ignorable**:
     the moment the second one lands, the gate on `main` goes red until it's renumbered. A duplicate
     can never silently persist. This check is offline + always-on, so it covers web/remote sessions.
   - **`scripts/adr-pr-collision-check.sh` (a PR-only CI step).** Closes the one gap the first check
     leaves — a truly-concurrent pair, neither merged, where neither branch's merge ref contains the
     other's file. It fails a PR whose newly-added number is also being added by another **open** PR.
     Fail-OPEN on `gh`/network errors (never blocks all merges on a flaky API), fail-CLOSED only on a
     real clash; the `adr-number-unique` gate on `main` is the ultimate backstop.

## Consequences

- Two online sessions can no longer pick the same number (the allocator serializes them); an offline
  session is unblocked (max+1 fallback) and any resulting rare collision is caught before it can sit
  on `main`. The recurring renumber-after-the-fact toil goes away.
- A thin new DB coupling: one append-only `events.adr_number` allocation log (slug/branch/actor for a
  "who took 0050" audit). ADR **content** stays in git; only the *number* is allocated from the store.
- **This ADR (0050) is the last HAND-numbered one.** It had to be: on a branch cut from `main`, the
  on-disk max is 0046 and the in-flight 0047–0049 live on other unmerged branches, so the allocator
  (reconciling off `localMax`) would mis-pick 0047. Once those merge, `localMax` reflects reality and
  the allocator self-heals — every ADR after this is `storytree adr new`.
- **Enablement (post-merge, idempotent):** the allocator needs `events.adr_number` in the live DB.
  It's in `schema.sql` (additive, `IF NOT EXISTS`), applied by the standard `applySchema` migration
  path. Until applied, `adr new --pg` errors clearly and offline `adr new` still works — nothing on
  `main` breaks. No data migration, no seeding (the allocator reconciles off `localMax`).
- The `verify` CI job gains a `permissions` block (`contents: read`, `pull-requests: read`) for the
  cross-PR check — read-only, no new secret.

## References

- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) (the `adr-health` gate this adds a check to).
- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the green gate + auto-merge the checks ride).
- [ADR-0017](0017-cross-cutting-knowledge-tier.md) ("ADRs are source docs" — unchanged; only the
  number is allocated from the store).
- `packages/store/src/adr-store.ts` + `schema.sql` (the allocator); `packages/cli/src/adr.ts` (the
  command); `packages/cli/src/adr-health.ts` + `scripts/adr-pr-collision-check.sh` (the gate).
