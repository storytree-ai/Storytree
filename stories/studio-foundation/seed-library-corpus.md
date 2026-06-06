---
id: "seed-library-corpus"
tier: capability
story: studio-foundation
title: "Seed the Library corpus from the ADRs and glossary"
outcome: "Running the seeder produces the categorised, ADR-cited starter corpus the Library serves."
status: "proposed"
proof_mode: "integration-test"
depends_on: []
---

# Seed the Library corpus from the ADRs and glossary

**Outcome —** Running the seeder produces the categorised, ADR-cited starter corpus the Library serves.

**Depends on —** *(none — a root capability)*

> **Proof status (honest) —** Code exists and runs today, and is the lone studio unit whose proof is AUTOMATABLE NOW. seed.assets.mjs executes under `node apps/studio/data/seed.assets.mjs` and produces apps/studio/data/assets.json; the committed output is verified to match the spec — 88 artifacts, split {definition:54,pattern:11,guardrail:8,principle:5,techstack:4,template:6}, 81 of 88 with >=1 reference (the 7 without are edit-first-curation + the 6 template scaffolds), all references doc:-prefixed, four dup-slug glossary blocks skipped (proof mode/prove-it-gate/deep-modules/standalone-resilient-library), term-map table excluded, per-mention ADR refs present (e.g. 'node' cites ADR-0004 + ADR-0009). HOWEVER there is NO automated test and NO scripted integration test in the repo: the integration test and all 9 contracts are RETROSPECTIVE — they describe assertions that WOULD prove each behaviour; none are currently written or running. NOT proven, NOT healthy — author-built and manually observed only.

## Guidance

Run the seeder from anywhere: it derives paths from import.meta.url (dataDir → repoRoot two levels up → docs/, docs/decisions/), so it does not depend on cwd. The output count (88) and category split (definition 54, pattern 11, guardrail 8, principle 5, techstack 4, template 6) are EMERGENT, not configured: curated holds 29 hand-written entries (seed.assets.mjs:39-430), templates holds 6 fillable scaffolds — one per artifact category, including `template-adr` (seed.assets.mjs:441-554) — and definitions come from auto-extracting docs/glossary.md. The 54 definitions = 53 glossary-extracted + 1 curated ('proof-mode', seed.assets.mjs:96). FOUR glossary blocks are intentionally dropped as duplicate slugs — `proof-mode`, `prove-it-gate`, `deep-modules`, and `standalone-resilient-library` — because extractGlossaryDefinitions seeds its `seen` set with all curated + template ids (seed.assets.mjs:586), so any glossary term whose slug collides with an existing artifact id is skipped; this is the dup-slug-skip, and it is why curated + templates must be assembled before definitions (seed.assets.mjs:627-629). (The glossary yields 57 dash-anchored definition blocks; the four colliding slugs are dropped, leaving 53 — the net 54 definitions = 53 glossary-extracted + 1 curated.) A definition block is recognised only when it matches the anchored regex `^**term** [optional (aside)] —/– body` with an em/en dash (seed.assets.mjs:590); a hyphen will not match. The v1→v2 term-map table is excluded by a plain string indexOf cut on the exact heading '## v1 → v2 term map' (seed.assets.mjs:582-583) — renaming or re-glyphing that heading silently re-includes the table. References are emitted as `doc:` topic refs, never as ADR artifacts (ADRs stay as documents); adr(n) zero-pads to 4 digits and returns null on a miss, and nulls are stripped for curated (filter(Boolean), seed.assets.mjs:621) but glossary refs are only-ever-truthy by construction. NOTE (owner, 2026-06-06): `template` is a real, populated artifact category — the 6 scaffolds are seeded — but per-category template ENFORCEMENT (requiring a new artifact to start from / match its `template-<category>`) is not yet worked through; the templates also reference a 7th `adr` category that is defined in the code schema but currently unseeded (no `adr`-category artifacts in assets.json). Determinism comes from a hardcoded STAMP ('2026-06-05T00:00:00.000Z', seed.assets.mjs:18) applied to every artifact, so --force regenerates byte-identical output. The script has no test harness or output-path argument; assets.json is the runtime store the dev server (dev-server-persistence-backbone) later reads and mutates, so re-running --force is the documented reset. depends_on is empty — read off the code: seed.assets.mjs imports no other capability, it only reads the filesystem + the two doc sources, so there is no within-story upstream edge to draw. The integration test runs entirely against that real filesystem and the two doc sources; the coupling runs the other way — the two Library app capabilities depend on THIS capability's output file, not the reverse. (VERIFIED against apps/studio/data/assets.json: 88 total, byCat {definition:54,pattern:11,guardrail:8,principle:5,techstack:4,template:6}, 81 with refs, 7 without (edit-first-curation + the 6 template scaffolds), 137 doc: refs, 0 asset: refs; 'node' definition cites doc:glossary.md + ADR-0004 + ADR-0009.)

## Integration test

**Goal —** Prove that running the seeder against the real on-disk docs produces the categorised, ADR-cited starter corpus the Library serves — with no React app and no dev server involved.

The integration test exercises the seeder against its **real in-story collaborators** —
the real `docs/` tree (the glossary and the decisions dir) and the real filesystem it
writes — with **no stubs within the organism** (ADR-0010 §2/§5). This is the lone studio
capability whose integration proof is automatable TODAY: the script is a standalone Node
program whose on-disk output is directly assertable. (The `depends_on` is empty — read off
the code in Guidance — so the test rides no other capability; it is a root.) It would:

1. From the repo root, delete apps/studio/data/assets.json so the output starts absent.
2. Run `node apps/studio/data/seed.assets.mjs` and assert stdout prints `wrote 88 artifacts → …/assets.json` followed by `by category: {"definition":54,"pattern":11,"guardrail":8,"principle":5,"techstack":4,"template":6}` (categories summing to 88).
3. Read apps/studio/data/assets.json and assert it parses as a JSON array of 88 objects, each carrying id, category (one of definition/principle/pattern/guardrail/techstack/template), title, description, body, references, createdAt, updatedAt.
4. Assert a curated artifact: 'deep-modules' (category principle) cites 'doc:decisions/0002-work-hierarchy-story-capability-contract.md' — proving the adr(n) helper resolved ADR-2 against the real file scanned from docs/decisions.
5. Assert the glossary auto-extraction: a 'definition' artifact such as 'node' exists, cites 'doc:glossary.md', and additionally carries the per-mention ADR refs found in its body (doc:decisions/0004-…, doc:decisions/0009-…); and that 53 of the 54 definitions carry the doc:glossary.md ref (the 54th, 'proof-mode', is curated).
6. Assert no artifact derived from the v1→v2 term-map table exists (the table after the '## v1 → v2 term map' marker was cut before extraction) and that every reference string is doc:-prefixed (81 of 88 artifacts have >=1 ref; the 7 with none are 'edit-first-curation' and the 6 'template-*' scaffolds).
7. Re-run `node apps/studio/data/seed.assets.mjs` (no flag) and assert it prints `assets.json already exists; pass --force to overwrite (…)` and leaves the file untouched — the no-clobber guard.
8. Re-run `node apps/studio/data/seed.assets.mjs --force` and assert it regenerates the byte-identical 88-artifact corpus, proving --force overrides the guard and the output is deterministic (fixed STAMP timestamps).

## Contracts (9)

The test-proven leaf behaviours — each **one isolated automated test** with
collaborators stubbed (ADR-0002). No automated tests exist yet; each entry is the
assertion a contract test *would* prove, with the real code it covers.

1. **`slc-adr-helper-maps-number-to-scanned-ref`** — adr(n) maps an ADR number to the doc ref scanned from the decisions dir
   - **asserts —** Given the decisions dir contains 0002-work-hierarchy-story-capability-contract.md, adr(2) returns 'doc:decisions/0002-work-hierarchy-story-capability-contract.md' and adr(99) (no matching file) returns null.
   - **covers —** `apps/studio/data/seed.assets.mjs:26-32`
2. **`slc-glossary-block-parses-term-and-body`** — A `**term** — body` block becomes a definition artifact
   - **asserts —** Given a glossary string with a single block '**node** — a unit on the DAG.', extraction yields one artifact with id 'node', category 'definition', title 'node', and body 'a unit on the DAG.'
   - **covers —** `apps/studio/data/seed.assets.mjs:587-613`
3. **`slc-term-map-table-excluded-from-extraction`** — Content after the `## v1 → v2 term map` marker is cut before extraction
   - **asserts —** Given a glossary string whose only `**term** — body` block sits below a '## v1 → v2 term map' heading, extraction returns an empty array.
   - **covers —** `apps/studio/data/seed.assets.mjs:582-583`
4. **`slc-duplicate-slug-is-skipped`** — A block whose slug is already seen (curated, template, or earlier) is skipped
   - **asserts —** Given usedIds already contains 'proof-mode' and the glossary fixture defines '**proof mode** — …', extraction does not emit a second 'proof-mode' artifact.
   - **covers —** `apps/studio/data/seed.assets.mjs:586,595`
5. **`slc-per-mention-adr-refs-appended-to-definition`** — Each ADR-NNNN mention in a definition body adds its resolved doc ref
   - **asserts —** Given a definition body containing 'ADR-0004' and 'ADR-0009', the artifact's references are ['doc:glossary.md','doc:decisions/0004-…','doc:decisions/0009-…'] with no duplicates.
   - **covers —** `apps/studio/data/seed.assets.mjs:598-601`
6. **`slc-first-sentence-strips-markdown-and-truncates`** — description is the first sentence, markdown-stripped and capped at 200 chars
   - **asserts —** firstSentence('**A** long *clause*; trailing.') returns 'A long clause;' (markup removed, cut at first ./;), and a >200-char input is truncated to 197 chars + '…'.
   - **covers —** `apps/studio/data/seed.assets.mjs:558-566`
7. **`slc-curated-references-drop-nulls`** — A curated artifact's null refs (unresolved adr) are filtered out
   - **asserts —** For a curated entry whose references include a null (adr() miss), the written artifact's references array contains only the truthy doc refs — no null entry.
   - **covers —** `apps/studio/data/seed.assets.mjs:619-621`
8. **`slc-no-clobber-without-force`** — An existing assets.json is not overwritten unless --force is passed
   - **asserts —** When existsSync(outFile) is true and argv lacks --force, writeFileSync is never called and the 'already exists; pass --force' branch is taken.
   - **covers —** `apps/studio/data/seed.assets.mjs:634-636`
9. **`slc-force-writes-and-logs-by-category`** — With --force (or no file), it writes the corpus and logs the by-category tally
   - **asserts —** When the write branch runs, writeFileSync is called once with the assembled array serialized as JSON, and a by-category count object is logged whose values sum to the artifact total.
   - **covers —** `apps/studio/data/seed.assets.mjs:637-641`
