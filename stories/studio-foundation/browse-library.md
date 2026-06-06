---
id: "browse-library"
tier: capability
story: studio-foundation
title: "Browse and view the guidance Library"
outcome: "An operator explores the seeded guidance Library down to a single rendered artifact."
status: "proposed"
proof_mode: "integration-test"
depends_on: [dev-server-persistence-backbone, seed-library-corpus, read-corpus]
---

# Browse and view the guidance Library

**Outcome —** An operator explores the seeded guidance Library down to a single rendered artifact.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md), [`seed-library-corpus`](seed-library-corpus.md), [`read-corpus`](read-corpus.md)

> **Proof status (honest) —** CODE EXISTS AND RUNS, NO AUTOMATED PROOF YET. All read-side behaviours are implemented and the studio runs under `pnpm --filter studio dev` serving the real 88-artifact seed; the full integration path (open #/library → narrow by chip → substring-search → open #/asset/<id> → follow a doc: ref to #/doc/<relpath>) is manually walkable today. But apps/studio has NO automated test suite and NO scripted integration test: none of the 11 contracts exist as tests, and the integration test is unscripted. The corpus counts and the 0-asset:-refs honesty caveat were verified by inspecting apps/studio/data/assets.json during this decomposition, not by any committed assertion. RETROSPECTIVE spec — nothing here is 'proven' or 'healthy', only present and exercised by hand.

## Guidance

The three code-derived depends_on edges (ADR-0010 §3), read off the source: the read path GET /api/assets + GET /api/docs is served by `dev-server-persistence-backbone`'s middleware; the grid/chip-counts/citations all come from the assets.json that `seed-library-corpus` wrote (data-provenance coupling on its output file); and RefLink's doc link routes into `read-corpus`'s DocView to render the cited doc. Routing is a dependency-free custom hash router (route.ts): doc/asset ids are URI-encoded into a single hash segment so slashes in doc relpaths (e.g. 'decisions/0002-...md') don't break parsing — RefLink's doc link goes to #/doc/<encoded relpath>, which is why the citation-follow leg lands in read-corpus's real code. Both the category-filter and the substring-search live in ONE useMemo over the same assets array (Library.tsx:14-24); the search is literal String.includes over a lowercased `id title description body` haystack (Library.tsx:19) — describe it at that fidelity, NOT as ranked relevance. Chip counts are computed inline by re-filtering the assets array per category (Library.tsx:48), and a category with n===0 renders no chip (Library.tsx:49) — the same per-category-count surface is mirrored in Sidebar.tsx:26-41, so they share the live counts. The taxonomy is a closed 7-category schema, not a unit: AssetCategory union + ASSET_CATEGORIES order + ASSET_CATEGORY_GLOSS map (types.ts:67-74,128-147) — chips/gloss/route-guard all consume it but it is observed only THROUGH them. The schema declares seven categories — `definition`, `principle`, `pattern`, `guardrail`, `techstack`, `template`, `adr` — of which six are populated by the seed; `adr` is defined-but-unseeded, so it renders no chip (the n===0 guard). NOTE (owner, 2026-06-06): `template` is a real category with 6 seeded scaffolds, but per-category template ENFORCEMENT on authoring is not yet worked through. RefLink resolution is NOT live re-validation: it reads docIds/docTitles that App.tsx:58-59 derives once from the doc index into the shared AppData context (appData.ts:8-16); an unknown ref degrades gracefully to a muted '(unknown doc/asset)' span. SEED REALITY (verified against apps/studio/data/assets.json): exactly 88 artifacts (definition 54, pattern 11, guardrail 8, principle 5, techstack 4, template 6), 81 carry references, 137 doc: refs, and 0 asset: refs — so the asset: branch of RefLink (AssetView.tsx:114-122) is real but DEAD under the seed; the honest minimal integration test must follow a doc: ref (e.g. artifact 'deep-modules' → 'doc:decisions/0002-work-hierarchy-story-capability-contract.md').

## Integration test

**Goal —** An operator starts at the Library landing, narrows the seeded artifact corpus by category and free-text search, opens one artifact, and follows its doc citation to land on the cited ADR in-app — proving the whole read-side of the Library end-to-end.

The integration test exercises browse-library against its **real in-story
collaborators** — the real 88-artifact `seed-library-corpus` output (the grid, chip
counts, and citations all read from the assets.json it wrote), the
`dev-server-persistence-backbone` middleware that serves it, and `read-corpus`'s DocView
the citation-follow leg lands in — with **no stubs within the organism** (ADR-0010 §2/§5).
These are exactly its three code-derived `depends_on` edges, exercised live. It would:

1. Start the studio (pnpm --filter studio dev) and open #/library. Assert the grid renders with the 'all (88)' chip active, plus one chip per non-empty category showing its live count: definition (54), pattern (11), guardrail (8), principle (5), techstack (4), template (6). No chip is shown for the defined-but-unseeded 'adr' category (n===0). No category gloss banner is shown yet (category is null).
2. Click the 'definition' category chip. Assert the route becomes #/library/definition, the grid narrows to the 54 definition artifacts, the 'definition' chip is now active, and the one-line gloss banner appears reading 'definition — what something is'.
3. Type a substring known to occur in one artifact's id/title/description/body (e.g. 'deep') into the search box. Assert the grid narrows further to only the cards whose combined id+title+description+body contains that substring (case-insensitive). Then type a string that matches nothing (e.g. 'zzzqqq') and assert the 'No artifacts match.' empty state replaces the grid; clear it to restore the list.
4. Click an artifact card known to carry a doc: reference (e.g. 'deep-modules'). Assert the route becomes #/asset/deep-modules and the detail view renders: the category chip + its gloss in the header, the description lede, the markdown-rendered body, and a 'References' list containing the cited ADR rendered as an in-app link showing the doc's title (not the raw 'doc:decisions/0002-...md' string).
5. Click that doc reference link. Assert the route becomes #/doc/decisions%2F0002-...md and read-corpus's DocView loads and renders that ADR as markdown in-app — proving the citation resolved to a real, reachable corpus document. (Honesty: the seed contains 0 asset: references, so this minimal test deliberately follows a doc: reference; the asset: branch of RefLink is real code but unexercised by the seed.)

## Contracts (11)

The test-proven leaf behaviours — each **one isolated automated test** with
collaborators stubbed (ADR-0002). No automated tests exist yet; each entry is the
assertion a contract test *would* prove, with the real code it covers.

1. **`bl-category-filter-narrows-grid`** — A category narrows the grid to that category's artifacts
   - **asserts —** Given a fixed asset list spanning multiple categories and query='', the Library filter memo with category='definition' returns exactly the assets whose category==='definition' (and excludes all others).
   - **covers —** `apps/studio/src/components/Library.tsx:16-17`
2. **`bl-search-substring-filters-across-fields`** — Free-text search substring-matches across id+title+description+body
   - **asserts —** Given category=null and a non-empty query, the filter memo keeps exactly the assets whose lowercased `id title description body` haystack contains the lowercased trimmed query, and drops the rest — proving match on a body-only / description-only hit, case-insensitively.
   - **covers —** `apps/studio/src/components/Library.tsx:15,18-20`
3. **`bl-chip-count-reflects-live-category-size`** — Each category chip shows its live per-category count
   - **asserts —** Rendering the Library over a known assets array shows the 'all (N)' chip with N=assets.length and each category chip labelled '<cat> (n)' where n is the count of assets in that category.
   - **covers —** `apps/studio/src/components/Library.tsx:44-45,47-58`
4. **`bl-empty-category-chip-hidden`** — A category with zero artifacts renders no chip
   - **asserts —** When the assets array contains zero artifacts of a given category, the Library renders no chip for that category (the `if (n === 0) return null` guard fires).
   - **covers —** `apps/studio/src/components/Library.tsx:48-49`
5. **`bl-empty-result-shows-empty-state`** — A query matching nothing shows the empty-state message
   - **asserts —** When the category+query filter yields zero assets, the Library renders the 'No artifacts match.' message instead of the card grid.
   - **covers —** `apps/studio/src/components/Library.tsx:76-77`
6. **`bl-category-gloss-banner-on-narrow`** — Selecting a category shows that category's one-line gloss
   - **asserts —** When category is non-null, the Library renders the gloss banner '<category> — <ASSET_CATEGORY_GLOSS[category]>'; when category is null, no gloss banner renders.
   - **covers —** `apps/studio/src/components/Library.tsx:70-74`
7. **`bl-library-route-category-guard`** — The router maps #/library/<category> to a valid category or null
   - **asserts —** parseRoute('#/library/definition') yields {name:'library',category:'definition'}, parseRoute('#/library') yields category:null, and parseRoute('#/library/bogus') yields category:null (the asCategory guard rejects non-members).
   - **covers —** `apps/studio/src/lib/route.ts:15-17,22-25`
8. **`bl-asset-route-parses-id`** — The router maps #/asset/<id> to an asset route with the decoded id
   - **asserts —** parseRoute('#/asset/deep-modules') yields {name:'asset',id:'deep-modules'}, and a percent-encoded id round-trips via decodeURIComponent (distinct from the '/edit' and 'new' sub-routes).
   - **covers —** `apps/studio/src/lib/route.ts:29-35`
9. **`bl-assetview-renders-header-body-refs`** — AssetView renders the resolved artifact's category gloss, body, and references
   - **asserts —** Given an assets list containing the requested id, AssetView renders the category chip with ASSET_CATEGORY_GLOSS as its gloss, the markdown body, and one References entry per reference; given an id absent from the list it renders the 'Artifact not found' box.
   - **covers —** `apps/studio/src/components/AssetView.tsx:17,23-32,47-69`
10. **`bl-reflink-resolves-known-doc-ref`** — RefLink renders a known doc: reference as an in-app doc link titled by the doc
   - **asserts —** For refStr='doc:<relpath>' where docIds.has(relpath), RefLink renders an anchor to docHref(relpath) whose text is docTitles.get(relpath); for an unknown relpath it renders the '(unknown doc)' muted fallback instead of a link.
   - **covers —** `apps/studio/src/components/AssetView.tsx:106-113`
11. **`bl-reflink-resolves-known-asset-ref`** — RefLink renders a known asset: reference as an in-app artifact link
   - **asserts —** For refStr='asset:<id>' where some asset has that id, RefLink renders an anchor to assetHref(id) titled by that asset's title; for an unknown id it renders the '(unknown asset)' muted fallback. HONESTY: this branch is unexercised by the seed (0 asset: refs), so this contract proves real-but-unseeded code.
   - **covers —** `apps/studio/src/components/AssetView.tsx:114-122`
