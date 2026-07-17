---
status: accepted
decided: 2026-07-18
amends: [18, 23, 120, 135]
---
# ADR-0210: Retire the generated apps/studio/data/assets.json

## Status

accepted (2026-07-18) — decided/directed by the owner in conversation on 2026-07-17 (option B chosen).
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. Realizes the parked
`retire-generated-assets-json` proposal.

**Amends** ADR-0018, ADR-0023, ADR-0120, ADR-0135 — narrows the committed generated-view set from
"`assets.json` only" (where ADR-0135 left it) to **zero**: `assets.json` is deleted (0018 §the generated
view; 0023 §11 seed/export surface), the `build-corpus.mjs` generator and its `check:corpus-build` drift
gate are removed (0120 part 1). None overturned: `knowledge.json` stays the structured seed, the live
Cloud SQL store stays the canonical non-agent tier, and the agent tier stays seed-canonical.

## Context

`apps/studio/data/assets.json` was a GENERATED VIEW of `apps/studio/data/knowledge.json`
(`build-corpus.mjs`, ADR-0018) — each knowledge unit's body rendered via `@storytree/library`'s
`renderBody`, plus the per-kind `template-<kind>` scaffolds. It duplicated artifact state the live Cloud
SQL store now owns canonically (ADR-0023). The hosted/default studio does **not** read it
(`selectedStore()` defaults to `pg`); it re-entered runtime only through a handful of seed paths, and a
`check:corpus-build` drift gate had to police its freshness — machinery kept alive solely to babysit a
committed derivative. This is the same shape ADR-0135 addressed for the other generated view
(`docs/glossary.md`): remove the file rather than keep it in sync.

An investigation on 2026-07-17 re-verified the consumer map against the code (the proposal's own
staleness note asked for this; it found the map had drifted since the proposal was authored):

1. **Templates (the one hard dependency).** Both seed paths — the corpus migration
   (`@storytree/library/store` `load-corpus.ts`) and the desktop backend's in-memory seed
   (`apps/desktop/src/backend/chat-sse-mount.ts`, a fifth consumer that appeared after the proposal was
   written and it did not list) — read ONLY the 13 `template`-category rows from `assets.json`; the
   structured units already come from `knowledge.json`. 12 of the 13 are fully regenerated from
   `generateTemplate(kind)` over `KIND_SPECS`; only `template-adr` is bespoke content.
2. **The offline JSON studio backend** (`libraryBackend.ts` `JsonBackend`, active under
   `STORYTREE_STUDIO_STORE=json`) read/wrote `assets.json` as its whole store, and the DB-free studio
   UAT (`apps/studio/uat/story-uat.spec.ts`) pins the server to it — the deliberate mock-UAT seam
   (ADR-0010 §5).
3. **A CLI WARN** (`generatedAssetCount` in `packages/cli`, surfaced by `storytree library --check`, with
   a matching count-reconciliation check in `@storytree/drive`'s `health.ts`) existed ONLY to detect
   `assets.json` staleness.

`build-corpus.mjs` was already assets-only (its glossary half retired with ADR-0135), so nothing that
`assets.json` held was irreplaceable: knowledge bodies re-render from `knowledge.json`, and the templates
regenerate from code.

## Decision

Retire `apps/studio/data/assets.json`. No committed generated file stands in for DB-backed artifact
state; anything needing the corpus wakes the live store or derives from the structured `knowledge.json`
seed. Concretely:

- **Templates re-home to code.** A new `libraryTemplates()` (`packages/library/src/templates.ts`,
  exported from `@storytree/library`) is the single source of the 13 `template` artifacts: the 12
  schema-derived scaffolds keep their body generated from `KIND_SPECS` (the ADR-0017 invariant, so they
  can never drift), plus the bespoke `template-adr` literal. Byte-parity with the retired file's template
  rows is verified by test. The corpus migration and the desktop seed import it instead of reading
  `assets.json`.
- **The offline studio derives its view (option B).** `JsonBackend` no longer reads a committed file:
  when given the `knowledge.json` path it SEEDS a gitignored runtime store
  (`apps/studio/data/assets.runtime.json`) on first read — the knowledge units rendered via
  `@storytree/library` plus `libraryTemplates()` — and persists edits there (satisfying the UAT's
  cold-restart durability). With no knowledge seed configured (the integration tests) an absent store
  still reads empty, the prior behaviour. The hosted/default `pg` backend is unchanged.
- **The drift machinery is removed, not kept.** `build-corpus.mjs`, the `check:corpus-build` gate (from
  `pnpm gate` + CI), the `generatedAssetCount` CLI WARN, and the `count-reconciliation` health check are
  all deleted, along with `assets.json` itself.

Options A (fully retire the offline backend, forcing the studio onto the DB and re-authoring the UAT
against it) and C (keep the file, keep a drift gate) were considered and rejected — see Alternatives.

## Consequences

- **Good — removes machinery instead of adding it.** One fewer committed generated file, one fewer drift
  gate (`check:corpus-build`) in the gate + CI, one fewer WARN, and no "regenerate and commit assets.json
  after every knowledge edit / graduation / export" step. The seed↔generated staleness that gate policed
  simply cannot occur — there is nothing to regenerate. Finishes the thread ADR-0135 opened: the corpus
  has ZERO committed generated views.
- **Good — templates are code with a byte-parity test.** The one thing `assets.json` held that
  `knowledge.json` did not (the templates) now lives in `libraryTemplates()`, tied to `KIND_SPECS` for
  the 12 generated scaffolds and snapshot-guarded for `template-adr`.
- **Bound — the offline store pulls the library renderer into its read path.** The offline backend now
  depends on `@storytree/library`'s `renderBody`/`libraryTemplates` at seed time (it already bundled the
  package). The derived offline view uses `knowledge.json` order rather than the historical `assets.json`
  order; the browse UI sorts/filters, so ordering is not load-bearing.
- **Bound — the committed, git-diffable rendered view is gone.** A PR that changed a knowledge unit used
  to show the rendered-body diff in `assets.json`; that rendered form is now only materialized at
  runtime. (ADR-0135 accepted the analogous loss for the glossary page.)
- **Bound — historical prose still references the file until the librarian pass.** Older accepted ADRs
  and the retrospective `stories/studio/*` specs still describe `assets.json` / `build-corpus.mjs` as a
  live generated view; this ADR is the authority that overrides them, and the librarian-curator pass
  reconciles the decision log. Current-state docs (`CLAUDE.md`, `README.md`, `apps/studio/README.md`) and
  live command hints were updated here.

## Alternatives considered

- **(A) Full retire of the offline backend.** Delete `JsonBackend` + `STORYTREE_STUDIO_STORE=json`; the
  studio always uses the live DB. Purest reading of "no static file for DB-backed state", but highest
  churn: it loses the offline-runnable acceptance proof, forcing the studio UAT to be re-authored against
  a credentialed DB and the JSON cases dropped from the integration tests. Rejected — the DB-free UAT
  seam (ADR-0010 §5) is worth keeping.
- **(C) Keep `assets.json`, just stop it rotting.** Retain the file + a regenerate-and-diff gate, fixing
  the latent `provenance` round-trip. Rejected — the drift gate (`check:corpus-build`) is exactly the
  removable machinery this ADR targets; keeping the file rejects the removal ask for no benefit over the
  live store already being canonical.

## References

- [ADR-0135](0135-retire-docs-glossary-md-the-library-is-the-sole-term-authori.md) — retired the other
  generated view (`docs/glossary.md`) and narrowed the generated-view set to `assets.json` only; this
  removes that last one. The direct precedent (remove the file, don't sync it).
- [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) — `knowledge.json` as the structured
  source + the generated-view model, now narrowed to zero committed views.
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the live store as the canonical edit
  surface; `assets.json` was the migration seed/export view, dropped here.
- [ADR-0120](0120-live-to-seed-reconciliation-export-corpus-and-unit-status-to.md) — added
  `check:corpus-build`; removed here with the file it gated.
- Code: `packages/library/src/templates.ts` (+ `templates.test.ts`), `packages/library/src/store/load-corpus.ts`,
  `apps/desktop/src/backend/chat-sse-mount.ts`, `apps/studio/server/deriveOfflineCorpus.ts` +
  `libraryBackend.ts` (option B), `packages/drive/src/health.ts` + `packages/cli/src/commands.ts` (WARN
  removed). Deleted: `apps/studio/data/{assets.json,build-corpus.mjs}`, `packages/cli/src/corpus-build-check.test.ts`.
