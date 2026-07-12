---
id: "library-adr-wire-signals"
tier: capability
story: library-tech-tree-overlay
title: "Each ADR's load_bearing boolean + its outbound decision-lineage edge NUMBERS onto the studio wire — a pure, tolerant flat-scan frontmatter parser mirroring parseDocStatus; MACHINE-ONLY, no look leg"
outcome: "Every ADR's `load_bearing` frontmatter boolean and its outbound decision-lineage edges (the ADR numbers in `supersedes` / `supersedes_in_part` / `amends`) land on the studio wire via a new pure module `apps/studio/server/adrWireSignals.ts` exporting `parseAdrWireSignals(filename, raw) -> { loadBearing, edges }` — a tiny, dependency-free, TOLERANT flat line-scan of the leading YAML frontmatter block (mirroring the existing `parseDocStatus` precedent), emitting ADR NUMBERS ONLY and returning the safe empty result `{loadBearing:false, edges:[]}` on a non-ADR filename / missing / unterminated block / absent fields, NEVER throwing. This is INVISIBLE PLUMBING — pure data on the wire with NO look leg and NO operator-attested UAT leg; nothing renders differently until a later increment consumes it. Its load_bearing read, its edge-set union, its leaf-ADR emptiness, and its tolerance are all machine-witnessed."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [187, 185, 86, 161, 122]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest test
# importing a NOT-YET-EXISTING pure module (apps/studio/server/adrWireSignals.ts) — red = module-not-found at
# HEAD, then writes it (green). The clean red→green heart is the PURE parseAdrWireSignals(filename, raw)
# function: a tolerant flat line-scan of the leading YAML frontmatter block that (a) reads `load_bearing: true`
# → loadBearing:true; (b) collects the ADR NUMBERS from the `supersedes`/`supersedes_in_part`/`amends`
# frontmatter arrays into a deduped edge set; (c) returns the safe empty result on a non-ADR filename /
# missing / unterminated block / absent fields, NEVER throwing. It mirrors the EXISTING `parseDocStatus`
# precedent in apps/studio/server/apiRouter.ts — dependency-free, NO import of the CLI's
# parseAdrFrontmatter/yaml/zod (the frontmatter is CI-validated by adr-health, so a flat scan suffices).
# MACHINE-ONLY: this cap is pure data on the wire — NO look leg, NO operator-attested UAT leg (contrast the
# sibling library-overview whose appearance is UAT leg 5; this one has NONE). The number→doc:decisions/
# NNNN-slug.md resolution + the DocMeta fold in apiRouter.ts listDocs + the types.ts DocMeta.loadBearing?/
# references? additions are AFTER-PASS SUPPLEMENT GLUE, explicitly OUT of the leaf's `real:` scope (which is
# the ONE NEW file only) — the leaf must NOT edit apiRouter.ts, types.ts, or any signed inc-1..5 source.
#
# CRITICAL — apps/studio is VITEST, and the server dir IS part of the studio package: the docStatus.test.ts
# precedent proves a server-dir `.test.ts` is picked up by apps/studio/vitest.config.ts (include
# server/**/*.test.ts) — server-only pure logic needs NO jsdom, no .tsx. So this cap declares a
# real.proofCommand running the ONE test file under vitest (cwd = apps/studio, path server/adrWireSignals.test.ts).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `laws-`-named contract test
# lives in this ONE file (apps/studio/server/adrWireSignals.test.ts), importing the pure module by the
# relative specifier `./adrWireSignals.js`.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/server/**/*.test.ts", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/server/**/*.ts", "apps/studio/src/**/*.ts"]
  real:
    testFile: "apps/studio/server/adrWireSignals.test.ts"
    sourceFile: "apps/studio/server/adrWireSignals.ts"
    scope:
      testGlobs: ["apps/studio/server/adrWireSignals.test.ts"]
      sourceGlobs: ["apps/studio/server/adrWireSignals.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest, not node:test — run the ONE test file under vitest (cwd = apps/studio).
    proofCommand:
      file: pnpm
      args: ["--filter", "studio", "exec", "vitest", "run", "server/adrWireSignals.test.ts"]
---

# The ADR wire signals — load_bearing + decision-lineage edges onto the wire (machine-only plumbing)

**Outcome —** Every ADR's `load_bearing` frontmatter boolean and its outbound decision-lineage edges (the ADR
NUMBERS in `supersedes` / `supersedes_in_part` / `amends`) land on the studio wire via a new pure module
`apps/studio/server/adrWireSignals.ts` exporting `parseAdrWireSignals(filename, raw) -> { loadBearing: boolean;
edges: number[] }`. It is a tiny, dependency-free, TOLERANT flat line-scan of the leading YAML frontmatter
block — mirroring the existing `parseDocStatus` precedent in `apps/studio/server/apiRouter.ts` — that (a) reads
`load_bearing: true` → `loadBearing: true`; (b) collects the ADR numbers from the `supersedes` /
`supersedes_in_part` / `amends` frontmatter arrays into a deduped edge set; (c) returns the safe empty result
`{ loadBearing: false, edges: [] }` on a non-ADR filename / missing / unterminated block / absent fields, and
NEVER throws. The parser emits ADR **NUMBERS ONLY**. This is **INVISIBLE PLUMBING** — pure data on the wire
with **NO look leg** and **NO operator-attested UAT leg**; nothing renders differently until a later increment
consumes it. Its `load_bearing` read, its edge-set union, its leaf-ADR emptiness, and its tolerance are all
machine-witnessed.

**Depends on —** [`library-finder`](library-finder.md). This is the arc's shared foundational SEQUENCING
anchor that every sibling increment cites — not a hard code edge. `parseAdrWireSignals` is a standalone pure
function over a filename + raw ADR text; it imports nothing from the finder. The `depends_on` records the
increment's place in the `library-tech-tree-overlay` arc ordering (the finder established the studio's library
backend seam these overlay increments extend), consistent with how increments 3, 4, and 5 anchored on the same
finder. This capability's `real:` red→green surface is ONE NEW pure file only — it reads only its two arguments
(`filename`, `raw`) and holds no backend seam, no fetch, no DB.

> **Proof status (honest) — `proposed`, NET-NEW.** `apps/studio/server/adrWireSignals.ts` does not exist at
> HEAD, and neither does the test file `apps/studio/server/adrWireSignals.test.ts`. This capability authors
> them test-first: a new vitest test drives the pure `parseAdrWireSignals` function (the load_bearing read, the
> edge-set union over the three lineage arrays, the leaf-ADR emptiness, and the tolerant empty on
> non-ADR/malformed input), RED at HEAD (module-not-found), GREEN once the module is written. The whole cap is
> machine-witnessed — there is NO look leg and NO operator-attested UAT leg this increment (contrast the
> sibling `library-overview`, whose appearance is the story's UAT leg 5; this one has none — it is invisible
> plumbing). Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never
> authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the WIRE-SIGNAL PARSER AS A WHOLE — a pure,
tolerant frontmatter scan that spans the `load_bearing` boolean read, the deduped edge-set union over three
distinct lineage arrays, the leaf-ADR (no-lineage) emptiness, and the never-throw tolerance across non-ADR /
missing / unterminated / absent-field inputs. That is a coherent behavioural surface (5 contracts) proven by a
single parser, not a single assertion. The number→id resolution + the DocMeta fold that make these signals
CONSUMABLE are a later increment's / the after-pass glue's job, gated on this parser.

MACHINE-ONLY — THERE IS NO LOOK LEG. This capability puts pure DATA on the wire. Unlike the sibling
`library-overview` (whose dot-field appearance is the story's operator-attested UAT leg 5), this increment has
**NO appearance to witness and NO operator-attested UAT leg**. Nothing renders differently when it lands — the
signals sit on `DocMeta` waiting for a later increment to draw with them (size/colour = load_bearing, edges =
the tech-tree lineage lines, per ADR-0187). Do NOT author any visual / colour / stroke / pixel / animation
assertion, and do NOT frame any part of this as owner-witnessed — the whole proof is machine-witnessed pure
logic.

MIRROR `parseDocStatus`, DON'T IMPORT THE CLI'S PARSER (the tolerance precedent). `apps/studio/server/
apiRouter.ts` already carries `parseDocStatus` — a tiny, dependency-free, TOLERANT flat line-scan of the
leading YAML frontmatter block that never throws and returns a safe default on anything malformed.
`parseAdrWireSignals` mirrors that exact idiom: scan the leading `---`-delimited frontmatter block line by
line, read the fields it needs, and return a safe empty result on any shape it does not recognise. It must NOT
import the CLI's `parseAdrFrontmatter`, nor a yaml parser, nor zod — the ADR frontmatter is CI-validated by
`adr-health`, so a flat scan is sufficient and keeps this module dependency-free and browser-trivial. The
module reads only its two arguments; it fetches nothing and touches no corpus.

THE PURE HEART — `parseAdrWireSignals(filename, raw) -> { loadBearing, edges }` (the clean red→green core). A
new module `apps/studio/server/adrWireSignals.ts` exporting the single pure function that is the leaf's
red→green heart (all 5 `laws-` contracts assert it directly; they live in the ONE test file and import it by
`./adrWireSignals.js`):

- **`loadBearing`** — `true` iff the leading frontmatter block carries `load_bearing: true`; a missing tag or
  `load_bearing: false` yields `false`.
- **`edges`** — the deduped UNION of the ADR NUMBERS listed in the `supersedes`, `supersedes_in_part`, and
  `amends` frontmatter arrays. NUMBERS ONLY (no `doc:` prefix, no slug) — the number→id resolution is
  after-pass glue, not this function. Note `supersedes_in_part` was RETIRED by ADR-0139 so it rarely appears —
  be tolerant if it does; a leaf ADR with none of the three fields yields an EMPTY edge set (no phantom edges).
- **tolerance** — a non-ADR filename, a missing or unterminated frontmatter block, or absent fields yields the
  safe empty result `{ loadBearing: false, edges: [] }` and NEVER throws (the `parseDocStatus` tolerance
  contract).

This function is the leaf's entire red→green surface. It fetches nothing — it reads only `filename` and `raw`.

NUMBERS ONLY — THE RESOLUTION + THE FOLD ARE AFTER-PASS SUPPLEMENT GLUE, OUT OF THE `real:` SCOPE. The pure
parser emits ADR NUMBERS ONLY so the unit stays corpus-independent (it never needs to know the slug for ADR
NNNN). The number→`doc:decisions/NNNN-slug.md` resolution and the fold of `{ loadBearing, edges }` into each
ADR's `DocMeta` happen AFTER this leaf's PASS, in `apiRouter.ts` `listDocs`, together with the `types.ts`
`DocMeta.loadBearing?` / `references?` additions. Those edits are the orchestrator's SUPPLEMENT GLUE — they are
explicitly OUT of the leaf's `real:` scope (which is the ONE NEW file `apps/studio/server/adrWireSignals.ts`
only). The leaf must NOT edit `apiRouter.ts`, `types.ts`, or any signed inc-1..5 source — it proves the parser
in isolation, driven by literal `(filename, raw)` fixtures. Do NOT put the resolution or the DocMeta fold in
this capability's contracts.

COVERAGE — EVERY `laws-` TEST TITLE CARRIES A UNIQUE ID (the coverage-drop trap). Per ADR-0122, `storytree
coverage` scans ONLY `real.testFile`, so all 5 `laws-` contract tests live in the ONE file
`apps/studio/server/adrWireSignals.test.ts`, each an isolated vitest `it(...)` whose title LEADS with its
unique contract id. **Trap:** if two test titles share (or drop) a contract id, coverage silently reports
N-1/N — the recurring `friction-leaf-duplicate-contract-id-silently-drops-coverage` /
`sdk-leaf-drops-contract-id-test-names` class. The fix is TEST-TITLE-ONLY: give each of the 5 `it(...)` a
distinct title leading with its `laws-…` id, so coverage reports 5/5.

OFFLINE-TESTABLE, SERVER-DIR VITEST (no jsdom, no .tsx). The server dir IS part of the studio package: the
`docStatus.test.ts` precedent proves a `server/**/*.test.ts` file is picked up by `apps/studio/vitest.config.ts`
(`include server/**/*.test.ts`). `parseAdrWireSignals` is server-only pure logic — a plain vitest test over
literal string fixtures, NO jsdom, NO `@testing-library/react`, NO real `fetch`/`docContent`/socket/DB/Electron.
The test imports the pure module by the relative specifier `./adrWireSignals.js`.

## Integration test

**Goal —** Prove the ADR wire-signal parser: `parseAdrWireSignals(filename, raw)` reads `load_bearing: true` →
`loadBearing: true` (absent / `false` → `false`), collects the deduped UNION of ADR numbers across the
`supersedes` / `supersedes_in_part` / `amends` arrays into `edges` (numbers only), yields an EMPTY edge set for
a leaf ADR with none of those fields, and returns the safe empty result `{ loadBearing: false, edges: [] }` —
never throwing — on a non-ADR filename / missing / unterminated block / absent fields. Entirely pure, over
literal `(filename, raw)` fixtures, under vitest.

The integration test exercises this capability against its own composition (no backend seam) — the pure parser
is the whole surface. It would:

1. Call `parseAdrWireSignals` with an ADR frontmatter carrying `load_bearing: true` and assert
   `loadBearing === true`; call it with one carrying `load_bearing: false` (and one with the tag absent) and
   assert `loadBearing === false`.
2. Call it with an ADR carrying `supersedes` / `amends` (and, tolerantly, `supersedes_in_part`) arrays and
   assert `edges` is the deduped UNION of the ADR NUMBERS across those arrays (e.g. `amends: [84, 37]` → `edges`
   includes 84 and 37), with no duplicates.
3. Call it with a leaf ADR carrying NONE of the three lineage fields and assert `edges` is EMPTY (no phantom
   edges).
4. Call it with a non-ADR filename, then with a missing frontmatter block, an unterminated block, and
   absent fields — asserting each returns `{ loadBearing: false, edges: [] }` and that the call NEVER throws.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest,
`apps/studio/server/adrWireSignals.test.ts`, importing the pure module by `./adrWireSignals.js`). Per ADR-0122
(`storytree coverage`) each contract id is the lead of a distinctly-named test, so the coverage check reports
5/5 against the ONE `real.testFile`. None of these is an APPEARANCE assertion — this capability is machine-only
plumbing with NO look leg and NO operator-attested UAT leg.

1. **`laws-load-bearing-tag-true-when-present`** — a `load_bearing: true` frontmatter tag yields `loadBearing: true`
   - **asserts —** `parseAdrWireSignals(filename, raw)` over an ADR whose leading frontmatter carries
     `load_bearing: true` returns `loadBearing === true`.
   - **covers —** `apps/studio/server/adrWireSignals.ts` (the `load_bearing` boolean read)
   - **proven by —** `apps/studio/server/adrWireSignals.test.ts` (net-new, vitest; imports `parseAdrWireSignals`).
2. **`laws-load-bearing-defaults-false-when-absent`** — no tag (or `load_bearing: false`) yields `loadBearing: false`
   - **asserts —** an ADR whose frontmatter has no `load_bearing` tag (or `load_bearing: false`) returns
     `loadBearing === false` — the default, never a phantom true.
   - **covers —** `apps/studio/server/adrWireSignals.ts` (the `load_bearing` default / false read)
   - **proven by —** `apps/studio/server/adrWireSignals.test.ts`.
3. **`laws-outbound-edges-union-supersedes-amends`** — the edge set is the deduped UNION of the ADR numbers in `supersedes`, `supersedes_in_part`, and `amends`
   - **asserts —** `edges` is the deduped UNION of the ADR NUMBERS listed across the `supersedes`,
     `supersedes_in_part`, and `amends` frontmatter arrays (e.g. `amends: [84, 37]` → `edges` includes 84 and
     37); numbers only (no `doc:` prefix / slug), no duplicates across the three arrays.
   - **covers —** `apps/studio/server/adrWireSignals.ts` (the deduped edge-number union over the three lineage arrays)
   - **proven by —** `apps/studio/server/adrWireSignals.test.ts`.
4. **`laws-edges-empty-when-no-lineage-fields`** — a leaf ADR with none of the three edge fields yields an EMPTY edge set
   - **asserts —** an ADR carrying NONE of `supersedes` / `supersedes_in_part` / `amends` returns an EMPTY
     `edges` array — no phantom edges invented for a leaf ADR.
   - **covers —** `apps/studio/server/adrWireSignals.ts` (the leaf-ADR empty edge set)
   - **proven by —** `apps/studio/server/adrWireSignals.test.ts`.
5. **`laws-tolerant-empty-on-non-adr-or-malformed`** — a non-ADR filename / missing / unterminated block / absent fields yields `{loadBearing:false, edges:[]}` and NEVER throws
   - **asserts —** a non-ADR filename, a missing frontmatter block, an unterminated frontmatter block, or
     absent fields each yields the safe empty result `{ loadBearing: false, edges: [] }` and the call NEVER
     throws — the `parseDocStatus` tolerance contract.
   - **covers —** `apps/studio/server/adrWireSignals.ts` (the tolerant safe-empty / never-throw guard)
   - **proven by —** `apps/studio/server/adrWireSignals.test.ts`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the ADR wire-signal parser as a new pure
module, test-first.

- **The new test —** `apps/studio/server/adrWireSignals.test.ts` (vitest — the studio package convention; the
  `docStatus.test.ts` shape for a server-dir pure test; NO jsdom, NO `.tsx`, NO real
  `fetch`/`docContent`/socket/DB/Electron). Import `{ parseAdrWireSignals }` from `"./adrWireSignals.js"`. Name
  each test for its contract id (`laws-…`) so `storytree coverage library-adr-wire-signals` reports 5/5
  (ADR-0122) — all 5 contracts live in THIS one file, since coverage scans only `real.testFile`.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `apps/studio/server/adrWireSignals.ts` does not exist at HEAD, so the test fails module-not-found (the
  net-new missing-symbol red, ADR-0057).
- **The GREEN —** write the one module. `apps/studio/server/adrWireSignals.ts`: the pure
  `parseAdrWireSignals(filename, raw) -> { loadBearing: boolean; edges: number[] }` — a tolerant flat line-scan
  of the leading `---`-delimited frontmatter block that reads `load_bearing: true` → `loadBearing:true`,
  collects the deduped union of ADR numbers from the `supersedes` / `supersedes_in_part` / `amends` arrays into
  `edges`, and returns `{ loadBearing: false, edges: [] }` on a non-ADR filename / missing / unterminated block
  / absent fields, NEVER throwing — mirroring the `parseDocStatus` idiom, dependency-free (NO
  `parseAdrFrontmatter`/yaml/zod import). After it, the import resolves, the assertions hold, and
  `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green.

The number→`doc:decisions/NNNN-slug.md` resolution + the DocMeta fold in `apiRouter.ts` `listDocs` + the
`types.ts` `DocMeta.loadBearing?` / `references?` additions are AFTER-PASS SUPPLEMENT GLUE — explicitly OUT of
the leaf's `real:` scope (which is the ONE NEW file only). The leaf must NOT edit `apiRouter.ts`, `types.ts`,
or any signed inc-1..5 source; it proves the parser in isolation over literal fixtures.

Rules:

- **Mirror `parseDocStatus`, don't import the CLI parser** — a tiny, dependency-free, TOLERANT flat line-scan
  of the leading frontmatter block; NO `parseAdrFrontmatter`/yaml/zod (the frontmatter is CI-validated by
  `adr-health`, so a flat scan suffices) (`laws-tolerant-empty-on-non-adr-or-malformed`).
- **`load_bearing` is a boolean read, defaulting false** — `load_bearing: true` → `loadBearing:true`; absent or
  `false` → `false`, never a phantom true (`laws-load-bearing-tag-true-when-present`,
  `laws-load-bearing-defaults-false-when-absent`).
- **Edges are the deduped union of ADR NUMBERS over three arrays** — `supersedes` ∪ `supersedes_in_part` ∪
  `amends`, numbers only (no `doc:` prefix / slug), deduped; `supersedes_in_part` is retired (ADR-0139) so it
  rarely appears — be tolerant if it does (`laws-outbound-edges-union-supersedes-amends`).
- **A leaf ADR has no edges** — none of the three lineage fields → an EMPTY edge set, no phantom edges
  (`laws-edges-empty-when-no-lineage-fields`).
- **Tolerant + never throws** — a non-ADR filename / missing / unterminated block / absent fields → the safe
  empty result `{ loadBearing: false, edges: [] }`, never an exception
  (`laws-tolerant-empty-on-non-adr-or-malformed`).
- **NUMBERS ONLY — resolution + fold are after-pass glue, out of the `real:` scope** — the parser emits ADR
  numbers only so the unit stays corpus-independent; the number→id resolution + the DocMeta fold in
  `apiRouter.ts` + the `types.ts` `DocMeta` additions are the orchestrator's supplement glue after PASS — the
  leaf must NOT edit `apiRouter.ts`, `types.ts`, or any signed inc-1..5 source.
- **Machine-only — no look leg, no operator-attested UAT leg** — this capability is pure data on the wire;
  nothing renders differently until a later increment consumes it. Do NOT author a visual / colour / stroke /
  pixel / animation assertion, and do NOT frame any part of it as owner-witnessed (contrast the sibling
  `library-overview`, whose appearance is UAT leg 5 — this one has none). The whole proof is machine-witnessed
  pure logic.
- **Every `laws-` test title carries a unique id** — coverage scans only `real.testFile` and silently drops
  N-1/N on a shared/dropped id (`friction-leaf-duplicate-contract-id-silently-drops-coverage` /
  `sdk-leaf-drops-contract-id-test-names`); the fix is TEST-TITLE-ONLY — 5 distinctly-titled `it(...)`, each
  leading with its `laws-…` id, so coverage reports 5/5.
