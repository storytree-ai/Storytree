---
id: "studio-foundation"
tier: story
title: "The studio foundation"
outcome: "An operator reviews the project record through one browsable forum studio."
status: proposed
proof_mode: UAT
capabilities: [dev-server-persistence-backbone, seed-library-corpus, read-corpus, resolve-comment, annotate-topic, browse-library, author-library-artifact]
---

# The studio foundation

**Outcome —** An operator reviews the project record through one browsable forum studio.

apps/studio is a hand-built, single-process Vite dev app (run with `pnpm --filter studio dev`) that turns the repo's own docs/ corpus and a synthesised guidance Library into a reviewable forum: read rendered ADRs/glossary, anchor comments onto exact text spans / sections / whole topics and resolve them, and browse-author-seed a categorised Library of injectable guidance artifacts. The whole 'backend' is one Vite middleware file (server/devApi.ts) serving docs read-only from <repo>/docs and persisting comments + assets to git-tracked JSON stores under apps/studio/data. HONESTY: the app compiles and runs, but package.json has only dev/build/preview/typecheck — zero test tooling, no *.test/*.spec files anywhere in the package, no scripted UAT. Every unit below is a RETROSPECTIVE spec over already-working code: each contract describes the isolated unit test that WOULD prove a leaf (citing real code at file:line), each capability describes the integration test that WOULD prove it against its real in-story collaborators (no stubs within the organism), and the single story-level UAT below describes the acceptance walkthrough that WOULD prove the whole organism against the real running app. The lone capability whose integration proof is automatable TODAY is the Library seeder (a standalone Node script whose output is directly assertable). Nothing here is 'proven', 'healthy', or 'mapped'; proof status is authored-only.

## What this is

This is storytree's **first story** — the seed of the self-building tree, authored by
hand (the bootstrap "midwife" step) by decomposing what was really built in
`apps/studio`. A **story** is a **bounded context** — a self-contained organism, the
unit of independent deployability (the microservice grain, ADR-0010) — composed of
capabilities, and the map grain a newcomer points at (ADR-0002). Under the organism
model the proof ladder shifts up one rung: the **story** carries the integrated **UAT**
(the acceptance walkthrough of the whole organism against real collaborators), each
**capability** is proven by an **integration test** against real *in-story*
collaborators (no stubs within the organism), and each **contract** stays the isolated
unit-test leaf (ADR-0010 §2).

`studio-foundation` is currently the **only** story, so there are no cross-story
**boundaries** to declare yet (ADR-0010 §4): the entire `apps/studio` organism is
in-story, every dependency below is a within-story code-derived edge, and nothing here
runs against a stubbed upstream interface.

See [`../README.md`](../README.md) for the representation and how every field maps to
ADR-0002 / `docs/glossary.md`.

## Capabilities (7)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md) | Data written through the studio's API survives a dev-server restart. | — |
| 2 | [`seed-library-corpus`](seed-library-corpus.md) | Running the seeder produces the categorised, ADR-cited starter corpus the Library serves. | — |
| 3 | [`read-corpus`](read-corpus.md) | An operator reads any corpus document as rendered markdown in the studio. | `dev-server-persistence-backbone` |
| 4 | [`resolve-comment`](resolve-comment.md) | An operator resolves a comment with the resolved state persisted across every surface. | `dev-server-persistence-backbone` |
| 5 | [`annotate-topic`](annotate-topic.md) | An operator anchors a comment onto a precise place in a rendered topic. | `dev-server-persistence-backbone`, `read-corpus` |
| 6 | [`browse-library`](browse-library.md) | An operator explores the seeded guidance Library down to a single rendered artifact. | `dev-server-persistence-backbone`, `seed-library-corpus`, `read-corpus` |
| 7 | [`author-library-artifact`](author-library-artifact.md) | An operator durably changes the Library's contents through the editor form. | `dev-server-persistence-backbone`, `browse-library` |

## Dependency graph (code-derived)

These are **within-story** edges, **read off the real source** (static analysis of the
imports / data-flow between capabilities), never hand-drawn from UAT need (ADR-0010 §3):
A → B means A's code actually couples to B's code inside the one organism. The graph is
acyclic; `dev-server-persistence-backbone` and `seed-library-corpus` are the roots.
(There are no cross-story edges: `studio-foundation` is the only story, so no
**boundary** interfaces apply yet — ADR-0010 §4.)

- `read-corpus` → `dev-server-persistence-backbone`
  - read-corpus owns its doc handlers (listDocs, safeDocPath, handleDocs at devApi.ts:96-343) but **rides** the backbone's `/api/*` middleware registration — handleDocs is dispatched only because storytreeDataApi.configureServer mounted the namespace before Vite's SPA fallback (devApi.ts:358-377). The coupling is the shared connect-middleware seam, read straight off the code.
- `annotate-topic` → `dev-server-persistence-backbone`
  - The annotate UI calls api.createComment → POST /api/comments, whose handler runs readAnchor + writeStore (devApi.ts:199-223), and re-finds highlights from the GET → readStore round-trip — annotate's data path is literally the backbone's comment persistence handlers.
- `annotate-topic` → `read-corpus`
  - annotate-topic mutates the DOM read-corpus renders: useAnnotations injects `<mark>`s into the memoized markdown subtree (DocView.tsx:51-59) and reads slugged heading ids produced by read-corpus's slugify/parseHeadings (markdown.ts) — its anchors are computed against read-corpus's rendered output, a direct render-layer coupling.
- `resolve-comment` → `dev-server-persistence-backbone`
  - toggleResolved calls api.updateComment → PATCH /api/comments?id, whose handler stamps/clears resolvedAt and writeStore-persists it (devApi.ts:225-239), then refreshComments re-fetches GET /api/comments — resolve's only write and its read-back are both the backbone's handlers. (No edge to annotate-topic: resolve imports none of annotate's create path; the surfaces only share the Comment shape and the comments.json file.)
- `browse-library` → `dev-server-persistence-backbone`
  - Library.tsx / AssetView render from AppData populated by GET /api/assets and the doc index GET /api/docs (App.tsx:58-59) — both served by the backbone's `/api/*` middleware over the on-disk JSON store; the read path is backbone code.
- `browse-library` → `seed-library-corpus`
  - browse-library consumes the **artifacts the seeder wrote**: the grid, chip counts (definition 54, pattern 11, guardrail 8, principle 5, techstack 4, template 6), and every doc: citation come from apps/studio/data/assets.json, which exists only because seed.assets.mjs produced it — a data-provenance coupling on the seeder's output file.
- `browse-library` → `read-corpus`
  - RefLink builds an in-app doc link via docHref(relpath) into #/doc/<relpath> (AssetView.tsx:106-113), and following it lands in read-corpus's DocView — resolving and rendering that cited doc is read-corpus's code, which browse-library calls into.
- `author-library-artifact` → `dev-server-persistence-backbone`
  - AssetEditor's save()/remove() call api.createAsset/updateAsset/deleteAsset → POST/PATCH/DELETE /api/assets, whose handlers run readAssetInput, the dup/relock guards, createdAt/updatedAt stamping and writeStore (devApi.ts:291-321) — author's durable mutations are the backbone's asset handlers.
- `author-library-artifact` → `browse-library`
  - After every save/delete, AssetEditor/AssetView call refreshAssets() then navigate into browse-library's surfaces — create/edit land on AssetView (the detail render browse-library owns), delete routes to the Library list (AssetView.tsx:36-38); author's post-mutation render path is browse-library's components.

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `studio-foundation`
organism meets its outcome end-to-end against the **real running studio** — the proof
that moved up to the story tier (ADR-0010 §2). It is minimal-first (one coherent
operator journey that touches read, annotate, resolve, browse, and author once) and
synthesised from the seven per-capability walkthroughs that were folded up into it; mocks
are forbidden (no cross-story boundary exists to stub against — §"What this is").

**Goal —** One operator, in one session against `pnpm --filter studio dev`, reviews the
project record through the studio: reads a rendered ADR, anchors a comment on it and
resolves it, browses the seeded guidance Library down to one artifact and follows its
citation back to the corpus, then authors a Library artifact — every durable change
surviving in the git-tracked JSON stores.

1. Start the studio with `pnpm --filter studio dev` and confirm it logs the `storytree data api: … store → apps/studio/data/` line (devApi.ts:353-355). **Success —** the dev server is up with the `/api/*` middleware mounted ahead of Vite's SPA fallback (the persistence backbone is live).
2. Open the app; in the Sidebar confirm the grouped corpus index ('ADRs (history)' + 'Reference') rendered from the real docs/ tree, then click into `decisions/0002-...md` (or any ADR). **Success —** the hash becomes #/doc/decisions%2F0002-…, DocView fetches /api/docs/content and renders the markdown with slugged headings (read-corpus end-to-end).
3. Follow the rendered doc's in-corpus cross-link to a sibling doc (e.g. glossary → ADR-0002), then return. **Success —** the link resolved through resolveDocHref to an internal #/doc/<relpath> nav and the sibling rendered from disk — the corpus is genuinely navigable, not a single page.
4. Set an operator name once, select an exact span of the rendered body, pick a colour in the popover, and Post a comment on it. **Success —** the span is wrapped in a coloured `<mark class='st-hl'>` with a gutter tick, the thread shows the comment, and a new text-anchored record (with quote/prefix/suffix, author = the operator) is appended to apps/studio/data/comments.json (annotate-topic against the real corpus + backbone).
5. Reload the page. **Success —** the comment is re-fetched and the highlight is re-found and re-wrapped at the same span (findQuoteRange) with its gutter tick — the anchor durably survived a fresh render and the GET → readStore round-trip.
6. Click the comment's **Resolve** button. **Success —** without a manual reload every surface flips off the single `resolved` flag (header open-count decrements, the row gains the 'resolved' pill, the 'hide resolved' toggle appears, the section/gutter badge updates, the Sidebar count drops), and comments.json now shows resolved:true with a non-null resolvedAt (resolve-comment fan-out + backbone persistence).
7. Navigate to #/library. **Success —** the grid renders the seeded corpus with the 'all (88)' chip and one live-count chip per non-empty category (definition 54, pattern 11, guardrail 8, principle 5, techstack 4, template 6) — the artifacts the seeder wrote, served from assets.json.
8. Narrow by the 'definition' chip, then type a substring (e.g. 'deep') into search. **Success —** the route becomes #/library/definition with its gloss banner, and the grid narrows to the matching cards (case-insensitive id+title+description+body match) — browse-library's filter end-to-end.
9. Open a seeded artifact carrying a doc: citation (e.g. 'deep-modules') and click its reference link. **Success —** AssetView renders the artifact (header gloss, body, References), and the citation routes to #/doc/decisions%2F0002-…md and lands on that ADR rendered in-app — proving the Library→corpus seam (browse-library riding read-corpus).
10. Go to #/asset/new, author a fresh artifact (title auto-slugs the id, pick a category, fill body, watch the live preview), and click **Create artifact**. **Success —** the POST /api/assets returns 201, the app refreshAssets + navigates to the rendered detail with createdAt===updatedAt, and the new record is present on disk in assets.json.
11. From the detail, **Edit** the artifact (id input disabled), change the body, **Save changes**, then **Delete** it and accept the confirm. **Success —** the edit footer shows 'updated' later than 'created' (id re-locked, createdAt preserved), and after delete you land on the Library list with the artifact gone from assets.json — the full create→edit→delete loop is durable (author-library-artifact + backbone).
12. Stop and restart `pnpm --filter studio dev`, then re-open the annotated doc and the Library. **Success —** the resolved comment from steps 4-6 is still present and resolved, and the authored artifact is correctly absent (it was deleted) — the whole organism's state survived a cold restart from the JSON stores alone, end-to-end.
13. Clean up: delete the probe comment so the git-tracked stores return to their seeded baseline (comments.json `[]`, assets.json its 88 records). **Success —** the working tree is clean — the UAT left no residue.

## Proof

The story now **carries the UAT** (above): under the organism model the integrated
acceptance walkthrough lives at the story tier, not as a pure rollup of capability UATs
(ADR-0010 §2 — this supersedes ADR-0002's "story = pure rollup" default that the earlier
draft cited). The story is proven when that UAT passes against the real running organism
*and* its capabilities' integration tests and contracts pass underneath it.

**Honest status — `proposed`.** Nothing here is proven. `apps/studio` runs under
`pnpm --filter studio dev` but has **no automated test suite and no scripted UAT**
(`package.json` defines only dev/build/preview/typecheck; there are zero `*.test`/`*.spec`
files in the package). This is a **retrospective spec** over already-built, hand-exercised
code: the story UAT above is the acceptance walkthrough that *would* prove the organism,
each capability's integration test is what *would* prove it against real in-story
collaborators, and each contract is the isolated unit test that *would* prove its leaf —
none are written or running. Nothing here is `healthy` or `mapped`. The lifecycle status
for retro-authored specs over built code is an open modeling call — see
[`../README.md`](../README.md) § "Open modeling calls".
