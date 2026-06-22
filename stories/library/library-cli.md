---
id: "library-cli"
tier: capability
story: library
title: "The choose-your-own-adventure library CLI"
outcome: "An agent curates library artifacts through guidance-enveloped, --pg-gated commands."
status: mapped
proof_mode: integration-test
depends_on: [event-sourced-store-seam, eager-batch-migrate, seed-corpus-scripts, library-health-gate, library-schema-and-write-validation, migrate-on-write-upcaster]
# ADR-0092 / ADR-0094: a spec-borne dry-run/live `proof:` config over the real packages/cli source (the
# CLI command dispatch), so this capability is single-node `--live`-buildable. The ADR-0092 brownfield
# `real:` arm was REMOVED (ADR-0094 supersedes_in_part 92 d.5): the library is `mapped`, so its green
# path is Adopt (the story's `## Reliability Gates`, ADR-0085), not a fail-closed `--real` Build.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
---

# The choose-your-own-adventure library CLI

**Outcome —** An agent curates library artifacts through guidance-enveloped, `--pg`-gated commands.

*(“Curate” deliberately covers both the read slice — fully `mapped` — and the write slice, which carries several `proposed` branches; the earlier “explores AND authors” phrasing was a banned outcome conjunction that papered over that mapped-vs-proposed seam. See the proof note and open call #4.)*

**Depends on —** [`event-sourced-store-seam`](event-sourced-store-seam.md), [`eager-batch-migrate`](eager-batch-migrate.md), [`seed-corpus-scripts`](seed-corpus-scripts.md), [`library-health-gate`](library-health-gate.md), [`library-schema-and-write-validation`](library-schema-and-write-validation.md), [`migrate-on-write-upcaster`](migrate-on-write-upcaster.md)

> **Proof status (honest) — `mapped` read slice + several `proposed` write/wiring branches.** `packages/cli/src/cli.test.ts` is REAL and passing (part of the `@storytree/cli` suite, which I ran): it drives `run()` exactly as `main` does over a real `InMemoryStore` seeded by the real `loadCorpus`, so the read slice (dashboard/view/list/tree) and the covered write branches are observationally verified — `mapped`, not `healthy` (the prove-it-gate never drove them). HONESTY: these run against an `InMemoryStore`, so the real cross-store `--pg` write contract (`PgLibraryStore`) is NOT exercised offline, and several branches are **would-be** (`proposed`): `--file` reads, malformed-JSON for `new`, whole-doc `--json`/`--file` replace in `edit`, the bad `--set` token, `main`'s `writable=usePg` wiring, and the FAIL/WARN dashboard banner variant (only the OK banner is tested).

## Guidance

The agent-facing surface (ADR-0023): every command returns an `Envelope` (`packages/cli/src/envelope.ts:8-29`) — result + doctrine pointers + next branches — and `run` (`commands.ts:592-682`) NEVER throws on an expected miss (unknown id/category/area => `ok:false` + next).

The code edges justifying the `depends_on`, all real imports at `commands.ts:7-23` + `main.ts:5-14`: `renderStoredDoc` from `@storytree/library/store` (view path, [`eager-batch-migrate`](eager-batch-migrate.md)); `groupSources` + `KIND_SPECS` + `CURRENT_SCHEMA_VERSION` from `@storytree/library` (schema); `upcastAndValidate` from `@storytree/library` on every write (`newArtifact` `commands.ts:334`, `editArtifact` `commands.ts:429` — migrate-on-write); the health helpers from `./health.js` for the dashboard banner (`commands.ts:113-121`) and `--check` (`commands.ts:171-207` — [`library-health-gate`](library-health-gate.md)); and `main.ts` seeds the default offline read store via `loadCorpus` into an `InMemoryStore` (`main.ts:27-29` — [`seed-corpus-scripts`](seed-corpus-scripts.md)) while `--pg` swaps in `PgLibraryStore` (event-sourced-store-seam).

**v1 lineage —** this CLI is the v2 form of V1's `standalone-resilient-library` thin shim (`legacy/Agentic/patterns/standalone-resilient-library.yml`): the CLI parses args, calls the library, and maps the result to an envelope/exit code, with all business logic in `packages/library` (over the `packages/storage-protocol` Store seam) and no inference in the shim. V1 also learned a sharper lesson worth carrying as **input to open call #4** (one CLI capability vs split read/write): its story 8 (CLI wiring) was *folded back* into stories 1 and 3 (`legacy/Agentic/stories/README.md`) after an audit found it had split capabilities along the **library-vs-binary-crate boundary instead of user journeys**, and that story 8 wrongly joined two distinct observables. That lesson cautions AGAINST a library-vs-CLI split for this capability — but read vs write are arguably *distinct user journeys*, which is the axis V1 endorsed splitting on, so the V1 evidence is genuinely two-sided here. The call stays OPEN; this is just the prior art, not a resolution.

READ slice (proven): dashboard / view / list / tree-focus. WRITE slice (proven for the covered branches): `new`/`edit` are `--pg`-gated (`notWritable` guidance, `commands.ts:269-278`) and validate via `upcastAndValidate`; `new` refuses to overwrite (edit-first guardrail), `edit` re-validates and refuses a schema-breaking change without persisting. PROPOSED branches (no test): `--file` reads, malformed-JSON for `new`, whole-doc `--json`/`--file` replace in `edit`, the bad `--set` token, `main`'s `writable=usePg` wiring, and the FAIL/WARN dashboard banner variant (only the OK banner is tested).

## Integration test

**Goal —** Drive `run()` exactly as `main` does, over a real `InMemoryStore` seeded by the real `loadCorpus`, so the dashboard/view/list/tree/write tests exercise the real seeder, the real store seam, the real schema+migrate validators, and the real `renderStoredDoc` together — proving the agent can explore and author the library through the envelope contract.

Real collaborators, no stubs within the organism: `cli.test.ts` (all passing) drives `run()` over a REAL `InMemoryStore` seeded by the REAL `loadCorpus` (`cli.test.ts:16-20`). Read proofs: dashboard reports total+categories with the OK health banner (`cli.test.ts:22-29`), view prints an artifact (`cli.test.ts:31-36`), list returns rows + a doctrine pointer (`cli.test.ts:38-43`), tree-focus surfaces outbound source refs and inbound back-edges (`cli.test.ts:64-81`), and every miss is `ok:false` guidance not a throw (`cli.test.ts:45-62,83-87`). Write proofs (against a writable `InMemoryStore`): a write without `--pg` is refused (`cli.test.ts:98-104`), `new` creates+persists a validated artifact (`cli.test.ts:106-113`), `new` refuses an existing id (`cli.test.ts:115-128`), `new` rejects an invalid doc (`cli.test.ts:130-135`), `edit --set` patches+re-persists (`cli.test.ts:137-147`), `edit` on a missing id is guidance (`cli.test.ts:149-156`), and a schema-breaking edit is refused and not persisted (`cli.test.ts:158-168`).

HONESTY: these run against an `InMemoryStore` — the real cross-store `--pg` write contract (`PgLibraryStore`) is NOT exercised offline; `main`'s `--pg`→writable wiring and several edit/new branches are would-be (`proposed`).

## Contracts (13)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed (ADR-0002). Where a REAL passing test exists, a `proven by` line cites it; otherwise the contract is a would-be test.

1. **`dashboard-maps-artifacts`** — The dashboard reports a total + categories with an OK health banner
   - **asserts —** `run(['library'])` returns `ok:true` with body matching `Library: OK — N artifacts across M categories`, an edit-first pointer, and a `next:` block.
   - **covers —** `packages/cli/src/commands.ts:101-143`
   - **proven by —** `packages/cli/src/cli.test.ts:22-29` (REAL, passing)
2. **`view-prints-artifact`** — artifact <id> prints one artifact with its id and body
   - **asserts —** `run(['library','artifact','edit-first-curation'])` returns `ok:true` with `id: edit-first-curation` and edit text in the body.
   - **covers —** `packages/cli/src/commands.ts:209-245`
   - **proven by —** `packages/cli/src/cli.test.ts:31-36` (REAL, passing)
3. **`list-rows-and-doctrine`** — artifact list <category> returns rows and a doctrine pointer
   - **asserts —** `run(['library','artifact','list','principle'])` returns `ok:true` with a `principle (N)` header and a non-empty doctrine array.
   - **covers —** `packages/cli/src/commands.ts:247-266`
   - **proven by —** `packages/cli/src/cli.test.ts:38-43` (REAL, passing)
4. **`misses-are-guidance`** — Unknown id / category / area are guidance, never a throw
   - **asserts —** An unknown id, unknown category, and unknown top-level area each return `ok:false` with a descriptive body and `next`, no throw.
   - **covers —** `packages/cli/src/commands.ts:210-218,248-257,630-636`
   - **proven by —** `packages/cli/src/cli.test.ts:45-62` (REAL, passing — three sibling assertions folded onto one range)
5. **`tree-focus-edges`** — tree focus renders outbound source refs and inbound back-edges, and guides on a miss
   - **asserts —** `tree focus` surfaces a node's outbound `doc:` source refs and inbound `asset:` back-edges, and on a missing id returns `ok:false` guidance.
   - **covers —** `packages/cli/src/commands.ts:453-514`
   - **proven by —** `packages/cli/src/cli.test.ts:64-87` (REAL, passing — three sibling assertions folded onto one range)
6. **`write-refused-without-pg`** — A write without --pg is refused with --pg guidance
   - **asserts —** `edit` on a non-writable store returns `ok:false` with `writes go to the shared store`.
   - **covers —** `packages/cli/src/commands.ts:269-278,301,368`
   - **proven by —** `packages/cli/src/cli.test.ts:98-104` (REAL, passing)
7. **`new-creates-validated`** — new creates and persists a validated artifact and refuses duplicates and invalid docs
   - **asserts —** `new` on a writable store creates+persists a valid artifact; it refuses an existing id (edit-first); it rejects an invalid doc with the validation message.
   - **covers —** `packages/cli/src/commands.ts:297-355`
   - **proven by —** `packages/cli/src/cli.test.ts:106-135` (REAL, passing — three sibling assertions folded onto one range)
8. **`edit-set-revalidates`** — edit --set patches, re-validates, re-persists, and refuses schema-breaking edits
   - **asserts —** `edit --set` patches a field and re-persists; on a missing id it is guidance; a schema-breaking `--set` is refused and not persisted.
   - **covers —** `packages/cli/src/commands.ts:363-444`
   - **proven by —** `packages/cli/src/cli.test.ts:137-168` (REAL, passing — three sibling assertions folded onto one range)
9. **`envelope-renders-next`** — formatEnvelope always renders a next: block when next is present
   - **asserts —** `formatEnvelope(dashboard envelope)` contains a `\nnext:\n` block.
   - **covers —** `packages/cli/src/envelope.ts:20-29`
   - **proven by —** `packages/cli/src/cli.test.ts:28` (REAL, passing)
10. **`new-reads-file-and-rejects-bad-json`** — new reads --file and rejects malformed JSON
    - **asserts —** `new` with `--file` reads the doc (and returns read-failure guidance on a bad path); `new` with malformed `--json` returns the parse error as guidance.
    - **covers —** `packages/cli/src/commands.ts:303-329`
    - **would-be test —** the `--file` read path and the malformed-JSON branch have no committed assertion.
11. **`edit-whole-doc-replace-and-bad-set`** — edit replaces the whole doc via --json/--file and rejects a malformed --set token
    - **asserts —** `edit` with `--json`/`--file` replaces the whole doc and re-validates; a `--set` token without `=` returns the bad `--set` guidance.
    - **covers —** `packages/cli/src/commands.ts:387-401,417`
    - **would-be test —** the whole-doc replace path and the bad-`--set`-token branch have no committed assertion.
12. **`main-wires-writable-from-pg`** — main wires writable = usePg so the offline default is read-only-by-convention
    - **asserts —** `main` passes `writable=usePg` into `run`, so without `--pg` writes are refused and with `--pg` the `PgLibraryStore` is selected.
    - **covers —** `packages/cli/src/main.ts:34-43`
    - **would-be test —** `main()` is entry-guarded and untested; the `writable=usePg` wiring is verified only by reading the code.
13. **`dashboard-fail-warn-banner`** — The dashboard renders a FAIL/WARN banner from the cheap checks when health is non-green
    - **asserts —** With a non-green cheap health result, the dashboard banner reads `Library: F FAIL, W WARN — run storytree library --check`.
    - **covers —** `packages/cli/src/commands.ts:117-121`
    - **would-be test —** only the OK banner is tested (`cli.test.ts:25`); the FAIL/WARN variant has no committed assertion (the stamped seed is always green).
