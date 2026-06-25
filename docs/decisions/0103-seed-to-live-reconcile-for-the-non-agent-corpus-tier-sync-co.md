---
status: accepted
load_bearing: true
decided: 2026-06-25
amends: [95, 23, 55]
---
# ADR-0103: Seed-to-live reconcile for the non-agent corpus tier (sync-corpus)

## Status

accepted (2026-06-25) — decided and built in one session to close a graduation-flow gap first hit
the same day. The shape was not an open fork: it is the direct generalisation of the already-accepted
seed-canonical `sync-agents` (ADR-0055) to the non-agent tier, and its conflict policy is *forced* by
the already-accepted live-canonical model (ADR-0023). No owner-level call was needed (a reversible,
internal mechanism whose shape accepted ADRs already settle), so it is flipped green at authorship
under [ADR-0084](0084-agents-may-flip-an-adr-green.md); the catch is observability — the new
`check:corpus-sync` gate makes the drift it addresses self-surfacing.

## Context

The Library's knowledge tier has two opposite canonicality rules:

- **The `agent` kind is SEED-canonical** (ADR-0055): agents are authored in
  `apps/studio/data/knowledge.json` and rendered offline, so the seed is the edit surface and
  `sync-agents` mirrors the seed *down* to the live store (upsert all, delete seed-absent).
- **Every OTHER kind is LIVE-canonical** (ADR-0023): the shared Cloud SQL store is the edit surface
  (`artifact edit <id> --pg`), and `knowledge.json` is a migration seed / lagging export — *not* the
  edit-here surface. This is what lets parallel sessions iterate on different artifacts without file
  conflicts.

ADR-0095 (agent-memory graduates into the Library) cuts across that split. When a durable lesson is
graduated out of agent-memory, the new principle / definition is written into the **seed**, because
the offline agent renderer (`build:claude` / `build:agents`, ADR-0051/0052) reads the seed and a
freshly-graduated principle must be citable by agents immediately. But for a **non-agent** kind that
leaves the artifact **seed-only**, with no surface that carries it across to the live tier:

- `storytree library artifact <id> --pg` → "no artifact in the Library".
- `storytree library artifact edit <id> --pg` → nothing to act on.
- Worse, any agent that **cites** the seed-only principle renders a `> MISSING REF` when assembled
  against the **live** store (`storytree agents <name> --pg`) and in the studio (live-backed by
  default) — a silently-degraded prompt.

`load-corpus.ts` exists but is the wrong tool: `--force` upserts the WHOLE seed over live, reverting
every live-canonical `artifact edit --pg` change — the exact harm the live-canonical model forbids.
First hit 2026-06-25 reconciling `real-test-must-not-leak-a-handle` after the spine-timeout fix
(PRs #350/#351): the correction had to land in the seed (the only extant copy + the agent
read-surface), leaving it seed-only with no clean path into live.

## Decision

Add a deliberate seed→live reconcile for the non-agent tier, parallel to `sync-agents` but with the
**inverse, migrate-only** conflict policy that live-canonical demands:

1. **`storytree library sync-corpus --pg`** (`reconcileCorpus` / `syncSeedCorpus` in
   `@storytree/library/store`) — carry every seed artifact of a non-`agent` kind that is **ABSENT**
   from the live store across into it, and **leave the rest untouched**:
   - **Upsert-if-absent, never overwrite.** A seed artifact already present live is skipped — its live
     row may carry `artifact edit --pg` edits the seed has not caught up to. (Contrast `sync-agents`,
     which overwrites, because there the seed is canonical.)
   - **Never delete.** A live artifact absent from the seed is a live-canonical *creation* (the normal
     case — most artifacts are born via `artifact new --pg`), not stale drift. (Contrast `sync-agents`,
     which deletes seed-absent agents.)
   - Idempotent: the first run carries seed-only graduates across; a second run finds them present and
     creates nothing. `agent`-kind is out of scope (it keeps its own `sync-agents`).
2. **`check:corpus-sync`** — a best-effort, WARN-only gate step (mirroring `check:agents-sync`):
   reachable DB + a seed non-agent artifact missing from live → WARN naming the fix; all present → OK;
   no DB / no creds → SKIP. It is **one-directional** by design — it flags only the migration gap
   (seed artifact missing from live), never live-only artifacts or content drift, both of which are
   *expected* under live-canonical. Local-only (CI's verify job is DB-free); always exits 0.

The graduation ceremony for a non-agent kind therefore gains one explicit step: after the seed edit,
`pnpm storytree library sync-corpus --pg` (DB up) carries it into the live tier; `check:corpus-sync`
nags if it is forgotten.

## Consequences

- **Good — the gap is closed without a clobber risk.** A graduated principle becomes visible to
  `--pg`, editable via `artifact edit --pg`, and renders clean for every agent that cites it. Because
  the policy only ever touches artifacts *absent* from live, it can never revert a live-canonical edit
  the way `load-corpus --force` does.
- **Good — drift is self-surfacing.** `check:corpus-sync` turns a silent seed-only artifact into a
  visible WARN at the local gate, the same safety net `sync-agents` got in ADR-0055.
- **Bound — id-presence, not content.** The command and check reconcile by id only; once an artifact
  is live it becomes live-canonical and the seed copy is a lagging export (expected, not flagged). A
  *re-correction* of an already-migrated artifact still belongs on the live edit surface
  (`artifact edit --pg`), not a second seed edit — `sync-corpus` deliberately will not push seed
  content over a present live row. A seed↔live content-diff view, if ever wanted, is later work.
- **Bound — agent-tier unchanged.** `sync-corpus` excludes `agent`; the two syncs are complementary
  and never fight over the same rows.

## References

- [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md) — the graduation flow
  whose seed-only landing this closes for non-agent kinds.
- [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) — the
  seed-canonical `sync-agents` this parallels with the inverse policy.
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the live-canonical
  default that forces the migrate-only conflict policy.
- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — the green-flip authority used here.
- Code: `packages/library/src/store/sync-corpus.ts` (+ `.test.ts`), `packages/cli/src/commands.ts`
  (`syncCorpusCommand`), `packages/cli/src/check-corpus-sync.ts`.
