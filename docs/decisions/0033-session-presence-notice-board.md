---
status: accepted
decided: 2026-06-11
---

# ADR-0033: The notice board is session presence — advisory coordination for parallel sessions

## Status

accepted (2026-06-11; flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)). Authored from the owner design conversation of 2026-06-10/11; the owner has
approved the direction and the rename in conversation — this ADR records it for review. Names the
**`notice-board`** story (the session-presence coordination story) as the build vehicle; the prior
holder of that name is renamed **`feedback-graduation`** (see
[ADR-0032](0032-cite-graduation-mechanism.md), which reshaped it).

**Correction ([ADR-0048](0048-in-flight-build-is-the-primary-wisp.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** session presence
is **demoted out of the orbiting-wisp role** — the *session* no longer orbits a tree; the in-flight
mechanical *build* does. This ADR's presence model, dock, and `noticeboard declare` (Decisions 1–3, 5)
all stand; only the later-attached orbiting-wisp role moves to the harness.

**Correction ([ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** Decision 4's "It
is not built now" was overtaken — the typed-claims-with-refusal upgrade §4 named-deferred was BUILT for
the build surface once overlap became routine (the 2026-06-27 duplicate build); Decision 4 and the
"What this does NOT decide" bullet below are corrected accordingly. The advisory presence board
(Decisions 1–3, 5) stands untouched.

**Correction ([ADR-0199](0199-a-build-run-never-writes-session-presence.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** Decision 3's
ambient ladder listed a **spine-side build rung** — "`node build` / `story build` declare presence
around the SDK leaf run in plain code". That rung is **retired**: a build run now writes no
`events.session` presence at all (its footprint is work-events + the write-claim). The `SessionStart`/
`SessionEnd` hook rung and the statusline heartbeat rung stand unchanged; Decision 3's marked bullet
is corrected below.

## Date

2026-06-11

## Context

Parallel sessions cannot see each other. Each Claude Code session runs in its own worktree on its
own branch; the only cross-session surfaces are `origin/main` (after the fact) and the shared
Cloud SQL store (per-artifact rows). The failure this produces is not hypothetical here: two v2
sessions independently allocated **ADR-0027** for different content (reconciled by renumbering to
0029), and — fittingly — while this very direction was being designed, a parallel session landed
ADR-0032 and reshaped the then-`notice-board` story, moving this ADR from 0032 to 0033.

V1 (the vendored `legacy/Agentic`) solved this with **ADR-0022's three-primitive coordination
substrate**: per-session identity state files, **typed claims with a hard chip-spawn refusal on
conflict**, and a per-story free-prose channel. It worked, but it was contorted around what V1
lacked — a shared store (per-worktree SurrealKV + bootstrap-on-merge transport) — and the owner's
retrospective is direct: the mechanism grew more sophisticated than wanted ("made more sophisticated
from under me"). The owner's actual mental model of the notice board has always been: **a simple
list of worktrees/sessions and what they are working on, anchored to a story node** — "a simple
declaration of *I exist and I'm working on xyz* is better than nothing."

Two things changed since V1:

1. **The shared substrate exists.** The Cloud SQL Postgres store (ADR-0015/0017) is live and
   already carries cross-session state (library, comments, work events, verdicts). V1's deferred
   "Phase-1 shared DB would close this gap as a side effect" is V2's ground truth.
2. **The hook surface bifurcated.** V1's only automation hook surface was Claude Code shell hooks,
   and a failing hook on a blocking-capable event (`Stop` exit-2 blocks the stop and feeds stderr
   back to the model) put the agent in a repeat loop — a real, painful operator experience. V2's
   live leaf runtime is the Claude Agent SDK (ADR-0030), where the spine owns the calling code and
   hooks are typed in-process callbacks with failure semantics we define.

## Decision

1. **The notice board is a presence list, not an enforcement mechanism.** One declaration doc per
   session, **upserted** (current state) over an **append-only event history** (the house
   event+projection pattern): `events.session_event` + `events.session`, siblings to
   `events.comment*`. Shape (zod-validated in `@storytree/core`) *(now `packages/notice-board` —
   `packages/core` dissolved by ADR-0068)*:
   `{ sessionId, branch, workingOn, nodes, status, startedAt, lastSeenAt }`.
   - `sessionId` **is the worktree name** (e.g. `flamboyant-mccarthy-b02671`) — derived, never
     typed. No new identity machinery and **no signer chain**: presence is not proof (nothing is
     gained by forging "I exist"), so the fail-closed signing posture that guards verdicts
     (ADR-0020) deliberately does not apply.
   - `workingOn` is required free prose; `nodes` is an optional list of work-hierarchy ids (story
     or capability). **Granularity growth is free**: when stories prove too coarse, sessions
     declare finer node ids in the same field — no schema change, no new primitive.
   - **Staleness replaces release discipline.** Sessions die ungracefully; rather than a
     claim-release ceremony, the board view ages rows by `lastSeenAt` (dim/flag stale rows).
     `status: done` is politeness, not a requirement.

2. **The CLI orientation surfaces are the primary integration** (ADR-0023's
   choose-your-own-adventure pattern, extended). An agent session's startup protocol is reading
   three surfaces, each of which emits presence where relevant:
   - **`storytree tree`** *(new area)* — the work-hierarchy view (stories, capabilities, statuses)
     with a presence summary line;
   - **`storytree tree <story-id>`** — the zoom, and the centerpiece: the story's nodes, edges and
     verdict state **with the presence block woven in** ("sessions here: …, last seen 4m") — an
     agent zoning into its story node sees its neighbours without asking;
   - **`storytree noticeboard`** — the dedicated board (full list grouped by story node) plus
     `declare` / `done`;
   - `storytree library` — gains a one-line presence stat only.
   Presence requires the live DB (`pnpm db:up`); offline, the tree renders from `stories/` and the
   presence lines simply do not appear (degrade, don't fail).

3. **Automation never blocks.** The encoded guardrail from the V1 experience: **the notice board
   never touches a blocking-capable hook** (`Stop`, `PreToolUse`, `UserPromptSubmit`) and a board
   write failure never fails the enclosing action. The automation ladder, all advisory:
   - ~~**Spine-side (no hooks):** `node build` / `story build` declare presence around the SDK leaf
     run in plain code — deterministic, testable;~~ *(rung **retired** by
     [ADR-0199](0199-a-build-run-never-writes-session-presence.md), per
     [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): a build run
     writes no session presence — the `withPresence` wrapper is deleted; builds touch only
     `events.work_event` + the write-claim. The hook and statusline rungs below stand.)*
   - **Interactive sessions:** `SessionStart`/`SessionEnd` shell hooks that fire-and-forget
     (`exit 0` always, short timeout, silent when the DB is down);
   - **Statusline:** the read surface — a board glance rendered on every turn (and optionally a
     debounced `lastSeenAt` heartbeat); a statusline failure renders nothing and cannot loop the
     agent.

4. **No claims, no conflict refusal — named-deferred.** *(Since built for the build surface by
   [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md), per
   [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): the "It is not
   built now" below held at the time, but the upgrade was built once overlap became routine.)* V1
   ADR-0022's typed-claims-with-refusal gate is the explicit upgrade path **if** overlap conflicts
   become routine (the ADR-numbering collisions suggest they might), exactly as DBOS is
   deferred-but-named (ADR-0019). As authored it was not built: the board *shows* overlap; humans and
   sessions negotiate. Evidence for "routine" accrues in the board's own event history.

5. **The names.** `notice-board` = this story (presence/coordination — the legacy-lineage meaning).
   The cite/graduation story (ADR-0032's build vehicle) is renamed `feedback-graduation`. V1's
   forum≠noticeboard organ split (legacy ADR-0022 §Alternatives) is thereby restored in V2 naming.

## Consequences

- A new story `stories/notice-board` with five capabilities: `declare-presence` (core schema +
  pure logic), `presence-store` (pg event+projection), `noticeboard-cli`, `tree-view`,
  `ambient-integration`. The capability split follows REAL-build mechanics (ADR-0031): each
  near-term node's contracts are provable by one registered test file, so a signed PASS attests
  the whole node honestly. All greenfield `proposed`, built through the prove-it-gate.
- Two new tables (`events.session_event`, `events.session`) — additive DDL in
  `packages/store/src/schema.sql`.
- One new CLI area (`tree`) and one new command family (`noticeboard`); `library` dashboard grows
  one stat line.
- The board only works with the DB up; parallel-session bursts are exactly when it is. A solo
  offline session cannot declare — accepted, not engineered around.
- **Paid:** presence is advisory, so it can be ignored or go stale; the cost of a wrong board is
  bounded by the same merge-time reconciliation we already do. **Gained:** the ADR-0027/0032-class
  collision becomes *visible before work starts* instead of at merge time.

## What this does NOT decide

- The exact presence doc field set beyond the named shape (implementation detail for
  `declare-presence`).
- ~~Whether the statusline heartbeat ships in the first cut (an `ambient-integration` contract
  call).~~ Resolved — see "Owner decisions (2026-06-11)" below: it ships.
- Any messaging semantics (threads, replies, addressed delivery) — posts *for* other sessions stay
  on the existing comment substrate if ever needed; this ADR is presence-only.
- Claims (Decision 4): deferred at the time; since built for the build surface by
  [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) once conflicts
  proved routine.

## Owner decisions (2026-06-11)

The four open modeling calls in `stories/notice-board/story.md`, resolved by the owner:

1. **Staleness thresholds (story call 1).** Fixed named constants: **fresh < 1 hour**,
   **stale ≥ 1 hour**, **possibly-dead ≥ 4 hours** (`STALE_THRESHOLD_MS` /
   `POSSIBLY_DEAD_THRESHOLD_MS` in `packages/core/src/presence.ts`). Tunable later **only if
   needed** — no config surface now. Staleness stays **derived** — a pure function of `lastSeenAt`
   vs a caller-supplied `now` — never stored (no doc field, no column, anywhere).
2. **Statusline heartbeat (story call 2).** **Ships in the first `ambient-integration` cut**:
   rendering the statusline also bumps the session's `lastSeenAt`, debounced and fail-silent. The
   rationale is board credibility — a board that cries stale on live sessions teaches people to
   ignore it.
3. **Hook installation (story call 4).** The `SessionStart`/`SessionEnd` wrappers land **shared**
   in the repo's `.claude/settings.json` — every session gets them. The fail-silent contract
   (always exit 0, short timeout, silent when the DB is down) is what makes shared safe.
4. **`storytree tree` verdict detail (story call 3).** Option (b), as a **follow-up capability**
   (the built tree-view is not retrofitted): one glyph per node — ✓ proven / ✗ last run failed /
   – never built — read from `events.verdict` when the DB is up, silently absent offline. It
   applies to **both** story and capability rows, and a story row shows **only its own UAT node's
   verdict**, never a roll-up inferred from its children: "all capabilities pass" and "the story
   passed UAT" are different claims, and the glyph only ever reports a signed verdict.

## References

- Legacy `Agentic` ADR-0022 (cross-session coordination substrate — the three primitives, the
  forum/noticeboard organ split, the claims gate this ADR defers).
- [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) / [ADR-0017](0017-cross-cutting-knowledge-tier.md)
  (the shared store), [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (the deferred-but-named
  pattern), [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (why presence deliberately
  skips the signing posture proof requires), [ADR-0023](0023-library-cli-choose-your-own-adventure.md)
  (the CLI interaction pattern `tree`/`noticeboard` extend), [ADR-0030](0030-all-in-on-claude-agent-sdk.md)
  (the SDK runtime whose in-process hooks/spine-code make leaf-side automation hook-free),
  [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) (REAL-build mechanics shaping the
  capability split), [ADR-0032](0032-cite-graduation-mechanism.md) (the sibling feedback story).
- `packages/store/src/pg-comment-store.ts` *(now `packages/library/src/store/pg-comment-store.ts` —
  `packages/store` dissolved by ADR-0077)* (the event+projection pattern `presence-store` mirrors).
- Claude Code hook semantics (blocking exit-2 events; SessionStart/SessionEnd; statusline):
  code.claude.com/docs — verified 2026-06-11.
- Design conversation, 2026-06-10/11 (owner: presence over enforcement; "I exist and I'm working
  on xyz"; the V1 hook-loop experience).
