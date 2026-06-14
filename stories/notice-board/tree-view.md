---
id: "tree-view"
tier: capability
story: notice-board
title: "The tree is the orientation surface — offline hierarchy, presence woven in when live"
outcome: "storytree tree [<story>] renders the work hierarchy offline and weaves the presence block in when the live store is reachable."
status: proposed
proof_mode: integration-test
depends_on: [declare-presence, presence-store]
# Node-borne proof config (ADR-0057): authoring this block makes the node buildable — no
# NODE_BUILD_REGISTRY edit. Mirrors the registry's NodeBuildConfig shape EXACTLY (a parity guard
# asserts equality). Self-contained module; dispatch wired spine-side after promotion. install:true
# (imports @storytree/core + @storytree/orchestrator).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
  real:
    testFile: "packages/cli/src/tree.test.ts"
    sourceFile: "packages/cli/src/tree.ts"
    scope:
      testGlobs: ["packages/cli/src/tree.test.ts"]
      sourceGlobs: ["packages/cli/src/tree.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
---

# The tree is the orientation surface — offline hierarchy, presence woven in when live

**Outcome —** `storytree tree [<story>]` renders the work hierarchy offline and weaves the
presence block in when the live store is reachable.

> **Proof status (honest) — since PROVEN and PROMOTED (ADR-0031).** The gated leaf authored
> `packages/cli/src/tree.ts` + its test in a fresh worktree; the spine observed the real
> red→green and signed a PASS (run `real-mq8ozw0d`, commit `e78c1aa`, persisted to
> `events.verdict`); the spine wired the dispatch after promotion. The authored status stays
> `proposed` forever: `healthy` is only ever derived from signed verdicts (ADR-0020). The design
> (ADR-0033 Decision 2): the tree is an orientation surface in the ADR-0023
> choose-your-own-adventure pattern — the focused story view is the centerpiece where a session
> zoning into a node sees its neighbours.

## Guidance

The implementation is `packages/cli/src/tree.ts` — a SELF-CONTAINED command module (every handler
returns the `Envelope` from `./envelope.js`). Do NOT touch `commands.ts` or `main.ts` (outside
your write scope) — the spine wires the dispatch afterwards. Two views: **bare**
(`storytree tree`) — all stories; **focused** (`storytree tree <story-id>`) — one story's nodes,
edges, build surface and the presence block. (Verdict detail stays OUT of this cut — owner call 3,
resolved 2026-06-11, ADR-0033 Owner decisions: per-node verdict glyphs (✓/✗/–, from
`events.verdict`, story rows showing only their own UAT node's verdict — never a child roll-up)
land as a named FOLLOW-UP capability ([`verdict-glyphs`](verdict-glyphs.md)), not a retrofit of
this view; do not query verdicts here.)

**Budget your turns.** Each phase runs under a hard turn ceiling. Do not explore the repo — this
Guidance plus `./envelope.js` and the type exports of `./noticeboard.ts` are ALL the context you
need. Write each deliverable file in ONE Write call (compose fully, then write; avoid
incremental Edits).

- **The exported surface (exactly this):**
  - `interface TreeDeps { storiesDir: string; lookupConfig: (id: string) => { real?: unknown } | null; presence: PresenceStoreLike | null; now: () => Date }`
    — import `type PresenceStoreLike` from `./noticeboard.js` (the sibling module, already at
    HEAD); `lookupConfig` is the registry seam (`NodeBuildConfig`-shaped: non-null = registered,
    `.real !== undefined` = REAL-buildable). Everything is injected — the test never touches the
    real `stories/` tree or the real registry, so future stories/registrations cannot break it.
  - `async function treeCommand(storyId: string | undefined, deps: TreeDeps): Promise<Envelope>`.
- **Reading specs (ADR-0010 §4 — consumed, not reimplemented):** import `loadNodeSpec` from
  `@storytree/orchestrator`. A story is a direct child directory of `deps.storiesDir` containing
  a `story.md`; its spec's frontmatter `capabilities` lists its capability ids, each at
  `<storyDir>/<capId>.md`. Tolerate a capability file that is missing or fails to load (render
  the id with a `(spec missing)` note — never throw).
- **Bare view:** one line per story — id, title, status, capability count — plus, when
  `deps.presence` is non-null, ONE summary line with the active-session count from
  `listActive()`. `next` offers `storytree tree <story-id>` for a real listed id.
- **Focused view:** unknown story id → `ok: false` listing the available story ids in `next`.
  Otherwise render: the story header (id, title, status, outcome); a capability table — each
  capability's id, status, `depends_on`, and its build-surface mark from `deps.lookupConfig`:
  `REAL-buildable` when `.real` exists, `registered` when non-null without `.real`, else
  `unregistered`; a dependency-edges section (`a → b` per `depends_on` entry). `next` offers
  `storytree noticeboard declare --working-on <prose> --node <storyId> --pg`,
  `storytree node build <id> --real` for a REAL-buildable capability when one exists, and
  `storytree tree` (back out).
- **The presence block (focused, advisory only):** when `deps.presence` is non-null, take
  `listActive()` docs whose `nodes` intersect `{storyId} ∪ capability ids` and weave in a
  `sessions here:` block — per session: `sessionId`, the band from
  `classifyPresence(doc.lastSeenAt, deps.now())` (import from `@storytree/core` — never recompute
  thresholds), an age like `4m`/`2h`, and the `workingOn` prose. When `deps.presence` is null,
  when the list is empty, or when ANY presence call throws (wrap it): the block is silently
  absent — the view still renders `ok: true`. Degrade, never fail; nothing here refuses or warns
  on overlap.
- **The test (`packages/cli/src/tree.test.ts`, the registered REAL proof — offline only):** ONE
  tight file, written in ONE Write call. Setup (a `before` hook): `mkdtempSync` a temp stories
  dir; write `story.md` (frontmatter: `id: demo-story`, `tier: story`, `title`, `outcome`,
  `status: proposed`, `proof_mode: UAT`, `capabilities: [cap-a, cap-b, cap-c]`) and three
  capability files (`tier: capability`, `proof_mode: integration-test`; `cap-b` carries
  `depends_on: [cap-a]`); remove it in `after`. Fakes: `lookupConfig` mapping `cap-a` →
  `{ real: {} }`, `cap-b` → `{}`, else `null`; a `PresenceStoreLike` whose `listActive` returns
  one active doc with `nodes: ["demo-story"]` and one with unrelated nodes. Assert BY FRAGMENT
  (never byte-exact bodies — you cannot run this test yourself; brittle assertions are how this
  build dies): (1) bare and focused render `ok: true` with `presence: null`, body free of
  `sessions here:`; (2) focused marks cap-a `REAL-buildable`, cap-b `registered`, cap-c
  `unregistered`; (3) with the fake presence store the focused body shows `sessions here:` with
  the matching sessionId and NOT the unrelated one; (4) with a presence store whose methods all
  throw, focused still renders `ok: true`, no block; (5) focused `next` carries a
  `noticeboard declare` pointer with `--node demo-story` and a `node build` pointer; bare `next`
  carries `storytree tree demo-story`. That is the whole list — do not add more cases.

## Integration test

**Goal —** Against the real `stories/` tree and registry (and a presence store fake/live-gated pg),
both views render offline without error, the focused view exposes the build surface, presence
appears only with `--pg`, and the next pointers point where the story says they should.

Render bare and focused views with no DB configured; assert clean output and exit 0. Register one
capability; assert the focused view distinguishes registered / REAL-buildable / unregistered.
Re-render with `--pg` against a store holding a declaration anchored to the story; assert the
presence block appears, and is silently absent without `--pg`.

## Contracts (4)

1. **`tree-renders-offline`** — bare and focused views render with no DB
   - **asserts —** both views render from `stories/` frontmatter + the registry with no DB
     reachable and no error; exit 0.
   - **proven by —** `packages/cli/src/tree.test.ts` (real at HEAD)
2. **`focus-shows-build-surface`** — the focused view marks what can build next
   - **asserts —** each capability in the focused view is marked registered / REAL-buildable /
     unregistered from `NODE_BUILD_REGISTRY`, so "what can build next" is readable.
   - **proven by —** `packages/cli/src/tree.test.ts` (real at HEAD)
3. **`presence-woven-when-live`** — presence appears with `--pg`, degrades silently without
   - **asserts —** with `--pg` the focused view includes the presence block for sessions whose
     `nodes` match the story or its capabilities; without `--pg` (or DB down) the block is
     silently absent — never an error.
   - **proven by —** `packages/cli/src/tree.test.ts` (real at HEAD)
4. **`next-pointers-guide`** — the envelope `next` steers the session
   - **asserts —** the focused view's `next` offers `noticeboard declare --node <id>` and
     `node build <id>`; the bare view's `next` offers `tree <story-id>`.
   - **proven by —** `packages/cli/src/tree.test.ts` (real at HEAD)
