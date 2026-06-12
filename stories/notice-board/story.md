---
id: "notice-board"
tier: story
title: "The notice board — parallel sessions declare presence anchored to story nodes"
outcome: "Every session (interactive or spine-driven) is visible on a shared board — who exists, what worktree, what it is working on — woven into the CLI orientation surfaces so a session zoning into a story node sees its neighbours."
status: proposed
proof_mode: UAT
capabilities: [declare-presence, presence-store, noticeboard-cli, tree-view, ambient-integration, verdict-glyphs]
# Story-level edges: the "Cross-story boundary" section below, encoded (consumed seams, ADR-0010 §4).
depends_on: [library, drive-machinery]
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
promotion lands *code*, never *status*; the studio tree and `storytree tree`'s verdict glyphs
read proof from `events.verdict` when the DB is up).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`declare-presence`](declare-presence.md) | A session's presence declaration is a validated doc with derived staleness and pure upsert-merge semantics — fail-closed on any missing identity or substance field (`sessionId`, `branch`, `workingOn`). | proposed | — |
| 2 | [`presence-store`](presence-store.md) | Declarations persist through the store seam as append-only events plus a one-row-per-session projection, atomically. | proposed | `declare-presence` |
| 3 | [`noticeboard-cli`](noticeboard-cli.md) | `storytree noticeboard` lists active sessions grouped by story node with staleness; `declare`/`done` write with worktree-derived identity. | proposed | `declare-presence`, `presence-store` |
| 4 | [`tree-view`](tree-view.md) | `storytree tree [<story>]` renders the work hierarchy offline and weaves the presence block in when the live store is reachable. | proposed | `declare-presence`, `presence-store` |
| 5 | [`ambient-integration`](ambient-integration.md) | Presence declares itself: spine-side around SDK builds, fail-silent session hooks, a statusline glance — never via a blocking-capable hook. | proposed | `noticeboard-cli`, `tree-view` |
| 6 | [`verdict-glyphs`](verdict-glyphs.md) | `storytree tree` shows one signed-verdict glyph per node — ✓ proven / ✗ last run failed / – never built — read from `events.verdict` when the DB is up, silently absent offline. | proposed | `tree-view` |

## Dependency graph (designed; code at HEAD for 1–4)

These edges are the *designed* couplings; capabilities 1–4 now have real code at HEAD honouring
them (e.g. `noticeboard.ts` imports `@storytree/core` presence + the store seam type). A formal
re-derivation from real imports (the `library` story's standard) is pending work.

- `presence-store` → `declare-presence` — the store persists the core doc shape and reuses its
  pure merge/validation.
- `noticeboard-cli` → `declare-presence`, `presence-store` — the CLI derives identity, validates
  via core, reads/writes via the store.
- `tree-view` → `declare-presence`, `presence-store` — the presence block derives staleness via
  core and reads the projection.
- `ambient-integration` → `noticeboard-cli`, `tree-view` — automation invokes the CLI surfaces
  (hooks, statusline) and the spine declares through the same store path the CLI uses.
- `verdict-glyphs` → `tree-view` — the glyph column annotates the rows the tree view renders;
  after promotion the spine wires `treeCommand` to pass each row's unit id through `glyphFor`.

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
