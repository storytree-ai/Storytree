---
status: proposed
decided: 2026-06-14
amends: [23]
---
# ADR-0055: The Library agent tier is seed-canonical; sync-agents reconciles it to the live store

## Status

proposed (2026-06-14) — owner steer in conversation: after a one-off reconciliation of the live
`agent` tier to the seed, *"add a reusable safeguard so this can't silently drift again."* Closes the
open item [ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md) flagged ("the
seed↔live reconciliation are owner-held"). **Amends** [ADR-0023](0023-library-cli-choose-your-own-adventure.md):
it carves out the `agent` kind as the one exception to "the live store is the edit surface"; every
other kind stays live-canonical, so ADR-0023 stands.

## Context

[ADR-0017](0017-cross-cutting-knowledge-tier.md) / [ADR-0023](0023-library-cli-choose-your-own-adventure.md)
made the shared Cloud SQL store the source of truth for artifact **state**, edited live via
`storytree library artifact edit … --pg`. The **agent tier is different**:
[ADR-0051](0051-agent-renderer-shapes-claude-md.md) and
[ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) made agents an
**authored-in-the-seed, rendered-offline** asset — `storytree agents <name>`, the generated CLAUDE.md
operating-discipline region, and the `.claude/agents/*.md` subagent files all assemble from the seed
(`apps/studio/data/knowledge.json`) with NO database. So for agents the **seed is canonical** and the
live store is a *projection* of it.

That projection has no automatic refresh, and it drifted — twice:

- **PR #117** reshaped the agent tier in the seed (8 drafts → role-shaped units); the live store kept
  the old ids.
- **ADR-0051/0052** renamed and extended the set (`leaf-test-author`→`red-builder`,
  `leaf-implementer`→`green-builder`, plus `session-orchestrator`); again seed-only.

Each time, the live tier silently held stale/missing agents, breaking `storytree agents --pg` and the
studio (which read the live store) while offline builds — reading the seed — looked fine. The fixes
were **bespoke throwaway scripts**, so the next seed edit re-introduced the drift. There was no
reusable, tested "sync the agent tier to the seed" operation, and a gate/CI drift check is impossible
here: the offline gate (`pnpm -r typecheck && pnpm -r test`) runs with **no DB**, so it cannot compare
the live tier against the seed.

## Decision

**Affirm the agent tier as seed-canonical, and add a reusable, idempotent reconciler** that makes the
live agent tier equal the seed on demand.

1. **`reconcileAgents(source, target)`** (`packages/store/src/sync-agents.ts`): upsert every `source`
   agent into `target`, then delete every `target` agent whose id is absent from `source`. It touches
   **`kind === "agent"` only** — docs of any other kind in either store are never read or written.
   Idempotent; writes validate at the target's boundary (a malformed seed agent fails loud).
   `syncSeedAgents(target)` is the convenience that loads the seed corpus (via `loadCorpus`) into a
   throwaway in-memory store and reconciles `target` to it.
2. **`storytree library sync-agents --pg`** (`packages/cli/src/commands.ts`): runs `syncSeedAgents`
   against the live store, printing before/upserted/deleted/after id lists and an `IN SYNC` assertion
   (`ok: false` if the tier does not equal the seed afterwards). Needs `--pg` — a sync against the
   ephemeral offline store is a no-op (it IS the seed), so offline it returns the standard
   write-surface guidance.
3. **Operational rule (until a DB→seed export exists):** after any agent-tier seed edit, run
   `pnpm db:up && pnpm storytree library sync-agents --pg`. This is the agent-tier inverse of the
   usual live-is-the-edit-surface flow, and the only kind for which the seed→live direction applies.

## Consequences

- **Drift is recoverable in one tested command**, not a hand-written script — and the reconciliation
  is covered offline (`sync-agents.test.ts`, `cli.test.ts`) with no DB, so it can't rot.
- **Scope is fenced to agents.** Other kinds remain live-canonical; `sync-agents` will never clobber a
  live `principle`/`pattern`/`open-question` edit, because it only reads and writes `kind: "agent"`.
- **Still manual.** Nothing forces the sync after a seed edit — the offline gate has no DB to check
  against, so prevention stays a discipline (this ADR + the CLAUDE.md note), not a gate. A genuinely
  automatic close would need either a DB→seed export (then the seed is generated and never hand-edited)
  or making the live store the agent edit surface; both are larger and named as later work.
- **A re-sync re-stamps all agents** (one `library_event` per agent, `updated_at` bumped) even when
  content is unchanged — a harmless, idempotent audit cost, acceptable for an occasional operation.

## References

- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the Library CLI / live-store-is-the-edit-surface
  stance (amended here for the agent kind).
- [ADR-0017](0017-cross-cutting-knowledge-tier.md) — the live Library tier as the source of artifact state.
- [ADR-0051](0051-agent-renderer-shapes-claude-md.md) / [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md)
  — agents authored in the seed and rendered offline (why the tier is seed-canonical).
- [ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md) — flagged the seed↔live agent-tier
  reconciliation as owner-held; this ADR closes it.
- Code: `packages/store/src/sync-agents.ts` (`reconcileAgents` / `syncSeedAgents`),
  `packages/cli/src/commands.ts` (`syncAgentsCommand`), `packages/store/src/load-corpus.ts` (the seed loader).
