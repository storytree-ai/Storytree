---
id: "notice-board"
tier: story
title: "The notice board — parallel sessions declare presence anchored to story nodes"
outcome: "Every session (interactive or spine-driven) is visible on a shared board — who exists, what worktree, what it is working on — woven into the CLI orientation surfaces so a session zoning into a story node sees its neighbours."
status: proposed
proof_mode: UAT
capabilities: [declare-presence, presence-store, noticeboard-cli, tree-view, ambient-integration, verdict-glyphs]
# Story-level edges: the "Cross-story boundary" section below, encoded (consumed seams, ADR-0010 §4).
# ADR-0077 U2: the notice-board now owns its Postgres presence drawer behind ./store (the PgPresenceStore
# + merge-retire backstop moved in from the dissolving @storytree/store), so it deps @storytree/library
# (createPool/closePool via @storytree/library/store) ONLY — it rolls its OWN duck-typed pool/Store seam
# (PgPresenceStore), not the @storytree/storage-protocol port (ADR-0078 phantom-dep cleanup).
# The drive extraction (ADR-0112 — the build/orchestrate drivers carved out of cli into
# @storytree/drive) gave the drive a REAL code edge ON this organism: ambient-presence + the
# noticeboard surface + PgPresenceStore moved into @storytree/drive, which now imports
# @storytree/notice-board. So the genuine direction is `drive-machinery -> notice-board` (declared in
# stories/drive-machinery/story.md depends_on). Run the ADR-0058 test the other way and it fails:
# notice-board does NOT need the drive's delivered outcome to pass its OWN UAT — @storytree/notice-board
# imports @storytree/library ONLY (verified: package deps + source; the schema + classifyPresence are
# pure, the Pg drawer rides @storytree/library/store), and UAT step 5 ("spine presence") is the DRIVE
# calling this board's surface, i.e. drive consuming notice-board, never the reverse. The old narrative
# `depends_on: drive-machinery` here was therefore UNBACKED by any code edge and, paired with the new
# real reverse edge, formed a forbidden cross-story cycle (ADR-0058); dropped — the cheapest rung of the
# no-cycle ladder (remove the spurious edge, no structural change). The node-spec + verdict-log reads the
# "Cross-story boundary" section below describes are done by CLI-resident code (tree.ts / tree-verdicts.ts
# in packages/cli), declared on the cli/drive organisms — NOT by @storytree/notice-board itself.
depends_on: [library]
# Provider-side inbound edge (ADR-0074 §4): the cli HUB organism imports @storytree/notice-board
# (noticeboard.ts staleness bands, the `storytree noticeboard` surface). The store hub also imports
# it, declared consumer-side in stories/store/story.md depends_on; the cli edge is declared here to
# de-noise the hub.
consumed_by: [cli]
decisions: [33] # deciding ADR (ADR-0037 §2)
---

# The notice board — parallel sessions declare presence anchored to story nodes

**Outcome —** Every session (interactive or spine-driven) is visible on a shared board — who
exists, what worktree, what it is working on — woven into the CLI orientation surfaces so a
session zoning into a story node sees its neighbours.

This is the **coordination** organ ([ADR-0033](../../docs/decisions/0033-session-presence-notice-board.md),
the deciding ADR; legacy lineage: V1 `Agentic` ADR-0022's channel — deliberately *minus* its claims
gate). It is the V2 answer to "sessions can't see across worktrees": the shared Cloud SQL store
already carries cross-session state; what is missing is purely the presence surface. The sibling
**feedback** organ (cites, archival, synthesis) is [`stories/feedback-graduation`](../feedback-graduation/story.md)
(ADR-0032) — this story carries the `notice-board` name because presence *is* what the notice
board always meant to the owner: "a simple declaration of *I exist and I'm working on xyz*".

**Greenfield, through the drive.** Authored first, built through the prove-it-gate
(`node build`/`story build`, ADR-0030/0031) — all six capabilities have now been driven
through it (signed passes, promoted to `main`). Registry entries are NOT
pre-created — registration is the deliberate act done per node when its build is actually next.
The capability split deliberately follows REAL-build mechanics (ADR-0031): each node's registered
proof is ONE test file that runs OFFLINE in the build worktree, so a signed PASS honestly attests
what it ran. Where live SQL is inherent (`presence-store`; `ambient-integration`'s DB-up legs),
the registered file proves the offline portion (pure helpers, a fake transactional client, config
audits) and the live behaviour follows the house live-gated, human-verified pattern — never
attested by a worktree PASS.

## Design floor (from ADR-0033)

- **Presence, not enforcement.** One declaration doc per session, upserted over append-only
  history (`events.session_event` + `events.session`, the house event+projection pattern). The
  board *shows* overlap; nothing refuses anything. Claims-with-refusal (legacy ADR-0022) is
  named-deferred, like DBOS.
- **Identity is the worktree name** — derived, never typed; **no signer chain** (presence is not
  proof; ADR-0020's fail-closed signing posture deliberately does not apply).
- **`workingOn` is required prose; `nodes` is optional work-hierarchy ids.** Granularity grows by
  declaring finer node ids — no schema change.
- **Staleness replaces release discipline.** The board ages rows by `lastSeenAt`; `done` is
  politeness. No release ceremony.
- **Automation never blocks.** The board never touches a blocking-capable hook (`Stop`,
  `PreToolUse`, `UserPromptSubmit`); a board write failure never fails the enclosing action. The
  V1 hook-loop lesson, encoded structurally.
- **Live-DB only, degrade gracefully.** Presence needs `pnpm db:up`; offline surfaces render
  without presence lines rather than failing.

## Capabilities (6)

Listed roots-first. All six capabilities are **PROVEN and PROMOTED** (gated-leaf builds, signed
passes in `events.verdict`, promoted to `main`; 5 and 6 landed 2026-06-13 — PRs #73/#75). The
authored status stays `proposed` forever (ADR-0031: health is a projection of signed verdicts —
promotion lands *code*, never *status*; the studio tree's proof hues (ADR-0040) and
`storytree tree`'s verdict glyphs read proof from `events.verdict` when the DB is up).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`declare-presence`](declare-presence.md) | A session's presence declaration is a validated doc with derived staleness and pure upsert-merge semantics — fail-closed on any missing identity or substance field (`sessionId`, `branch`, `workingOn`). | proposed | — |
| 2 | [`presence-store`](presence-store.md) | Declarations persist through the store seam as append-only events plus a one-row-per-session projection, atomically. | proposed | `declare-presence` |
| 3 | [`noticeboard-cli`](noticeboard-cli.md) | `storytree noticeboard` lists active sessions grouped by story node with staleness; `declare`/`done` write with worktree-derived identity. | proposed | `declare-presence`, `presence-store` |
| 4 | [`tree-view`](tree-view.md) | `storytree tree [<story>]` renders the work hierarchy offline and weaves the presence block in when the live store is reachable. | proposed | `declare-presence`, `presence-store` |
| 5 | [`ambient-integration`](ambient-integration.md) | Presence declares itself: spine-side around SDK builds, fail-silent session hooks, a statusline glance — never via a blocking-capable hook. | proposed | `noticeboard-cli`, `tree-view` |
| 6 | [`verdict-glyphs`](verdict-glyphs.md) | `storytree tree` shows one signed-verdict glyph per node — ✓ proven / ✗ last run failed / – never built — read from `events.verdict` when the DB is up, silently absent offline. | proposed | `tree-view` |

## Dependency graph (code-derived)

These are **within-story** edges **read off the real source** at HEAD (the imports and the
injection seams between the six capabilities' modules), never hand-drawn from UAT need
(ADR-0010 §3) — the `library` story's standard, applied as the formal re-derivation the earlier
*designed* graph promised (2026-06-13). Two grains show up honestly: a **module-grain import**
(A's file imports B's exports) and an **injection-grain coupling** (A consumes B only through a
structural seam closed at the CLI entry — the deliberate offline-testability wall, so the edge
exists at wiring time, never at module load). The graph is acyclic; `declare-presence` is the
lone import root (`packages/core/src/presence.ts:1` imports only `zod`).

- `presence-store` → `declare-presence`
  - `packages/store/src/presence-store.ts:1-2` imports `type PresenceDeclarationDoc` +
    `mergeDeclaration` from `@storytree/core`; `declare` merges an existing row via
    `mergeDeclaration` (`presence-store.ts:85`) — the upsert-merge semantics are consumed,
    never reimplemented.
- `noticeboard-cli` → `declare-presence`
  - `packages/drive/src/noticeboard.ts:10-11` imports `type PresenceDeclarationDoc` +
    `classifyPresence`; the board's staleness bands call `classifyPresence`
    (`noticeboard.ts:116`) and `declare` constructs the typed doc (`noticeboard.ts:213`).
- `noticeboard-cli` → `presence-store` *(injection grain)*
  - `noticeboard.ts` deliberately never imports `@storytree/store` (`noticeboard.ts:6` — the
    seam keeps the module offline-testable); it OWNS the structural seam `PresenceStoreLike`
    (`noticeboard.ts:19-26`) that `PgPresenceStore` satisfies. The edge closes at the entry:
    `main.ts:11`/`:38` constructs the store on the shared pool and the dispatch injects it
    (`commands.ts:785`).
- `tree-view` → `declare-presence`
  - `packages/drive/src/tree.ts:13` (the module's home since the ADR-0112 relocation; `packages/cli/src/tree.ts` is a re-export shim) imports `classifyPresence`, called for the presence-block
    bands (`tree.ts:232`) — thresholds never recomputed.
- `tree-view` → `noticeboard-cli`
  - an edge the designed graph MISSED: `tree.ts:16` imports `type PresenceStoreLike` from
    `./noticeboard.js` — the presence seam type is owned by the noticeboard module and consumed
    type-only.
- `tree-view` → `presence-store` *(injection grain)*
  - no store import anywhere in `tree.ts`; the projection is read through the injected
    `PresenceStoreLike` (`main.ts:38` → the tree dispatch, `commands.ts:797`).
- `tree-view` → `verdict-glyphs`
  - the wired glyph column: `tree.ts:18` imports `glyphFor`/`readVerdictGlyphs`/
    `type VerdictReaderLike` from `./tree-verdicts.js` and passes every row's unit id through
    `glyphFor` (`tree.ts:92`). NOTE the direction: at the code grain the VIEW consumes the glyph
    module; `verdict-glyphs`' authored `depends_on: [tree-view]` records the design/build-order
    dependency (the follow-up annotates this view) — both facts hold, and there is no cycle:
    `tree-verdicts.ts` imports nothing from `tree.ts`.
- `ambient-integration` → `declare-presence`
  - `packages/drive/src/ambient-presence.ts:10` imports `type PresenceDeclarationDoc`; the build
    wrapper constructs the typed doc (`ambient-presence.ts:57`).
- `ambient-integration` → `noticeboard-cli`
  - `ambient-presence.ts:12` imports `type PresenceStoreLike` + `type SessionIdentity` (types
    only — the module header states the wall), and the hook/statusline entry derives identity
    through the real `deriveIdentity` (`ambient-presence-entry.ts:9`).
- `ambient-integration` → `presence-store`
  - the entry LAZY-imports the store package and constructs `PgPresenceStore` itself, race-boxed
    and fail-silent (`ambient-presence-entry.ts:54-57`) — a direct code edge the designed graph
    only implied ("the same store path the CLI uses").
- `verdict-glyphs` — no outbound within-story import
  - `packages/drive/src/tree-verdicts.ts:11` (home since the ADR-0112 relocation; the cli path
    is a re-export shim) imports only `SIGNING_EVENT_KIND` + `Verdict` from
    `@storytree/proof-protocol` — the verdict vocabulary port (cross-story, declared below);
    its reader is the structural `VerdictReaderLike` slice of `PgWorkStore`, closed at
    `main.ts:12`/`:41`. Within the story it is a second code-grain root; its authored
    `depends_on: [tree-view]` is the build-order/design edge realized by the reverse import
    (see `tree-view` → `verdict-glyphs` above).

The one designed edge with NO code backing: `ambient-integration` → `tree-view` — nothing in
`ambient-presence.ts`/`ambient-presence-entry.ts` imports `tree.ts` (the statusline glance
renders its own line; it never invokes the tree). It stays a design-intent note in the
capability files only, dropped from the code-derived graph.

**Cross-story boundary (ADR-0010 §4):** `presence-store` consumes the **store connection seam**
owned by the `library` story (`event-sourced-store-seam` — `createPool`/keyless IAM); `tree-view`
reads the **node-spec/registry surface** owned by the drive machinery (`findNodeSpecFile`/
`NODE_BUILD_REGISTRY` in `packages/orchestrator`); `verdict-glyphs` reads the **verdict event
log** owned by the drive machinery (`work-verdict-event-log` — the `PgWorkStore.readEvents`
merged stream over `events.verdict`, with `Verdict`/`SIGNING_EVENT_KIND` from
`@storytree/core`). Declared, not absorbed.

## Story UAT (would-be)

**Goal —** Two parallel sessions and one operator: each session sees the other before writing,
a dead session ages out visibly, spine builds appear without anyone declaring them, and offline
nothing breaks.

1. **Declare:** session A (worktree `alpha-…`) runs
   `storytree noticeboard declare --working-on "building cite-event" --node feedback-graduation --pg`.
   **Success —** the board lists A with its branch, prose and node; identity was derived from the
   worktree, never typed; `events.session_event` holds one event, `events.session` one row.
2. **See the neighbour:** session B runs `storytree tree feedback-graduation --pg`. **Success —**
   the story view weaves in "sessions here: alpha-… — 'building cite-event', last seen <1m".
3. **Re-declare finer:** A re-declares with `--node cite-event`. **Success —** still one
   projection row (upsert), two history events, the board shows the finer node.
4. **Staleness:** A goes silent past the threshold. **Success —** the board renders A dimmed/stale
   by derived age; nothing was released or deleted.
5. **Spine presence:** a `storytree node build <id> --real --store pg` run declares itself around
   the leaf and marks done after. **Success —** the build appeared on the board mid-run with the
   node id, and dropped to `done` after — with no hook involved.
6. **Done + history:** A runs `storytree noticeboard done`. **Success —** A leaves the active
   board; its full event history remains readable.
7. **Offline degrade:** with the DB down, `storytree tree feedback-graduation` renders the
   hierarchy with no presence lines and no error; `noticeboard declare` refuses with guidance
   (`pnpm db:up`), exit non-zero, **without** failing any enclosing hook (fire-and-forget wrapper
   swallows it).

## Open modeling calls (for the owner)

All four RESOLVED by the owner 2026-06-11 — recorded in ADR-0033 "Owner decisions (2026-06-11)".

1. **RESOLVED (owner, 2026-06-11) — staleness threshold.** Fixed named constants: fresh < 1 hour,
   stale ≥ 1 hour, possibly-dead ≥ 4 hours (`STALE_THRESHOLD_MS` / `POSSIBLY_DEAD_THRESHOLD_MS` in
   `packages/core/src/presence.ts`), tunable later only if needed. Staleness stays derived — a
   pure function of `lastSeenAt` vs a caller-supplied `now` — never stored.
2. **RESOLVED (owner, 2026-06-11) — statusline heartbeat.** SHIPS in the first
   `ambient-integration` cut: rendering the statusline also bumps the session's `lastSeenAt`,
   debounced and fail-silent — a board that cries stale on live sessions teaches people to ignore
   it.
3. **RESOLVED (owner, 2026-06-11) — `storytree tree` verdict detail.** Option (b) as a FOLLOW-UP
   capability (the built tree-view is not retrofitted): one glyph per node (✓ proven / ✗ last run
   failed / – never built) read from `events.verdict` when the DB is up, silently absent offline.
   Applies to both story and capability rows; a story row shows ONLY its own UAT node's verdict,
   never a roll-up inferred from its children — "all capabilities pass" and "the story passed UAT"
   are different claims, and the glyph only ever reports a signed verdict. Now authored as
   [`verdict-glyphs`](verdict-glyphs.md).
4. **RESOLVED (owner, 2026-06-11) — hook installation.** The `SessionStart`/`SessionEnd` wrappers
   land SHARED in the repo's `.claude/settings.json` — every session gets them. The fail-silent
   contract (always exit 0, short timeout, silent when the DB is down) is what makes shared safe.
