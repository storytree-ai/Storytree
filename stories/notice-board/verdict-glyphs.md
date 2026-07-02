---
id: "verdict-glyphs"
tier: capability
story: notice-board
title: "The tree shows signed proof — one verdict glyph per node, silently absent offline"
outcome: "storytree tree shows one signed-verdict glyph per node — ✓ proven / ✗ last run failed / – never built — read from events.verdict when the DB is up, silently absent offline."
status: proposed
proof_mode: integration-test
depends_on: [tree-view]
# Node-borne proof config (ADR-0057): authoring this block makes the node buildable — no
# NODE_BUILD_REGISTRY edit. Mirrors the registry's NodeBuildConfig shape EXACTLY (a parity guard
# asserts equality). NET-NEW file pair ON PURPOSE (tree.ts is tree-view's surface): the spine wires
# tree.ts to call these after promotion. install:true (imports @storytree/core).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
  real:
    testFile: "packages/cli/src/tree-verdicts.test.ts"
    sourceFile: "packages/cli/src/tree-verdicts.ts"
    scope:
      testGlobs: ["packages/cli/src/tree-verdicts.test.ts"]
      sourceGlobs: ["packages/cli/src/tree-verdicts.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
---

# The tree shows signed proof — one verdict glyph per node, silently absent offline

**Outcome —** `storytree tree` shows one signed-verdict glyph per node — ✓ proven / ✗ last run
failed / – never built — read from `events.verdict` when the DB is up, silently absent offline.

> **Proof status (honest) — since PROVEN and PROMOTED (ADR-0031).** The gated leaf authored
> `packages/cli/src/tree-verdicts.ts` + its test net-new in a fresh worktree; the spine observed
> the real red→green and signed a PASS (run `real-mqb1dzg2`, commit `b226b4a`, persisted to
> `events.verdict`, 2026-06-13). The ADR-0031 typecheck wall withheld the automatic push — the
> leaf's fixture was runtime-green under tsx but type-illegal under `exactOptionalPropertyTypes`;
> a one-line spine-side fix landed on top and the verdict's commit stays an ancestor of `main`
> (merged non-squash, PR #75). The spine then wired `treeCommand` + the `tree` area dispatch to
> the module (`tree.ts`/`commands.ts`/`main.ts`; `tree-dispatch.test.ts` proves the glue). The
> authored status stays `proposed` forever: `healthy` is only ever derived from signed verdicts
> (ADR-0020). The live `events.verdict` read over the IAM connection stays the house live-gated,
> human-verified pattern — never attested by a worktree PASS. The design is fixed by ADR-0033
> "Owner decisions (2026-06-11)" decision 4 (story call 3): option (b), a named FOLLOW-UP
> capability — the built tree-view was deliberately not retrofitted.

## Guidance

The semantics are exact (ADR-0033 owner decision 4): one glyph per node — **✓ proven** (the
latest signed verdict for the node's unit id is a `pass`) / **✗ last run failed** (the latest is
a `fail`) / **– never built** (the store is readable but holds no verdict for the id) — read from
`events.verdict` when the DB is up, **silently absent offline**. It applies to both story and
capability rows, and a story row shows ONLY its own UAT node's verdict (the verdict `story build`
persists under the STORY's own id), never a roll-up inferred from its children — "all
capabilities pass" and "the story passed UAT" are different claims, and the glyph only ever
reports a signed verdict.

The implementation now lives at `packages/drive/src/tree-verdicts.ts` (relocated per the
ADR-0112 drive-extraction pattern; `packages/cli/src/tree-verdicts.ts` remains as a thin
re-export shim, so the registered proof is unchanged) — a SELF-CONTAINED module of pure
functions plus one reader wrapper (no Envelope: `tree.ts` does the rendering). Do NOT touch
`tree.ts`, `tree.test.ts`, `commands.ts`, `main.ts`, or `noticeboard.ts` (all outside your write
scope — `tree.ts` is ANOTHER capability's registered REAL surface): the spine wires `treeCommand`
to call these functions after promotion, the house pattern. Reuse the existing vocabulary: import
`Verdict` and `SIGNING_EVENT_KIND` from `@storytree/core` — never re-declare the verdict shape or
the signing kind string in the implementation.

**Budget your turns.** Each phase runs under a hard turn ceiling. Do not explore the repo — this
Guidance is ALL the context you need. Write each deliverable file in ONE Write call (compose
fully, then write; avoid incremental Edits).

- **The exported surface (exactly this):**
  - `type VerdictGlyph = "✓" | "✗" | "–"`.
  - `interface VerdictReaderLike { readEvents(): Promise<ReadonlyArray<{ kind: string; seq: number; doc: unknown }>> }`
    — the structural slice of the drive machinery's `PgWorkStore` (an ADR-0010 §4 consumed seam):
    its merged work+signing event stream with monotonic `seq`. Everything is injected — the test
    never touches the real store or a DB.
  - `function deriveVerdictGlyphs(events: ReadonlyArray<{ kind: string; seq: number; doc: unknown }>): Map<string, VerdictGlyph>`
    — pure. Keep ONLY events whose `kind` is `SIGNING_EVENT_KIND` and whose `doc` parses as a
    full `Verdict` (`Verdict.safeParse`; a malformed signing doc grants NOTHING — the rollup's
    conservative-parsing discipline). Sort by `seq`; the LAST verdict per `unitId` wins:
    `outcome: "pass"` → `"✓"`, `outcome: "fail"` → `"✗"`. Units with no verdict are simply
    absent from the map (the dash belongs to `glyphFor`).
  - `function glyphFor(glyphs: ReadonlyMap<string, VerdictGlyph> | null, unitId: string): string`
    — `glyphs === null` (offline) → `""` (the glyph column does not exist); map present but no
    entry → `"–"` (never built); else the stored glyph. A story row's glyph is looked up under
    the STORY's own unit id by the caller — this keyed-by-id shape is what makes a child roll-up
    structurally impossible.
  - `async function readVerdictGlyphs(reader: VerdictReaderLike | null): Promise<Map<string, VerdictGlyph> | null>`
    — the ONE place the offline-silent contract lives: `null` reader → `null`; a `readEvents()`
    call that throws/rejects → `null` (swallow it — never an error, never output); otherwise
    `deriveVerdictGlyphs` over the events. Call `readEvents()` with no arguments.
- **The test (`packages/cli/src/tree-verdicts.test.ts`, the registered REAL proof — offline
  only):** ONE tight file, written in ONE Write call, `node:test` + `node:assert/strict`. A
  fixture helper builds full signing events: `kind: SIGNING_EVENT_KIND` (import it), a `seq`, and
  a doc that is a complete `Verdict` (`unitId`, `proofMode: "contract"`, `outcome`,
  `commitSha: "abc123"`, `signer: "test-signer"`, `runId: "run-1"`, `at` an ISO string; omit
  `evidence` — it defaults). These are pure functions — exact-value asserts are right here.
  Cover exactly: (1) `deriveVerdictGlyphs([])` → empty map; a pass for `cap-a` → `"✓"`; a
  HIGHER-seq fail for `cap-a` → `"✗"`; a yet-higher pass → `"✓"` — and the same result when the
  events are fed OUT of seq order. (2) grants-nothing: a signing event with a malformed doc (e.g.
  missing `outcome`), a `kind: "work"` event, and a verdict for another unit — none of them
  change `cap-a`'s glyph or add entries. (3) `glyphFor(null, "cap-a")` → `""`;
  `glyphFor(map, "never-built")` → `"–"`; `glyphFor(map, "cap-a")` → its glyph. (4)
  `readVerdictGlyphs(null)` → `null`; a reader whose `readEvents` rejects → `null`; a fake
  reader resolving fixture events → the same map `deriveVerdictGlyphs` returns. (5) the
  no-roll-up rule, asserted by name: with passes for `cap-a` AND `cap-b` only,
  `glyphFor(map, "demo-story")` → `"–"` — children's passes grant the story NOTHING. That is the
  whole list — do not add more cases.

## Integration test (would-be)

**Goal —** Against a live store holding real signed verdicts, both tree views carry the glyph per
node; offline they render exactly as today — no glyph column, no error.

Run `storytree tree <story>` with `--pg` against a store where one capability holds a signed pass,
one holds a pass superseded by a fail, and the story's own UAT node has never built: assert ✓, ✗,
and – respectively, and that the story row's glyph ignores the children. Re-run offline: assert
the rendered body is glyph-free and `ok: true`.

## Contracts (4)

1. **`glyph-is-the-last-signed-verdict`** — ✓/✗ derive from the latest signed verdict per unit id
   - **asserts —** signing events parse as full `Verdict`s, sort by `seq`, last one per unit wins:
     pass → ✓, fail → ✗; out-of-order input derives identically.
   - **proven by —** `packages/cli/src/tree-verdicts.test.ts` (real at HEAD)
2. **`malformed-grants-nothing`** — only a parseable signed verdict moves a glyph
   - **asserts —** a malformed signing doc, a work-kind event, and another unit's verdict change
     nothing — the rollup's conservative-parsing discipline.
   - **proven by —** `packages/cli/src/tree-verdicts.test.ts` (real at HEAD)
3. **`offline-silently-absent`** — no reader (or a throwing one) means no glyph column, never an error
   - **asserts —** `readVerdictGlyphs(null)` and a rejecting reader both yield `null`, and
     `glyphFor(null, id)` is the empty string — offline the column simply does not exist; with a
     readable store a verdict-less unit is `"–"` (never built).
   - **proven by —** `packages/cli/src/tree-verdicts.test.ts` (real at HEAD)
4. **`story-glyph-never-rolls-up`** — a story row reports only its own UAT node's verdict
   - **asserts —** with signed passes for every capability and none for the story id, the story's
     glyph is `"–"` — "all capabilities pass" and "the story passed UAT" are different claims.
   - **proven by —** `packages/cli/src/tree-verdicts.test.ts` (real at HEAD)
