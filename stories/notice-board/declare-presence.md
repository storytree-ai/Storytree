---
id: "declare-presence"
tier: capability
story: notice-board
title: "A presence declaration is a validated doc; staleness derived, merge pure"
outcome: "A session's presence declaration is a validated doc with derived staleness and pure upsert-merge semantics — fail-closed on any missing identity or substance field (sessionId, branch, workingOn)."
status: retired
proof_mode: integration-test
depends_on: []
# RETIRED by ADR-0200 (2026-07-16), with the self-reported presence layer of the notice-board story.
# The noticeboard is now the CLAIM LEDGER (`events.node_claim` + `claim_event`): the presence
# declaration doc (`events.session`), its derived staleness bands, and the possibly-dead reaper are
# retired — presence rows are not written at all (ADR-0200 D1, generalising ADR-0199). The `real:` arm
# is DROPPED so this node no longer registers `packages/notice-board/src/presence.test.ts` /
# `presence.ts` as its REAL proof — that registration was exactly what blocked the presence-core
# deletion branch (`presence.ts` + `presence-store.ts` + `reaper.ts` are deleted in the arc's final
# increment, gated on the owner's appearance-UAT attestation, ADR-0200 D7). buildableNodeIds keys on
# proof.real (packages/drive/src/node-build.ts), so dropping `real:` removes this node from the
# REAL-buildable set (the same retirement convention as chat-drive-bridge's caps / glue-worker-spawn).
# proof.command + proof.scope are kept as history (the node stays visible, never REAL-buildable). The
# body below is kept as history.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/notice-board", "test"]
  scope:
    testGlobs: ["packages/notice-board/src/**/*.test.ts"]
    sourceGlobs: ["packages/notice-board/src/**/*.ts"]
---

# A presence declaration is a validated doc; staleness derived, merge pure

> **RETIRED by ADR-0200 (2026-07-16).** The self-reported presence declaration doc (`events.session`)
> is retired — the deterministic **claim ledger** (`events.node_claim` + `claim_event`, three grades
> exploring / waiting / work) is the notice board's coordination record now (see
> [`../wisp-as-story-claim/claim-store-work-time`](../wisp-as-story-claim/claim-store-work-time.md) for
> the pure claim doc + store). The `real:` arm was dropped on retirement; the presence core
> (`presence.ts` and its test) is deleted in the arc's final increment. The body below is kept as
> history of what presence WAS.

**Outcome —** A session's presence declaration is a validated doc with derived staleness and pure
upsert-merge semantics — fail-closed on any missing identity or substance field (`sessionId`,
`branch`, `workingOn`).

> **Proof status (honest) — since PROVEN and PROMOTED (ADR-0031).** The gated leaf authored
> `packages/core/src/presence.ts` + its test in a fresh worktree; the spine observed the real
> red→green and signed a PASS (run `real-mq8lp5r5`, commit `c958a34`, persisted to
> `events.verdict`), merged via PR #37 — the second run, after the first (`real-mq8lhxlp`)
> exposed the tsx type-strip hole and bought the typecheck wall (ADR-0031 §2). The authored
> status stays `proposed` forever: `healthy` is only ever derived from signed verdicts
> (ADR-0020). ADR-0033 Decision 1 fixes the design: one declaration doc per session —
> `{ sessionId, branch, workingOn, nodes, status, startedAt, lastSeenAt }` — identity is the
> worktree name (derived, never typed), **no signer chain** (presence is not proof), and
> staleness replaces release discipline.

## Guidance

This is the story's root: the zod-validated declaration doc plus the **pure** logic every other
capability reuses — validation, staleness classification, upsert-merge. It lives in
`@storytree/notice-board` (`packages/notice-board/src/presence.ts`) and does **no I/O**: no store, no
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
  "derived, never stored" posture). The band thresholds are fixed named constants (owner call 1,
  resolved 2026-06-11 — ADR-0033 Owner decisions): fresh < 1 hour, stale ≥ 1 hour, possibly-dead
  ≥ 4 hours, tunable later only if needed.
- **Merge is the upsert's brain:** `mergeDeclaration(existing, patch)` follows the exact
  `mergeCommentPatch` pattern (`packages/store/src/pg-comment-store.ts`) — the store applies it
  inside its transaction; the semantics are provable here without one. `sessionId` and `startedAt`
  are the two anchors a patch can never move; `nodes`/`status`/`workingOn`/`branch`/`lastSeenAt`
  patch normally (undefined ignored).
- **REAL-build target (ADR-0031):** ONE test file proves all three contracts, so a signed PASS
  attests the node. Its registry entry carries `real.install: true` — the impl imports `zod`,
  so the build worktree needs the lockfile-only install step.

## Integration test

**Goal —** The doc schema and the pure functions hold their fail-closed, derived, and
merge-stability promises with no store and no clock — every assertion runs offline.

Parse a valid declaration and refuse missing/blank required fields; classify the same doc as
fresh, stale, and possibly-dead purely by moving `now`; merge patch sequences and assert identity
and origin survive while activity advances.

## Contracts (3)

1. **`presence-doc-fail-closed`** — an unattributable or silent declaration is refused
   - **asserts —** parsing a doc with a missing or whitespace-only `workingOn`, `sessionId`, or
     `branch` throws; nothing is defaulted; a fully-specified doc parses and round-trips.
   - **proven by —** `packages/notice-board/src/presence.test.ts` (real at HEAD)
2. **`staleness-is-derived`** — freshness is a pure function of `lastSeenAt` vs `now`
   - **asserts —** the classifier returns fresh/stale/possibly-dead bands from `lastSeenAt` and a
     passed `now` alone; the doc schema rejects any stored staleness field; identical inputs give
     identical bands (no hidden clock).
   - **proven by —** `packages/notice-board/src/presence.test.ts` (real at HEAD)
3. **`declaration-upsert-merge`** — `mergeDeclaration(existing, patch)` is pure and stable
   - **asserts —** `sessionId` is never patched, `startedAt` survives any overwrite, `lastSeenAt`
     bumps on merge, `undefined` patch fields leave existing values untouched, and inputs are not
     mutated (the `mergeCommentPatch` pattern, `packages/store/src/pg-comment-store.ts`).
   - **proven by —** `packages/notice-board/src/presence.test.ts` (real at HEAD)
