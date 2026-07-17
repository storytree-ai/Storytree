---
id: "noticeboard-cli"
tier: capability
story: notice-board
title: "The noticeboard command family — the ledger board, declare/claim, done"
outcome: "`storytree noticeboard` renders the claim ledger — claims grouped by session and grade (exploring / waiting / work) with cursor-once overlap deltas; `declare`/`claim`/`worktree create` write with worktree-derived identity."
status: proposed
proof_mode: integration-test
# ADR-0200 re-aim: was `depends_on: [declare-presence, presence-store]` (the retired presence caps). The
# board is now a view over the CLAIM LEDGER (`events.node_claim`), so it is a within-story root; the
# ledger store it reads is notice-board's own `PgClaimStore` (cross-referenced from the story).
depends_on: []
# Node-borne proof config (ADR-0057): authoring this block makes the node buildable — no
# NODE_BUILD_REGISTRY edit. Mirrors the registry's NodeBuildConfig shape EXACTLY (a parity guard
# asserts equality). Self-contained handler file; the spine wires commands.ts dispatch AFTER
# promotion (the leaf's scope deliberately excludes it). install:true (imports @storytree/core).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/noticeboard.test.ts"
    sourceFile: "packages/drive/src/noticeboard.ts"
    scope:
      testGlobs: ["packages/drive/src/noticeboard.test.ts"]
      sourceGlobs: ["packages/drive/src/noticeboard.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# The noticeboard command family — the ledger board, declare/claim, done

**Outcome —** `storytree noticeboard` renders the **claim ledger** — claims grouped by session and
grade (`exploring` / `waiting` / `work`) with cursor-once overlap deltas; `declare`/`claim`/`worktree
create` write with worktree-derived identity.

> **ADR-0200 re-aim (one ledger).** This capability's original cut was the **presence board** (active
> sessions grouped by story node, staleness-banded) over `events.session`. ADR-0200 retired the
> self-reported presence layer and unified coordination onto the **claim ledger**
> (`events.node_claim` + `claim_event`, graded exploring / waiting / work): the board now renders claims
> grouped by session and grade (`groupClaimsBySession`, `packages/notice-board/src/claim.ts`) with
> cursor-once overlap-delta footers (`pullOverlapDeltas` → `digestOverlapDeltas`), and the write verbs
> are the ledger's (`worktree create` takes the exploring claim, `declare --node` / `claim` take/upgrade
> the work claim, `done` bulk-releases). The **presence-grouped board described in the body below is the
> pre-sweep implementation** (`packages/drive/src/noticeboard.ts`, still live until the arc's final
> increment deletes the presence core, ADR-0200 D7) and is kept as history; the ledger board landed
> alongside it (`packages/drive/src/noticeboard-claims.ts` + the ledger dispatch,
> `packages/cli/src/noticeboard-ledger-dispatch.test.ts`). Identity-derived-not-typed and the
> writes-need-`--pg` walls stand unchanged.

> **Proof status (honest) — since PROVEN and PROMOTED (ADR-0031).** The gated leaf authored
> `packages/drive/src/noticeboard.ts` + its test in a fresh worktree; the spine observed the real
> red→green and signed a PASS (run `real-mq8o0n7p`, commit `eee848b`, persisted to
> `events.verdict`); the spine wired the `commands.ts` dispatch after promotion
> (`noticeboard-dispatch.test.ts`). The authored status stays `proposed` forever: `healthy` is
> only ever derived from signed verdicts (ADR-0020). The design (ADR-0033 Decision 2): the board
> is one of the CLI orientation surfaces, advisory only — it *shows* who is where; nothing
> refuses on overlap.

## Guidance

The implementation is `packages/drive/src/noticeboard.ts` — a SELF-CONTAINED command module beside
`library` and `node`/`story` (ADR-0023 choose-your-own-adventure: every handler returns the
`Envelope` from `./envelope.js` — `{ ok, body, next?, doctrine? }`). Do NOT touch `commands.ts`
or `main.ts` (outside your write scope) — the spine wires the dispatch afterwards; the handlers
take already-parsed inputs and injected deps, so everything is testable without a terminal.

- **The exported surface (exactly this — the offline test and the later dispatch drive it):**
  - `interface PresenceStoreLike { declare(doc: PresenceDeclarationDoc): Promise<PresenceDeclarationDoc>; done(sessionId: string, lastSeenAt: string): Promise<PresenceDeclarationDoc | null>; listActive(): Promise<PresenceDeclarationDoc[]>; history(sessionId: string): Promise<Array<{ type: string; doc: unknown; actor: string; at: string }>> }`
    — structurally what `PgPresenceStore` (`packages/store/src/presence-store.ts`) exposes, but do
    NOT import the pg store here; the seam keeps this module offline-testable.
  - `interface SessionIdentity { sessionId: string; branch: string }`.
  - `function deriveIdentity(runGit: (args: string[]) => string): SessionIdentity | null` —
    `sessionId` = the basename of `runGit(["rev-parse", "--show-toplevel"])` **only when** that
    toplevel sits under a `.claude/worktrees/` directory (match both `/` and `\` separators);
    `branch` = `runGit(["rev-parse", "--abbrev-ref", "HEAD"])`. Anything else — non-worktree
    path, a git error (catch throws) — returns null. Export a default runGit built on
    `node:child_process` `execFileSync("git", args, { encoding: "utf8" })` (trimmed), but the
    function always takes it as a parameter (tests inject fakes).
  - `interface NoticeboardDeps { store: PresenceStoreLike | null; identity: SessionIdentity | null; now: () => Date }`
    (`store` is null when `--pg` was not given; `identity` is null outside a recognisable worktree).
  - `async function noticeboardCommand(sub: string | undefined, opts: { workingOn?: string; nodes: string[] }, deps: NoticeboardDeps): Promise<Envelope>`
    — `sub` is `undefined` (the board), `"declare"`, or `"done"`; anything else returns a help
    envelope listing the three.
- **The board (bare `storytree noticeboard`):** needs `deps.store`; when null return `ok: false`
  with body explaining presence needs the live store and `next` containing `pnpm db:up` and
  `storytree noticeboard --pg`. With a store: `listActive()` docs grouped by declared node id —
  a session appears under EACH id in its `nodes`; sessions with empty `nodes` group under
  `(no node)`. Each row renders `sessionId`, the staleness band from
  `classifyPresence(doc.lastSeenAt, deps.now())` (import from `@storytree/core` — never recompute
  thresholds here), an age like `3m`/`2h`, `branch`, and the `workingOn` prose. Active-only is the
  default view (the store already filters); never list `done` sessions on the board.
- **Identity is derived, never typed (ADR-0033 Decision 1):** there is deliberately NO option to
  pass an identity — the flag's absence is the contract. `declare`/`done` with `deps.identity`
  null refuse (`ok: false`) with guidance saying identity is derived from the session worktree.
  No signer chain: presence is not proof.
- **`declare`:** needs store + identity + a non-blank `opts.workingOn` (each missing piece is its
  own polite refusal, never a throw). Build the doc: `sessionId`/`branch` from `deps.identity`,
  `workingOn`, `nodes: opts.nodes`, `status: "active"`, `startedAt` and `lastSeenAt` =
  `deps.now().toISOString()` (the store's merge anchors the original `startedAt` on re-declare).
  Call `store.declare(doc)`; confirm in the body; `next` points onward (e.g.
  `storytree tree <first declared node> --pg` when nodes were declared, else
  `storytree noticeboard --pg`).
- **`done`:** needs store + identity; calls `store.done(identity.sessionId, deps.now().toISOString())`;
  a null result is `ok: false` ("no active declaration for this session"); success confirms and
  points back to the board.
- **The test (`packages/drive/src/noticeboard.test.ts`, the registered REAL proof — offline only):**
  drive `noticeboardCommand` + `deriveIdentity` directly with a tiny in-memory
  `PresenceStoreLike` fake (a Map of docs + an event array), fake `runGit` functions, and a fixed
  `now`. Cover: deriveIdentity recognises `.claude/worktrees/<name>` toplevels (both separator
  styles) and returns null for a plain checkout and for a throwing git; declare/done with null
  store → refusal whose `next` mentions `pnpm db:up` (writes need --pg); declare with null
  identity → refusal; declare with blank `workingOn` → refusal; a successful declare passes the
  built doc to the store (assert sessionId/branch came from identity, startedAt = the fixed now);
  the board groups one session under its declared node id and a prose-only session under
  `(no node)` with bands derived from `lastSeenAt` (make one fresh and one stale by choosing
  timestamps relative to the fixed now); after `done` the board no longer lists the session while
  `history(sessionId)` still returns its events. Assert on envelope `ok`/body fragments/`next`
  entries — never on byte-exact whole bodies (you cannot run this test yourself; brittle
  assertions are how this build dies).

## Integration test

**Goal —** Against the store seam (in-memory), the command surface derives identity, gates writes
on `--pg`, renders the grouped + aged board, and `done` drops a session from the active view
without erasing its history.

Drive the command handlers with a fake git/worktree resolver and an `InMemoryStore`-backed
presence store: declare two sessions (one with `--node`, one prose-only), assert the board groups
and bands them; declare without `--pg` and outside a worktree, assert both refusals; run `done`
and assert the active board shrinks while the session's events remain readable via the store seam.

## Contracts (4)

1. **`identity-derived-not-typed`** — declare resolves identity from the worktree, never a flag
   - **asserts —** `declare` derives `sessionId` (worktree name) and `branch` from git; no flag
     exists to supply an identity; outside a recognisable worktree it refuses with guidance.
   - **proven by —** `packages/drive/src/noticeboard.test.ts` (real at HEAD)
2. **`writes-need-pg`** — declare/done are refused without `--pg`
   - **asserts —** `declare` and `done` without `--pg` are refused (matching library artifact
     writes), with `pnpm db:up` guidance in the envelope's `next`; nothing is written.
   - **proven by —** `packages/drive/src/noticeboard.test.ts` (real at HEAD)
3. **`board-groups-and-ages`** — the board groups by declared node and renders staleness
   - **asserts —** active sessions group under their declared story node, prose-only sessions
     under a no-node group, each row showing its derived staleness band; the default view is
     active-only.
   - **proven by —** `packages/drive/src/noticeboard.test.ts` (real at HEAD)
4. **`done-drops-active-keeps-history`** — done leaves the board, history survives
   - **asserts —** after `done`, the session no longer appears on the active board, while its
     full event history remains readable via the store seam.
   - **proven by —** `packages/drive/src/noticeboard.test.ts` (real at HEAD)
