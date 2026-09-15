# stories/ — storytree's own story tree (the seed)

This directory is the **seed of the self-building tree**. storytree's north star is to
build itself — agents author, test, and UAT-prove stories on a DAG. There is no
orchestrator or store yet (`packages/core` is a stub), so this first tree is authored
**by hand** — the bootstrap "midwife" step — by decomposing what was really built into
the ADR-0002
work hierarchy. It is a hand-authored **specification of already-built code**, not the
output of a real orchestrator run.

The first story authored was **[`studio/`](studio/story.md)** —
`apps/studio`, decomposed into 7 capabilities and 80 contracts.

> **Reading an ADR referenced here.** Decisions are rows in the shared store, not files (ADR-0403) —
> a bare `ADR-NNNN` is the whole address. Read one with `storytree library artifact adr-NNNN`, or
> list the current set with `storytree adr list --current`.

## The representation

A **file per unit**, as YAML-frontmatter markdown. Frontmatter carries the
identity/graph fields (machine-friendly, schema-ready for `packages/core`); the body
carries the prose proof (human-reviewable, and rendered natively by the studio, which
already reads markdown).

```
stories/
  README.md                          ← this file
  <story-slug>/
    story.md                         ← tier: story   — carries the UAT + lists its capabilities + the dependency graph
    <capability-slug>.md             ← tier: capability — guidance + integration-test proof + its contracts inline (the leaf)
```

Three tiers, one per ADR-0002 grain. **Stories** and **capabilities** each get a file;
**contracts** (the fine leaf — there are 80) live **inline** in their capability file as
a numbered list, each with its single assertion and the real code it covers. Keeping
contracts inline keeps the tree legible (8 files, not 88) while staying fully
ontology-aligned; promoting a contract to its own file later is a mechanical change.

Dependencies are **capability → capability** edges, stored inline as each capability's
`depends_on:` list (the story file also renders the whole graph). Per
ADR-0010 these
within-story edges are **code-derived** — read off the imports/calls between
capabilities (static analysis), not hand-authored from a UAT. A *story* depends on
another only through a **declared, documented cross-story interface** (provisionally
`boundary`/`port`); there is no such edge yet because there is only one story. The graph
is acyclic.

### Field → ADR / glossary mapping

The proof ladder follows ADR-0010
(which amends ADR-0002/0007): UAT at the **story**, integration tests at the
**capability**, the isolated unit test at the **contract**.

| field | where | tier | meaning | source |
|---|---|---|---|---|
| `id` | frontmatter | all | unique slug | glossary *id* |
| `tier` | frontmatter | all | `story` / `capability` / `contract` | ADR-0002 |
| `title` | frontmatter | all | short human label (not load-bearing for proof) | glossary *title* |
| `outcome` | frontmatter | story, capability | one-sentence value statement, **no conjunctions** | glossary *outcome* |
| `status` | frontmatter | story, capability | lifecycle state (enum unchanged — ADR-0010 §Consequences) | glossary *Lifecycle* |
| `proof_mode` | frontmatter | story, capability | the tier's proof: story = `UAT`; capability = `integration-test`; contract = `contract-test` | ADR-0010 (amends ADR-0007) |
| `capabilities` | frontmatter | story | the story's composition (the map grain) | ADR-0002 |
| `depends_on` | frontmatter | capability | **code-derived** within-story upstream edges (static analysis); cross-story coupling is interface-only | ADR-0010 §3, glossary *dependency* |
| **Guidance** | body | capability | non-obvious context to rebuild the unit | glossary *guidance* |
| **UAT** | body | story | prose acceptance walkthrough vs **real** collaborators — the whole organism, end to end | ADR-0010 §2, glossary *UAT* |
| **Integration tests** | body | capability | prove the capability against **real in-story collaborators** (no stubs within the organism) | ADR-0010 §2/§5 |
| **Contracts** | body | capability → contract | the unit-test-proven leaf behaviours | glossary *contract* / *contract test* |
| `asserts` / `covers` | per contract | contract | the single isolated assertion + the real code it tests | ADR-0002, glossary *contract test* |
| `guard-rail` | per contract, optional | contract | declares the contract a guard-rail, so a new test naming it may pass before its implementation exists — see *Declaring a guard-rail* below | ADR-0572 D2, ADR-0573 D1 (C4) |
| `real.cluster` | frontmatter (`proof.real`), optional | any real-buildable unit | two or more of the unit's own contract ids briefed as ONE cluster — their tests written in one slice and implemented together — only on an `editsExisting` unit whose route reports per test; see *Briefing a cluster* below | ADR-0573 D3 (C7) |

### Declaring a guard-rail

ADR-0572 decides that a NEW test which already passes before the implementation it proves exists is
refused at CONFIRM_RED, unless the test names at least one contract (ADR-0122) and every contract it
names declares a **guard-rail**: a property the finished code must keep, which an implementation that
does nothing already satisfies. The refusal is live on a real build whose proof route runs ONE test
file through node:test (the default command, or a declared command over the node's own file), vitest,
or `bun test` (ADR-0573 D3):

- **CONFIRM_RED is observed per test only for `editsExisting` units**, so only they meet the early-pass
  refusal. A net-new unit's red is a file that does not load yet, and such a file reports no test.
- **CONFIRM_GREEN completeness applies to every unit on those routes:** each declared test must report,
  and pass, individually.
- **Whole-package suites and other runners are unchanged**, and never read the declaration.

The declaration is one labelled bullet under the contract, and it has exactly one spelling:

```markdown
1. **`parse-port-accepts-a-valid-port`** — a well-formed port never throws.
   - **asserts —** `parsePort("8080")` returns without throwing.
   - **covers —** `src/parse-port.ts`
   - **guard-rail —** a `parsePort` that does nothing never throws, so this passes before
     implementation; a `parsePort` that throws on every input would fail it.
```

- **The label is the declaration.** The gate reads the label `guard-rail` and requires text after it,
  but never interprets that text. An empty `guard-rail` bullet declares nothing, and neither do
  `guardrail`, `guard rail` or `guard-rails`, which are other labels; the refusal says which it found
  (unhyphenated, `guardrail` is also a Library kind with an unrelated meaning).
- **The text is for the reviewer, in one sentence:** why an implementation that does nothing already
  satisfies the `asserts` sentence, and a plausible WRONG implementation that would fail it. That wrong
  implementation is the guard-rail's real red (ADR-0573 D7); if no plausible wrong implementation
  fails the test, it checks nothing and is not a guard-rail.
- **Write it before the build that tests the contract.** It is the story writer's call, reviewed in a
  pull request (ADR-0572 D2); a build never declares one for its own test.
- **Indent it under its own contract, and nowhere else in `## Contracts`.** The parser attaches every
  bold-led bullet to the numbered item above it, so a stray `guard-rail` bullet after the last contract
  declares that contract.
- **It excuses one thing:** a new test naming the contract that passes at red. The signed verdict
  records every test admitted this way as never observed failing (ADR-0572 D3). A test names every
  contract whose id appears in its title path, `describe` titles included, so a test inside a block
  named for a contract that is not a guard-rail gets no exception: give a guard-rail its own test,
  outside any such block.

### Briefing a cluster

A real build normally writes one test and then the code for it. A unit may instead name a **cluster**:
two or more of its own contracts, whose tests the red author writes in one slice and the green author
implements against together (ADR-0573 D3; `batched-test-authoring-arc`). It is declared in the unit's
`proof.real` block:

```yaml
  real:
    editsExisting: true
    cluster: ["parse-port-refuses-garbage", "parse-port-accepts-a-valid-port"]
```

- **Only where red is observed per test.** The unit must be `editsExisting`, and its proof route must run
  its own test file through node:test, vitest or `bun test` — the routes the early-pass refusal above
  applies on. A net-new or `refactorForTests` unit keeps one test per build, because its test file does
  not load at red: the spec refuses that combination, and a build refuses a cluster on any other route
  before the leaf authors anything.
- **Choose the contracts that share a fixture or seam**, not every contract the unit declares, so one
  test the leaf cannot write does not block the rest.
- **Every contract in the cluster needs a NEW test that names it** and asserts something substantive — a
  full title the test file did not already hold. The gate refuses the red if one is missing (C7), so a
  cluster cannot quietly ship some of its contracts and skip the others. Rewriting an existing test's
  body does not count.
- **A guard-rail is still declared on its own contract** (above). Naming a contract in a cluster does not
  excuse its test from failing at red.
- **Changing a cluster after a failed build is a `changed-input` attempt** (ADR-0563 D4): drop the
  contract whose test cannot be written, or split the cluster, then re-run.
- **Absent, nothing changes:** the briefs keep their exact wording, and the build writes one test.

### The proof-mode boundary (the rule that tiers a unit)

Per ADR-0010 the proof ladder shifts up one rung: a clean pyramid bounded by the organism —
**unit (contract) → integration (capability) → acceptance/UAT (story)**.

- **story** — a **bounded context** (organism); proven by ≥1 integrated **UAT**, an
  acceptance walkthrough against **real** collaborators (the whole organism, end to end).
  The UAT lives here, not at the capability.
- **capability** — independently viable; proven by ≥1 **integration test** against **real
  in-story collaborators** (no stubs within the organism). The within-story dependency
  edges (code-derived) are drawn between capabilities.
- **contract** — one **isolated automated test** (collaborators stubbed); no walkable
  journey of its own.

## Continuity with v1 (the Agentic corpus)

storytree v2 reshapes v1's two-tier `epic → story` into three tiers, and this seed reuses
v1's proven on-disk vocabulary so the lineage stays legible:

| v1 (`C:\code\Agentic`) | here (v2) |
|---|---|
| `epics/live/<slug>/epic.yml` (groups stories) | a **story** (`story.md`) — the map grain |
| `stories/<id>.yml` (UAT-proven unit) | a **capability** (`<slug>.md`) |
| `acceptance.tests[]` (test file + justification) | a **contract** (unit leaf) + the capability's **integration tests** |
| `acceptance.uat` (prose walkthrough) | the **story's UAT** section (moved up a rung — ADR-0010 §2) |
| `depends_on: [ids]` (inline, acyclic) | `depends_on:` (inline, acyclic) — now **code-derived** within-story edges (ADR-0010 §3) |
| `outcome` / `status` / `guidance` | same field names |

**Deliberately *not* carried** (these are orchestrator / event-store concerns, not a
hand-authored seed's): the verdict database, `evidence/runs/*.jsonl`, `channels/`,
`also_owns` / `build_config` / `patterns` machinery, and signer identity. **Deliberately
changed:** pure-YAML → frontmatter-markdown (the studio renders markdown; UAT/guidance
are prose-first), and contracts are promoted from anonymous test entries to a **named
leaf tier**.

## Honest proof posture

`apps/studio` was built directly, by hand. It **runs** (`pnpm --filter studio dev`) but
has **no automated test suite and no scripted UAT** (`package.json` defines only
dev/build/preview/typecheck; there are zero `*.test`/`*.spec` files). So every unit here
is a **retrospective spec**: contracts describe the isolated unit tests that *would* prove
each behaviour (citing real code at `file:line`); capabilities describe the integration
tests that *would* prove them against real in-story collaborators; and the would-be UAT is
a **story-level** acceptance walkthrough that *would* prove the organism end to end. Every
unit is `status: proposed`. **Nothing here is `healthy` or `mapped`** — none of it has
earned on-disk evidence through storytree's prove-it gate.

## Open modeling calls (for the owner)

Surfaced rather than guessed — these are load-bearing and easy to revise (the
representation is plain files).

1. **Lifecycle status for retro-authored specs over built code (the big one). — RESOLVED
   (owner, 2026-06-06).** The question was whether the status enum needs a tier between
   `proposed` and `healthy` — e.g. `built-unproven` / `observed` — to honestly describe
   working-but-unproven code (`proposed` undersells the built/running code; `mapped` means
   *verified by an existing test suite* — there is none; `healthy` is out, no earned
   evidence). **Decision:** `proposed` **stays; no new tier** — this is the experimentation
   stage, paired with an honest per-unit proof note (see ADR-0010 §Consequences). Kept here
   for the record.

2. **`resolve-comment` — own capability, or fold into `annotate-topic`? — RESOLVED
   (owner, 2026-06-06): keep separate, no edge.** It is a distinct verb with a genuine
   multi-surface propagation walk (header badge, row pill, hide-resolved toggle, section
   badge, gutter tick, sidebar count, on-disk `resolvedAt`). Its integration test renders a
   corpus doc for two of those surfaces, but that does **not** create a
   `resolve-comment → read-corpus` edge: edges track code coupling (ADR-0010 §3) and a test
   may exercise any real in-story collaborator as scaffolding (ADR-0010 §5). The wider
   test-collaborator surface is correct, not a missing edge.
   **⚠ OVERTAKEN 2026-08-31 (`prove-unproven-capabilities-arc` inc-25):** `resolve-comment` is now
   `status: retired` and off the `studio` story's capability list. ADR-0425 dec 1 retired studio
   commenting deliberately, MULTIPLAYER named as the revival trigger, and every surface this entry's
   propagation walk names — `CommentPanel`, `useAnnotations`, `annotate.ts` — is deleted. The
   2026-06-06 call above was right when it was made and is kept as the record of it; the
   keep-separate/no-edge reasoning is still the reusable part.

3. **`seed-library-corpus` — capability, or a contract-cluster?** Its honest proof is
   largely one observable effect (the written `assets.json` — since retired, ADR-0210), which smells contract-ish,
   but it is a self-contained runnable journey with real branches (no-clobber vs
   `--force`, glossary extraction, dup-slug skip) against real collaborators (the `docs/`
   tree). *Recommendation:* **keep as a capability** — it has a genuine build-time
   walkthrough that needs no app running, and it is the data-provenance root the two
   Library capabilities depend on.
   **⚠ OVERTAKEN 2026-08-31 (`prove-unproven-capabilities-arc` inc-25):** `seed-library-corpus` is
   now `status: retired` and off the `studio` story's capability list — so the recommendation above
   no longer describes a live unit. Not because the tier call was wrong, but because the SUBJECT is
   gone: the seeder, both of its inputs (`docs/glossary.md` at ADR-0135, `docs/decisions/` at
   ADR-0403 dec 1) and its output file are all deleted, and artifacts are written straight to the
   live store, so there is no build-time derivation step left to be a capability OR a
   contract-cluster. The `browse-library` data-provenance edge went with it.

4. **Client platform substrate — promote to a capability?** The app bootstrap +
   `AppDataContext` + hash router (`App.tsx`, `lib/appData.ts`, `lib/route.ts`) is
   load-bearing but has no goal distinct from "the app loads the corpus". *Default:*
   folded as shared substrate across the read/browse capabilities. Promote it to a named
   upstream capability only if you want "the SPA loads the corpus into one typed context"
   to be its own provable unit.

5. **Lower-stakes notes.** *(a)* The **taxonomy** (a closed 7-category schema —
   `definition`, `principle`, `pattern`, `guardrail`, `techstack`, `template`, `adr`; six
   populated by the seed, `adr` defined-but-unseeded) is modeled as a closed schema folded
   into `browse-library` (with one drift-guard contract asserting the server vs `types.ts`
   lists match), not its own unit — a taxonomy has no end-to-end walk; it could
   alternatively be a `definition` artifact. NOTE (owner, 2026-06-06): `template` is a real,
   seeded category (6 scaffolds), but per-category template ENFORCEMENT is not yet worked
   through. *(b)* `GuidanceAsset` is still
   a *live proposal* for the parked open-questions §9 knowledge tier, so the three Library
   capabilities sit on a model that isn't ratified yet. *(c)* The `slugify` parity
   invariant is asserted in two capabilities (`read-corpus`, `annotate-topic`); it could
   become one shared contract owned by `read-corpus`. *(d)* The whole story is **dev-only**
   (`vite build` is a static SPA with no `/api`); confirm that scope.

## How this was produced

A multi-agent **workflow** decomposed `apps/studio`: 5 readers proposed candidate
capabilities from different slices → a synthesis step deduped them into one coherent
story → one agent per capability decomposed it into contracts + a minimal walkthrough → an
assembly step finalized the dependency edges (since reframed by ADR-0010 as code-derived
within-story edges, with the acceptance walkthrough folded up to a single story-level UAT)
→ an adversarial **tier-audit**
(one auditor per capability) tried to falsify every story/capability/contract boundary
call against the proof-mode rule. Two errors the audit caught were corrected in this seed
(a contract miscount in `browse-library`; the dup-slug explanation in
`seed-library-corpus`). Every cited `file:line` was verified against the real code.

It is **lean and reversible** by design: plain files, no tooling, no schema lock-in yet.
Merging/splitting a unit, renaming a status, or promoting contracts to their own files
are all mechanical edits.
