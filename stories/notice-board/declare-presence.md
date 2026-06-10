---
id: "declare-presence"
tier: capability
story: notice-board
title: "A presence declaration is a validated doc; staleness derived, merge pure"
outcome: "A session's presence declaration is a validated doc with derived staleness and pure upsert-merge semantics — fail-closed on any missing identity or substance field (sessionId, branch, workingOn)."
status: proposed
proof_mode: integration-test
depends_on: []
---

# A presence declaration is a validated doc; staleness derived, merge pure

**Outcome —** A session's presence declaration is a validated doc with derived staleness and pure
upsert-merge semantics — fail-closed on any missing identity or substance field (`sessionId`,
`branch`, `workingOn`).

> **Proof status (honest) — `proposed`, greenfield.** Nothing exists: no schema, no module, no
> tests. Every "proven by" below is a would-be test. ADR-0033 Decision 1 fixes the design: one declaration
> doc per session — `{ sessionId, branch, workingOn, nodes, status, startedAt, lastSeenAt }` —
> identity is the worktree name (derived, never typed), **no signer chain** (presence is not
> proof), and staleness replaces release discipline.

## Guidance

This is the story's root: the zod-validated declaration doc plus the **pure** logic every other
capability reuses — validation, staleness classification, upsert-merge. It lives in
`@storytree/core` (would-be `packages/core/src/presence.ts`) and does **no I/O**: no store, no
clock reads (callers pass `now`), no worktree probing — identity *derivation* belongs to the CLI
node; this node only refuses docs that arrive without it.

- **The full doc shape (ADR-0033 Decision 1) — every field below must exist in the schema:**
  `sessionId` (worktree name, the identity key), `branch`, `workingOn` (required prose), `nodes`
  (work-hierarchy id strings, defaults to `[]` — what the board groups by), `status`
  (`"active" | "done"`, defaults `"active"`), `startedAt` (set once at first declare, preserved by
  every merge), `lastSeenAt` (bumped by the store on upsert). Unknown/stored-staleness fields are
  rejected, not stripped silently.
- **Fail-closed on attribution and substance, without signing:** a blank `sessionId`, `branch`, or
  `workingOn` is a refusal, not a default — an unattributable or silent "I exist" is worthless to
  the board. That is the whole gate; per ADR-0033 Decision 1 the verdict-grade signer chain (ADR-0020)
  deliberately does not apply.
- **Staleness is derived, never stored:** fresh/stale/possibly-dead is a pure function of
  `lastSeenAt` vs a caller-supplied `now` — no doc field, no table column, anywhere (the cite/health
  "derived, never stored" posture). The band threshold is a named constant pending the story's
  open owner call 1.
- **Merge is the upsert's brain:** `mergeDeclaration(existing, patch)` follows the exact
  `mergeCommentPatch` pattern (`packages/store/src/pg-comment-store.ts`) — the store applies it
  inside its transaction; the semantics are provable here without one. `sessionId` and `startedAt`
  are the two anchors a patch can never move; `nodes`/`status`/`workingOn`/`branch`/`lastSeenAt`
  patch normally (undefined ignored).
- **REAL-build target (ADR-0031):** ONE test file proves all three contracts, so a signed PASS
  attests the node. Its registry entry will carry `real.install: true` — the impl imports `zod`,
  so the build worktree needs the lockfile-only install step.

## Integration test (would-be)

**Goal —** The doc schema and the pure functions hold their fail-closed, derived, and
merge-stability promises with no store and no clock — every assertion runs offline.

Parse a valid declaration and refuse missing/blank required fields; classify the same doc as
fresh, stale, and possibly-dead purely by moving `now`; merge patch sequences and assert identity
and origin survive while activity advances.

## Contracts (3)

1. **`presence-doc-fail-closed`** — an unattributable or silent declaration is refused
   - **asserts —** parsing a doc with a missing or whitespace-only `workingOn`, `sessionId`, or
     `branch` throws; nothing is defaulted; a fully-specified doc parses and round-trips.
   - **proven by —** would-be `packages/core/src/presence.test.ts`
2. **`staleness-is-derived`** — freshness is a pure function of `lastSeenAt` vs `now`
   - **asserts —** the classifier returns fresh/stale/possibly-dead bands from `lastSeenAt` and a
     passed `now` alone; the doc schema rejects any stored staleness field; identical inputs give
     identical bands (no hidden clock).
   - **proven by —** would-be `packages/core/src/presence.test.ts`
3. **`declaration-upsert-merge`** — `mergeDeclaration(existing, patch)` is pure and stable
   - **asserts —** `sessionId` is never patched, `startedAt` survives any overwrite, `lastSeenAt`
     bumps on merge, `undefined` patch fields leave existing values untouched, and inputs are not
     mutated (the `mergeCommentPatch` pattern, `packages/store/src/pg-comment-store.ts`).
   - **proven by —** would-be `packages/core/src/presence.test.ts`
