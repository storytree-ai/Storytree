# Census: every reader of `docs/decisions/**` on disk

**Date:** 2026-08-22 · **Increment:** `decision-log-home-arc-inc-02` · **Governing decision:** ADR-0403

This is end-state item 1 of `decision-log-home-arc`: *"A COMPLETE CENSUS OF `docs/decisions/**`
READERS EXISTS AND HAS BEEN WORKED THROUGH — code, scripts, CI, gate rungs and generators. The five
named in the intent are the ones already known, not the list. Nobody migrates against a partial
inventory."* Increments `-inc-03`, `-inc-04` and `-inc-05` are blocked behind it.

**This is NOT the same census as the closed `-inc-01`.** That one asked *"what would leak if we
published"*; it was closed NOT-NEEDED when open-sourcing was deferred. This one asks **"what breaks
if these files stop existing"**. The two lists are easily confused and share almost no rows.

## How to read a verdict

Every entry carries one of three verdicts, and they are about the READER, not about the files:

| Verdict | Meaning |
| --- | --- |
| **MOVES** | Behaviour and contract are unchanged; only the SOURCE swaps from disk to the store. Ideally through `decision-amends-seam.ts` / a store-backed `loadAdrMetas` equivalent, so the call site never learns where the row came from. |
| **CHANGES** | The reader survives but its contract changes materially — it gains a DB dependency, loses a property it advertises today, or its answer becomes different (not merely differently-sourced). Each one is a decision someone has to make, not a mechanical port. |
| **DIES** | The reader stops existing, or stops being needed because the thing it guarded is structurally impossible once decisions are rows. |

## Measurement, taken 2026-08-22 against this checkout and the live store

Numbers here were measured, not recalled. Reproduction commands are in
[§9 Method](#9-method--how-to-re-run-this-census).

- **403 ADR files** under `docs/decisions/` — 356 accepted, 10 proposed, 37 superseded.
  (ADR-0403 and the arc say 391; the log has grown by 12 since 2026-08-21. Any migration script must
  count at run time, never carry 391 or 403 as a constant.)
- **487 `amends` edges** (296 files carry at least one), **37 `supersedes` edges** (22 files).
  Both acyclic; the union is acyclic. Longest `amends` ladder: 13.
- **1,035 decision pointers in the live corpus, in two spellings**, across 1,768 artifacts:

  | Field | `doc:decisions/…` | `doc:docs/decisions/…` | Total |
  | --- | ---: | ---: | ---: |
  | `references` | 624 | 19 | 643 |
  | `dependsOn` | 371 | 19 | 390 |
  | `dischargedBy` | 2 | 0 | 2 |
  | **Total** | **997** | **38** | **1,035** |

> ⚠ **THE ARC'S "371 / 19" IS THE `dependsOn` ROW ONLY — the corpus-wide figure is 997 / 38.**
> ADR-0403 dec 7 and `decision-pointer.ts`'s header both quote 371/19, which is correct for the
> pointer set the cycle census walks and wrong as a migration denominator: it under-counts the real
> exposure by 645 pointers, and it omits `references` entirely — the field the `referential-integrity`
> reader in §6.1 actually reads. Anyone sizing the migration off 390 is sizing it off 38% of it.

## 1. Directory scanners — the fs roots

Everything else in this census either calls one of these or re-implements a slice of it. These are
the five places that actually issue a `readdir`/`readFile` against the tree.

| # | Reader | What it does | Verdict |
| --- | --- | --- | --- |
| 1.1 | [`packages/drive/src/adr-metas.ts`](../../packages/drive/src/adr-metas.ts) — `loadAdrMetas` (:14), `loadTitledAdrMetas` (:48) | **THE canonical scan.** Its own docstring calls it *"the ONE fs scan of `docs/decisions`"*. `loadTitledAdrMetas` additionally extracts the `# ADR-NNNN:` H1. Fail-soft: a missing dir yields `[]`. | **MOVES** — the single highest-value port. Replace the body with a store read and ~9 of the callers below follow for free. |
| 1.2 | [`packages/cli/src/adr.ts`](../../packages/cli/src/adr.ts) — `maxAdrNumber` (:78) | `readdirSync` for the offline `max+1` fallback when the DB allocator is unreachable. | **DIES** — the fallback exists only because the offline path exists. Once numbers live in the same store as the rows, the ADR-0050 allocator is the only path and an offline fallback is a way to mint a duplicate. |
| 1.3 | [`packages/cli/src/adr.ts:298`](../../packages/cli/src/adr.ts:298) — the scaffold `writeFileSync` | `adr new` WRITES `docs/decisions/NNNN-slug.md`. The only writer in this census. | **CHANGES** — becomes a store upsert. Couples to `-inc-04` (the round-trip edit verb): scaffolding a row and then editing it as a file is exactly the ergonomics ADR-0403 dec 9 says must ship WITH the migration. |
| 1.4 | [`packages/cli/src/adr-health.ts`](../../packages/cli/src/adr-health.ts) — `loadRetiredInPartEdges` (:297), `loadDeadAdrLinks` (:339) | Two RAW body scans that deliberately bypass the parser — one hunts the retired `supersedes_in_part` key, one resolves every relative `](NNNN-slug.md)` cross-link between decision bodies. | **1 MOVES / 1 CHANGES** — see §3.1. `loadDeadAdrLinks` is the interesting one: relative markdown links between FILES have no meaning between ROWS. |
| 1.5 | [`apps/studio/server/apiRouter.ts:240`](../../apps/studio/server/apiRouter.ts:240) and [`apps/desktop/src/backend/boot-read-routes.ts:216`](../../apps/desktop/src/backend/boot-read-routes.ts:216) — `listDocs` | Two near-verbatim recursive walks of the whole `docs/` tree, grouping `decisions/`-prefixed ids as the `Decisions` category and serving bodies via `/api/docs/content`. Desktop additionally resolves each ADR's lineage numbers into `doc:decisions/NNNN-slug.md` pointers (:265). | **CHANGES** — they keep walking `docs/` (research notes stay), but the `Decisions` group empties. Both must join the store for that half. These are a **mirror pair** (ADR-0251): fix one, fix both, or `check:mirror-conformance` reds. |

## 2. Parsers

| # | Reader | What it does | Verdict |
| --- | --- | --- | --- |
| 2.1 | [`packages/drive/src/adr-frontmatter.ts`](../../packages/drive/src/adr-frontmatter.ts) — `parseAdrFrontmatter` (:76) | The strict zod schema for `status` / `decided` / `supersedes` / `amends` / `load_bearing` / `arc`. Fail-loud: an unknown key throws, which is what makes `adr-frontmatter` the "deep, un-bypassable floor". | **CHANGES** — the FIELDS survive (ADR-0403 end-state 2 requires it) but YAML frontmatter parsing does not: a row's fields are already typed. The schema becomes the artifact kind's zod shape, and the strictness must be carried over deliberately — a permissive kind schema silently readmits `supersedes_in_part`. |
| 2.2 | [`packages/cli/src/adr-completeness.ts`](../../packages/cli/src/adr-completeness.ts) | Structural completeness of an ADR BODY (Status / Context / Decision / Consequences, and that a declared edge is discussed in prose). The gate-as-proof authoring check. | **MOVES** — it takes `(file, content, edges)` and is pure. Feed it the row's body. |

## 3. Gate rungs and CI

| # | Reader | What it does | Verdict |
| --- | --- | --- | --- |
| 3.1 | **`adr-health`** — [`packages/cli/src/adr-health.ts`](../../packages/cli/src/adr-health.ts), fired against the REAL tree by [`adr-health.test.ts:202-205`](../../packages/cli/src/adr-health.test.ts:202) inside `pnpm -r test` | **The load-bearing gate, and it is TEN checks, not one.** `adr-frontmatter`, `adr-number-unique`, `adr-edge-integrity`, `supersede-consistency`, `supersedes-in-part-retired`, `adr-link-integrity`, `story-decisions`, `green-flip`, `load-bearing-live` (+ `enforced-by-anchors`, WARN). Nine are GATE-class; only `enforced-by-anchors` is WARN. | **MOVES, except two.** `adr-link-integrity` **DIES** (relative file links between rows are meaningless — but see the warning below). `adr-number-unique` **CHANGES**: a UNIQUE constraint on the row's id makes duplicates structurally impossible, so the check stops being a gate and becomes an invariant. |
| 3.2 | **`check:web-grounding`** — [`check-web-grounding.ts:136`](../../packages/cli/src/check-web-grounding.ts:136) | A declared gate rung (`gate-order.ts:202`). Scans the `web/` submodule's copy for ADR citations and fails any that names an ADR *"not in `docs/decisions/`"* or one that is superseded. | **MOVES** — swap `loadAdrMetas` for a store read. ⚠ It becomes the **first gate rung that needs the DB**, on a step that today SKIPs (exit 3) when `web/` is absent. Two different reasons to not-run now overlap; keep them distinguishable in the output or a DB outage will read as the familiar submodule skip. |
| 3.3 | **`scripts/adr-pr-collision-check.sh`** (CI-only, wired at [`ci.yml:127`](../../.github/workflows/ci.yml:127)) | Layer 2 of the ADR-0050 dup-number gate. Greps `gh api` PR file lists for `docs/decisions/[0-9]{4}-` on ADDED files, across all open PRs. | **DIES** — it closes the truly-concurrent two-PR gap, which exists only because a number is claimed by adding a FILE on a branch. A number claimed transactionally in the store is never claimed on a branch. Delete it; do not port it. |
| 3.4 | [`packages/cli/src/ci-affected.ts:127`](../../packages/cli/src/ci-affected.ts:127) — the `docs/decisions/` `ROOT_PATH_READERS` entry | Maps a changed `docs/decisions/**` file to `@storytree/cli` + `@storytree/drive` (ADR-0394, widened by ADR-0399) so a decision edit narrows the gate instead of forcing the full `-r` run. Its reason string records the fs-level probe that established the two readers. | **DIES** — ADR-0403's Consequences already name this: *"A decision edit stops affecting gate scope at all, which is arguably correct — a row edit is not a code change — but it is a behaviour change, not a no-op."* Removing the entry makes `docs/decisions/` fall through to the `docs/` prefix; **confirm that is intended rather than leaving a dead prefix that quietly widens scope.** Fenced by [`ci-affected.test.ts:164`](../../packages/cli/src/ci-affected.test.ts:164), which asserts the longest-prefix rule using this very entry — that test must be re-pointed, not deleted. |
| 3.5 | **`check:mirror-conformance`** — [`check-mirror-conformance.ts:303`](../../packages/cli/src/check-mirror-conformance.ts:303) | Builds a synthetic `docs/decisions/` tree as a FIXTURE (two ADR files, one `arc:`-stamped) to prove the studio and desktop arc-rollup mirrors agree. | **CHANGES** — the fixture must become store rows once the rollup's ADR leg is store-backed, or the check proves agreement on an input neither side reads any more. |

> ⚠ **`adr-link-integrity` dying is a REAL loss, not a clean deletion.** It was added against a
> measured rot class — an ADR is renamed and every sibling linking its old filename silently points
> at nothing (13 dead targets / 24 occurrences, ~5.5% of 234 distinct targets, measured 2026-07-29).
> That rot does not disappear with the files; it moves into the pointer tier, where §6.1 has just
> made four instances of it visible. Rows should cite each other by NUMBER through
> `decision-pointer.ts`, and something should check those resolve — otherwise the migration trades a
> guarded rot class for an unguarded one.

## 4. CLI verbs

| # | Reader | What it does | Verdict |
| --- | --- | --- | --- |
| 4.1 | **`storytree adr list`** (`--load-bearing` / `--current` / `--status`) — [`adr.ts:519`](../../packages/cli/src/adr.ts:519) `loadAdrListings`, wired at [`commands.ts:3548`](../../packages/cli/src/commands.ts:3548) | The orientation surface CLAUDE.md tells every session to calibrate on. Includes the `--load-bearing` ★/☆ closure over `amends` edges. Its help text advertises *"read-only + offline (it reads docs/decisions on disk)"* ([`adr.ts:605`](../../packages/cli/src/adr.ts:605)). | **CHANGES** — this is the named accepted cost. **The offline property dies and the advertised string at `adr.ts:605` and `adr.ts:384` must change with it**, or the command lies about itself. The `--load-bearing` closure is pure graph work over `amends` and must derive the identical set from rows (end-state item 2). |
| 4.2 | **`storytree adr new` / `adr next`** — wired at [`commands.ts:3338`](../../packages/cli/src/commands.ts:3338), [`:3362`](../../packages/cli/src/commands.ts:3362) | Reserves a number from the store (already), then scaffolds the file (1.3). `adr new --decided` sets `accepted` per ADR-0110. | **CHANGES** — see 1.3. Half of it is already store-backed. |
| 4.3 | **`storytree increment check`** — `decisionsSince` at [`commands.ts:3615`](../../packages/cli/src/commands.ts:3615) | The plan-freshness probe (ADR-0183 D2): "which decisions landed since this plan was written?" Calls `loadAdrListings` and filters on `decided`. Best-effort — a throw degrades to "no signal". | **MOVES** — but note the fail-soft: after the migration a DB outage silently answers "no decisions since", which reads as *fresh*. A freshness check that fails toward "fresh" is the wrong direction; make this one fail toward "unknown". |
| 4.4 | **`storytree library --check`** — the `docExists` resolver at [`commands.ts:406`](../../packages/cli/src/commands.ts:406) | Injects an fs resolver rooted at `<repoRoot>/docs` so `referential-integrity` can resolve `doc:` pointers. **The ONLY caller of `libraryHealth` with `docExists`.** An operator report, not a gate — no `check:*` script and no CI job runs it. | **CHANGES** — `doc:` stays the scheme for any repo file (research notes keep resolving on disk), so the resolver must learn to route decision pointers to the store and everything else to disk. See §6.1. |

## 5. The arc surface

| # | Reader | What it does | Verdict |
| --- | --- | --- | --- |
| 5.1 | [`packages/arc/src/arc-rollup.ts:786`](../../packages/arc/src/arc-rollup.ts:786) — `deriveArcRollup`'s ADR leg | Calls `loadTitledAdrMetas(deps.decisionsDir)` and joins on frontmatter `arc:` stamps. This is what renders `## ADRs (derived: frontmatter arc: <id>)` on every `arc show`. | **MOVES** — via 1.1. The `arc:` stamp becomes a field like any other. |
| 5.2 | [`packages/arc/src/arc.ts:60`](../../packages/arc/src/arc.ts:60) / [`arc-rollup.ts:772`](../../packages/arc/src/arc-rollup.ts:772) — `decisionsDir` on `ArcViewDeps` / `ArcRollupDeps` | The injected path. Three production wiring sites: [`commands.ts`](../../packages/cli/src/commands.ts), [`apps/studio/server/apiRouter.ts:1616`](../../apps/studio/server/apiRouter.ts:1616), [`apps/desktop/src/backend/local-backend.ts:403`](../../apps/desktop/src/backend/local-backend.ts:403). | **DIES** — the field itself goes once the rollup reads the store it already holds. All three wiring sites and every test `depsFor` helper follow. |

## 6. Pointer consumers — string-level, no filesystem

These read the `doc:decisions/…` POINTER rather than the directory. They break differently: not with
an error, but with a wrong answer. **All four spelling-sensitive sites are listed here.**

### 6.1 `referential-integrity` — FIXED IN THIS INCREMENT

[`packages/drive/src/health.ts:235`](../../packages/drive/src/health.ts:235) resolved a `doc:` pointer by
passing its payload straight to `docExists`, which is docs-relative. The repo-relative spelling
therefore asked for `docs/docs/decisions/…` and **19 pointers naming files plainly on disk were
reported dangling.** Reproduced live on 2026-08-22 before the fix; verified after it.

**The damage was never the 19.** They were noise a reader learned to skim — and the genuinely
dangling refs sat in the same list. With the spelling resolved, four real breaks became visible that
had been hiding for as long as the bug existed:

| Artifact | Pointer | Actual file |
| --- | --- | --- |
| `plan-uat-criterion-detail` | `…/0055-library-agents-are-seed-canonical-and-sync-to-the-live-store.md` | `0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md` |
| `plan-model-judged-uat` | `…/0020-prove-it-gate-build-the-spine-side-red-green-machine.md` | `0020-red-green-enforcement-on-the-owned-loop.md` |
| `plan-uat-detail-studio` | `…/0082-per-test-uat-attestation-surface.md` | `0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md` |
| `plan-uat-detail-studio` | `…/0070-frontend-builder-two-stage-proof-for-visual-surfaces.md` | `0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md` |

Every one is the ADR-0139 rename rot `adr-link-integrity` guards in ADR bodies and nothing guarded in
the pointer tier — the exact class §3.1 warns is about to become unguarded everywhere. **These four
are data rot, not readers; they are recorded here as a finding and are NOT fixed by this increment.**

Verdict: **CHANGES** — resolution now runs through `parseDecisionPointer`, so post-migration only
that one function needs to learn the store.

### 6.2 Three more single-spelling readers, still carrying the bug

| # | Reader | Consequence today | Verdict |
| --- | --- | --- | --- |
| 6.2a | [`packages/drive/src/oq-gate.ts:35`](../../packages/drive/src/oq-gate.ts:35) — `adrNumberOfRef`, `/^doc:decisions\/(\d{4})-/` | Parses open-question `references` to find which OQs touch a story's deciding ADRs. **`references` is the field carrying 19 repo-relative pointers.** An OQ citing the repo-relative spelling is silently not pulled into the hygiene gate — a gate that fails OPEN and says nothing. This runs on a LIVE story build. | **CHANGES** — must resolve through `decision-pointer.ts`. **Worth fixing before the migration, not during it**: it is wrong today, independently of storage. |
| 6.2b | [`packages/library/src/knowledge-sources.ts:103`](../../packages/library/src/knowledge-sources.ts:103) — `rel.startsWith("decisions/")` | Groups a reference into `Decisions (ADRs)` vs `Docs & references` for the artifact render. Repo-relative pointers render in the wrong group. Cosmetic, but it is a corpus-wide rendering surface. | **CHANGES** — same fix. |
| 6.2c | [`packages/context-traversal-transcript/src/decision-reads.ts:137`](../../packages/context-traversal-transcript/src/decision-reads.ts:137) | **NOT a bug — a deliberate MINT.** It scrapes harness transcripts for decision reads and normalises every observed form to the canonical `doc:decisions/NNNN-slug.md`. Its `DECISION_PATH` regex already accepts `docs/decisions/`, a Windows absolute path and a bare `decisions/`. | **CHANGES** — the transcript route stays valuable (ADR-0403's Consequences: it is the only thing recovering history back to 2026-06-08), but post-migration a decision is read via `storytree library artifact`, already on the recorder's allowlist. |

> The `relId.startsWith('decisions/')` tests in [`apiRouter.ts:190`](../../apps/studio/server/apiRouter.ts:190)
> and [`boot-read-routes.ts:118`](../../apps/desktop/src/backend/boot-read-routes.ts:118) are **NOT** this bug:
> they classify ids produced by their own docs-rooted fs walk, where `decisions/` is the only form
> that can occur. They are in §1.5 instead.

### 6.3 Other pointer consumers

| # | Reader | Verdict |
| --- | --- | --- |
| 6.3a | [`packages/library/src/decision-pointer.ts`](../../packages/library/src/decision-pointer.ts) — `parseDecisionPointer`, `decisionNodeId` | **MOVES (unchanged).** Pure, already both-spelling correct, already the single resolution point. ⚠ Its header quotes 371/19 — correct for `dependsOn`, misleading as a corpus figure (see the measurement warning above). |
| 6.3b | [`packages/library/src/decision-amends-seam.ts`](../../packages/library/src/decision-amends-seam.ts) | **MOVES — and it is the migration's cheapest win.** Built to ADR-0403 dec 3 as an edge-resolution SEAM precisely so storage swaps without touching the walk: `amendsOf` + `decisions`, no edge-type parameter. The store-backed implementation goes here and the depth walk never learns. |
| 6.3c | [`packages/library/src/combined-dag.ts`](../../packages/library/src/combined-dag.ts), [`knowledge-depth.ts`](../../packages/library/src/knowledge-depth.ts) | **MOVES** via 6.3b. `knowledge-depth`'s decision-aware reading is opt-in by design (the parked `traversal-panel-arc` fence) — preserve that. |
| 6.3d | [`commands.ts:1382`](../../packages/cli/src/commands.ts:1382) — `--superseded-by doc:decisions/…` validation on `retire` | **CHANGES** — the accepted pointer form follows whatever the migration settles on. |

## 7. Build drivers, story tier and UI

| # | Reader | What it does | Verdict |
| --- | --- | --- | --- |
| 7.1 | [`packages/drive/src/story-build.ts:218`](../../packages/drive/src/story-build.ts:218), [`:1024`](../../packages/drive/src/story-build.ts:1024) | Two `loadAdrMetas` calls building the ADR context handed to the curation pass. Both already `try`/`catch` to `[]`. | **MOVES** via 1.1. |
| 7.2 | [`packages/drive/src/curate.ts`](../../packages/drive/src/curate.ts) | Renders those `AdrMeta`s into the curator prompt and accepts `supersededBy: "doc:decisions/NNNN-…"` in the curator's JSON output. | **MOVES.** |
| 7.3 | [`packages/orchestrator/src/proof-config.ts:268`](../../packages/orchestrator/src/proof-config.ts:268) — `AUTHORING_DOC_ROOTS = ["stories", "docs"]` | Lets a gate-as-proof authoring node declare a write scope over `docs/decisions/NNNN-slug.md` (ADR-0092 amends ADR-0087). | **CHANGES** — an ADR-authoring node's "source" stops being a file, so a *write scope over a path* stops expressing it. Needs a decision, not a port. `stories/` keeps the root alive either way. |
| 7.4 | [`packages/orchestrator/src/node-spec.ts:64`](../../packages/orchestrator/src/node-spec.ts:64) — story frontmatter `decisions: number[]` | Every story names its deciding ADRs by NUMBER. Resolved against files by `adr-health` check 4 (`loadStoryDecisions`, [`adr-health.ts:377`](../../packages/cli/src/adr-health.ts:377)); surfaced by [`tree-verdicts.ts:229`](../../apps/desktop/src/backend/tree-verdicts.ts:229); consumed by `oq-gate` (6.2a). | **MOVES** — numbers are storage-agnostic; only the RESOLUTION moves. This is the cheapest edge in the census and the easiest to forget. |
| 7.5 | [`apps/studio/src/types.ts:430`](../../apps/studio/src/types.ts:430), [`api.ts:272`](../../apps/studio/src/api.ts:272), [`lib/libraryShelf.ts:71`](../../apps/studio/src/lib/libraryShelf.ts:71) | The studio's read-only `adr` Library category, folded in from `docs/decisions/`. `api.ts:272` names the 76-arc join across the store, `docs/decisions` and `stories/` as the app's heaviest read. `types.ts:243` keeps a hand-copy of `AdrStatus` because the studio is browser-bundled. | **CHANGES** — the category survives and gets CHEAPER (one store instead of a store-plus-two-trees join). The duplicated `AdrStatus` must stay in step with 2.1. |
| 7.6 | [`apps/studio/uat/story-uat.spec.ts:54,66,69,98`](../../apps/studio/uat/story-uat.spec.ts:54) | E2E deep-links `#/doc/decisions%2F0002` and `…%2F0013`. | **CHANGES** — **the route id is E2E API.** No gate rung reads this file's selectors, so a stale route here merges green and fails only in the UAT run. |

## 8. Non-code readers — prose, links and generated views

None of these break a build. All of them become WRONG, silently, and several sit on the session-start
path where a wrong instruction is expensive.

| # | Reader | Count | Verdict |
| --- | --- | --- | --- |
| 8.1 | **ADR → ADR relative links** in decision bodies — `](NNNN-slug.md)` | guarded by `adr-link-integrity` | **CHANGES** — see the §3.1 warning. This is the largest single body of links in the census. |
| 8.2 | **`stories/**` markdown** citing `docs/decisions/…` | **68 files** | **CHANGES** — stories stay on disk; their links go dead. Highest-volume non-code reader. |
| 8.3 | **`docs/research/**`, `infra/*.md`, `README.md`, `apps/studio/README.md`** | 15 files, 23 occurrences | **CHANGES** — mostly historical prose. Per `deleted-file-citation-may-be-accurate-history`, classify by VOICE before rewriting: a note recording what an ADR said at the time is accurate history, not rot. |
| 8.4 | **Generated guidance projections** — `CLAUDE.md` (7), `AGENTS.md` (1), the five `librarian-curator` agent files (2 each), `packages/cli/definitions.generated.json` (1) | 8 files, 19 occurrences | **CHANGES — and NOT by editing these files.** They are generated from live artifacts (ADR-0307). Edit the source artifact and run `pnpm build:guidance && pnpm build:agents`, or `check:guidance` / `check:agents` red. `librarian-curator`'s tool grant explicitly says *"Edit on `docs/decisions/*.md`"* ([`fixture/corpus.ts:386`](../../packages/library/src/fixture/corpus.ts:386) mirrors it) — that grant is wrong the moment the files go. |
| 8.5 | [`repo-manifest.json:39`](../../repo-manifest.json:39) — the `decisions` directory entry | 1 | **DIES** — ⚠ per `deleting-ui-code-can-force-a-story-retirement`, check nothing pins to it before removing the key. |
| 8.6 | [`packages/library/src/templates.ts:53`](../../packages/library/src/templates.ts:53) — `template-adr` | 1 artifact | **CHANGES** — it is a live artifact scaffolding *"a new ADR under `docs/decisions/`"*, and it is the only `template` whose output is a doc rather than a knowledge unit. That distinction dissolves: an ADR becomes an ordinary artifact like the rest. Edit live, then regenerate. |
| 8.7 | [`packages/drive/src/claim-namespace.ts:642`](../../packages/drive/src/claim-namespace.ts:642) | 1 | **CHANGES** — *"the decision log is `docs/decisions/`, governed but never a claimable node"*. The claim rule is right; the location clause stops being. |
| 8.8 | [`packages/cli/src/onboarding.ts:79`](../../packages/cli/src/onboarding.ts:79) | 1 | **CHANGES** — a hard-coded remediation path to ADR-0162. Breaks into a dead pointer handed to a session at its most expensive moment. |
| 8.9 | [`packages/drive/src/coupling-churn.ts:93`](../../packages/drive/src/coupling-churn.ts:93) — the `docs/decisions/` churn channel | 1 | **CHANGES** — reads git LOG paths, not the tree, so it keeps working over history and reports zero new churn afterwards. That zero is a measurement artefact, not a finding; label it or a later reader will conclude decision churn stopped. |
| 8.10 | [`scripts/check-worktree-session-creation.mjs:5`](../../scripts/check-worktree-session-creation.mjs:5) | 1 | **CHANGES** — a comment citing ADR-0389 by path. ⚠ No gate rung parses `.mjs` (`gate-cannot-parse-mjs-so-broken-harnesses-ship`), so nothing will tell you. |

## 8b. Test fixtures that build a fake decision tree

Not readers of the real tree, but they encode its SHAPE and will keep passing while production is
broken — the vacuous-green class. Each must be re-pointed at rows when its subject moves.

`packages/arc/src/arc.test.ts:94` · `arc-rollup.test.ts:217` · `question.test.ts:243` ·
`apps/desktop/src/backend/boot-read-routes.test.ts:112,290` · `local-backend.test.ts:642` ·
`apps/studio/server/arcsApi.integration.test.ts:147,190` · `packages/cli/src/adr.test.ts:282` ·
`gate-as-proof.test.ts:46` · `check-mirror-conformance.ts:97,303`

**Two read the REAL tree and are therefore the migration's tripwires** — expect them to fail FIRST:
[`adr-health.test.ts:202-205`](../../packages/cli/src/adr-health.test.ts:202) (the whole gate, against
`REPO_ROOT/docs/decisions`) and [`ci-affected.test.ts:164`](../../packages/cli/src/ci-affected.test.ts:164)
(the longest-prefix rule, asserted using the `docs/decisions/` entry itself).

## 9. Method — how to re-run this census

Checked by search, not by memory. Every step is reproducible:

```bash
git grep -n "docs/decisions" -- . ':!docs/decisions'
```

- **452 occurrences** outside the log itself, across the file list in §1–§8.
- Cross-referenced files using fs-read APIs against files mentioning `decisions`
  (`comm -12` over two `git grep -l` sets) to find scanners that name the path indirectly.
- Traced every caller of the two fs primitives:
  `git grep -n "loadAdrMetas\|loadTitledAdrMetas\|parseAdrFrontmatter"`.
- Traced every `decisionsDir` injection site, production and test.
- Swept for single-spelling parsers (`startsWith("decisions/")`, `/^doc:decisions\//`) — this is what
  surfaced §6.2a and §6.2b.
- `pnpm probe:adr-graph` for the file/edge/acyclicity counts.
- A direct `events.library_artifact` scan for the per-field pointer-spelling table (§Measurement) —
  walking every string field, so no pointer-bearing field could be missed by assuming which ones exist.
- `pnpm storytree library --check --pg` before and after the §6.1 fix, to reproduce the bug and
  verify it.

## 10. What the arc's "five already known" missed

The intent named five, correctly as a starting point. Measured against this census:

- **All five are real** and appear here as 4.1, 3.1 + 3.3, 3.4, 4.1's closure, and 6.3c's probe family.
- **They are ~5 of ~45 entries.** The largest omitted classes: the **two `listDocs` walkers** (1.5,
  a mirror pair), the **arc surface** (§5, three production wiring sites), **story frontmatter
  `decisions:`** (7.4), the **three additional single-spelling readers** (§6.2), and the **~110
  markdown cross-links** in §8.
- **Two entries in the intent's list turn out to DIE rather than move** — 3.3 and 3.4 — and one
  (3.1's `adr-link-integrity`) dies while leaving its rot class behind.
- **The migration denominator in ADR-0403 dec 7 is 38% of the real one** (997/38, not 371/19).

## References

- [ADR-0403](../decisions/0403-the-decision-log-becomes-ordinary-artifacts-in-postgres-and.md) — the governing decision.
- [ADR-0139](../decisions/0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — correct-in-place; the archive seam ADR-0403 dec 8 amends.
- [ADR-0394](../decisions/0394-a-root-path-with-proven-readers-narrows-the-affected-scope-e.md) — the affected-scope reader map behind §3.4.
- [ADR-0050](../decisions/0050-adr-number-allocation.md) — transactional number allocation; why §3.3 dies.
- `decision-log-home-arc` — end-state item 1.
