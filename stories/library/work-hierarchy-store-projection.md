---
id: "work-hierarchy-store-projection"
tier: capability
story: library
arc: map-freshness-arc
title: "The work hierarchy mirrored into the live store as a one-directional projection"
outcome: "A loader projects stories, capabilities, criteria and reliability gates off a checkout into stamped store rows that replace the previous copy whole, so the forest map's question half can be read from the same place its proof half already is."
status: proposed
proof_mode: integration-test
depends_on: ["event-sourced-store-seam"]
decisions: [445]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "--filter", "@storytree/drive", "test"]
  scope:
    testGlobs:
      - "packages/library/src/work-hierarchy-projection.test.ts"
      - "packages/library/src/work-hierarchy-tree.test.ts"
      - "packages/library/src/store/pg-work-hierarchy-store.test.ts"
      - "packages/drive/src/hierarchy-projection.test.ts"
    sourceGlobs:
      - "packages/library/src/work-hierarchy-projection.ts"
      - "packages/library/src/work-hierarchy-tree.ts"
      - "packages/library/src/store/pg-work-hierarchy-store.ts"
      - "packages/drive/src/hierarchy-projection.ts"
---

# The work hierarchy mirrored into the live store as a one-directional projection

**Outcome —** A loader projects stories, capabilities, criteria and reliability gates off a checkout
into stamped store rows that replace the previous copy whole, so the forest map's question half can
be read from the same place its proof half already is.

The `arc: map-freshness-arc` frontmatter preserves this increment's initiative provenance while the
capability lives in `library`, the story owning `packages/library` and its store subpath.

**What it closes.** The forest map JOINS signed verdicts — live from Postgres, always current —
against the story shape `readTree(storiesDir)` reads from `stories/**` on the app's own disk, frozen
at the commit the app was built from. Verdicts bind to criteria by `criterionId` + `revisionId`
(ADR-0253), so a stale app reads the database perfectly, matches no verdict for a criterion re-worded
since, and correctly paints yellow. Criteria declared on `main` went 261 (2026-08-05) → 113
(2026-08-24): the staler the client, the yellower the map. ADR-0445 D1 puts the hierarchy in the
store so the two halves can eventually come from one clock; this capability is that half.

**It switches no reader.** `readTree` is untouched and the map still reads disk — the switch is
`map-freshness-render-reads-live`'s. This lands, is verified against the disk copy, and sits
harmlessly until then. Disk stays canonical for AUTHORING (`story-author` writes markdown under
`stories/**` and nothing else, ADR-0309 D3) and for PROVING (the corpus guard, `check:boundaries`,
the build drivers and CI read the commit under test). One direction, always.

**No `real:` arm.** The `proof.command` above is the standing wall; there is no `real:` block,
for `map-currency-signal`'s stated reason on this same arc — the red→green is verified by mutation
against the shipped suites rather than by a driven build, and a `real:` arm naming one file could not
cover a capability whose modules sit in two packages.

## Proof walkthrough first

Parse literal projected stories and capabilities and observe that a would-be criterion, a retired
gate and an undeclared `uat_witness` all survive unfolded. Hand the diff two snapshots of the same
tree taken at different commits and observe NO differences — the stamp is provenance, never a
difference. Hand it a store missing a story, a capability, a criterion and a gate and observe each
one named by its own id and owning story; move one criterion's `revisionId` and observe exactly one
line, on that criterion, naming that field. Build a throwaway `stories/` tree on disk and observe the
projector reproduce every frontmatter field, the authored capability order, both criteria and both
gates; break one spec and observe an error node rather than a throw. Finally drive the store's write
against a recording client and observe `BEGIN`, a delete of all four projection tables before any
insert, and `COMMIT` — and a mid-write failure ending in `ROLLBACK` with no commit.

## Build boundary

Author only:

- `packages/library/src/work-hierarchy-projection.ts` (+ its `.test.ts`)
- `packages/library/src/store/pg-work-hierarchy-store.ts` (+ its `.test.ts`)
- `packages/library/src/store/schema.sql` (the five projection tables)
- `packages/library/src/index.ts`, `packages/library/src/store/index.ts` (barrel re-export only)
- `packages/drive/src/hierarchy-projection.ts` (+ its `.test.ts`), `packages/drive/src/index.ts`
- `packages/cli/src/load-hierarchy.ts`, `packages/cli/src/hierarchy-git.ts`
- `apps/studio/server/hierarchyProjectionParity.test.ts` (the parity wall — a test only)

Do NOT touch `readTree`, the studio's tree route, the desktop backend, or any proving reader. Do not
add a second writer of these rows, and do not model anything the RENDERING readers do not consume —
modelling for the proving readers is what would invite a later "just read it live" shortcut, and a
story pulled live while CI tests a branch validates the wrong thing.

## Contracts

1. **`work-hierarchy-projection-carries-raw-authored-facts`** — the projection folds nothing.
   - **asserts —** a would-be criterion, a retired gate and an undeclared `uat_witness` are all
     carried as authored rather than filtered or defaulted; the capability id list keeps its authored
     order, and a re-ordering is a reported difference.
   - **proven by —** `packages/library/src/work-hierarchy-projection.test.ts` and
     `packages/drive/src/hierarchy-projection.test.ts`, with test titles beginning with this contract id.
2. **`work-hierarchy-projection-is-total-over-an-unreadable-spec`** — a broken spec is a node, not a throw.
   - **asserts —** a malformed `story.md`, a malformed capability spec and a capability the story
     names but whose file is absent each project as an `error` node carrying why; an absent stories
     directory projects an empty snapshot; nothing throws.
   - **proven by —** `packages/library/src/work-hierarchy-projection.test.ts` and
     `packages/drive/src/hierarchy-projection.test.ts`, with test titles beginning with this contract id.
3. **`work-hierarchy-projection-mirrors-the-checkout`** — the projector reproduces the tree.
   - **asserts —** every frontmatter field, the ordered capability list, the declared contract count,
     and both obligation sets are reproduced; membership comes from the story's frontmatter and never
     from the directory listing; two runs over one tree are equal; a change to one criterion's content
     moves that criterion and nothing else.
   - **proven by —** `packages/drive/src/hierarchy-projection.test.ts`, with a test title beginning
     with this exact contract id. The cross-reader PARITY half — that the projection carries what
     `readTree` renders, fold for fold — is `apps/studio/server/hierarchyProjectionParity.test.ts`,
     a standing wall inside `pnpm -r test` rather than under this capability's own proof command.
4. **`work-hierarchy-diff-addresses-every-drift-shape`** — a difference is addressable, once.
   - **asserts —** missing, unexpected and changed are reported for stories, capabilities, criteria
     and gates, each naming its id, its owning story and (for a change) the field; a missing story is
     ONE line rather than one per obligation inside it; the counts report the denominators, so
     agreement and emptiness cannot print alike.
   - **proven by —** `packages/library/src/work-hierarchy-projection.test.ts`, with test titles
     beginning with this exact contract id.
5. **`work-hierarchy-diff-is-blind-to-the-stamp-and-to-key-order`** — only real drift is reported.
   - **asserts —** two snapshots of the same tree at different commits, generated at different times
     by different generators, produce no differences; a JSON round trip with reversed key order and a
     reordered story list likewise produce none.
   - **proven by —** `packages/library/src/work-hierarchy-projection.test.ts`, with a test title
     beginning with this exact contract id.
6. **`work-hierarchy-store-replaces-the-whole-snapshot-in-one-transaction`** — a deletion is expressible.
   - **asserts —** the write opens with `BEGIN`, deletes all four projection tables before any
     insert, and ends `COMMIT`; a failure mid-write ends `ROLLBACK` and never commits.
   - **proven by —** `packages/library/src/store/pg-work-hierarchy-store.test.ts`, with test titles
     beginning with this exact contract id.
7. **`work-hierarchy-store-round-trips-a-snapshot`** — what is written reads back identical.
   - **asserts —** the normalised criterion and gate rows reassemble into the stories they came from,
     in authored order, and the stamp's freshness key survives; an unloaded store answers `null`
     rather than an empty snapshot, so "nobody has looked" and "there was nothing there" stay
     distinguishable.
   - **proven by —** `packages/library/src/store/pg-work-hierarchy-store.test.ts`, with test titles
     beginning with this exact contract id.

## Integration test

Run `pnpm --filter @storytree/library --filter @storytree/drive test`, then the matching
`typecheck`. Every assertion is literal snapshots or a throwaway `stories/` tree in the OS temp
directory against a recording client — no DB, no socket, no live row, no credential and no human
witness participates. The live half is exercised by `pnpm hierarchy:load` against the real store and
read back by `check:hierarchy-drift`, which is `work-hierarchy-drift-gate`'s capability, not this one's.
