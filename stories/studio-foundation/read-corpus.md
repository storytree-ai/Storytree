---
id: "read-corpus"
tier: capability
story: studio-foundation
title: "Read the doc/ADR corpus"
outcome: "An operator reads any corpus document as rendered markdown in the studio."
status: "proposed"
proof_mode: "integration-test"
depends_on: [dev-server-persistence-backbone]
---

# Read the doc/ADR corpus

**Outcome —** An operator reads any corpus document as rendered markdown in the studio.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md)

> **Proof status (honest) —** UNPROVEN — retrospective spec over working, hand-built code. The code runs under `pnpm --filter studio dev`: the grouped sidebar renders from the real docs/ tree, #/doc/<id> deep-links resolve, /api/docs/content reads files off disk through safeDocPath, ReactMarkdown+remark-gfm renders the prose with slug-id headings, and the one real cross-link (docs/glossary.md → ADR-0002) rewrites to an internal nav. But apps/studio has NO automated test suite and NO scripted/recorded integration test. The integration test WOULD prove the capability if executed against its real in-story collaborators; each contract describes an isolated unit test that WOULD prove its leaf against the cited real code. Do not call it proven or healthy.

## Guidance

Read-only by design — and this is exactly the code-derived dependency on dev-server-persistence-backbone (ADR-0010 §3): this capability OWNS its server doc handlers (listDocs, safeDocPath, handleDocs at devApi.ts:96-343) but its handlers are only dispatched because they RIDE the /api/* middleware registration in storytreeDataApi.configureServer (devApi.ts:358-377), which is the backbone. The integration test needs that server process real but NOT the JSON store (comments/assets) — docs are served live from <repo>/docs and never written. The whole API is a Vite dev-only plugin; a production `vite build` is a static SPA with no /api, so there is no read path to integration-test in a build.

Doc identity is the docs/-relative path with forward slashes (e.g. 'decisions/0002-...md'), computed in listDocs via path.relative(...).split(path.sep).join('/'). This is why route.ts URI-encodes the whole id into ONE hash segment (docHref) and decodes it back (parseRoute 'doc'); a naive '/'-split router would shatter the id. Test slug-bearing ids on Windows too (path.sep is '\\').

Title is NOT frontmatter: deriveTitle takes the first ATX '# ' line, falling back to filename minus .md (devApi.ts:96-99). Group is purely the 'decisions/' prefix (deriveGroup), and the Sidebar re-splits on group==='Decisions' under a DIFFERENT visible heading ('ADRs (history)', Sidebar.tsx:45) than the server's group label ('Decisions') — don't assert the two strings equal.

The security boundary (safeDocPath traversal/.md refusal + handleDocs 404s) is a contract here, not a capability, because it has no operator journey: its only walkable exercise is this capability's happy GET path. safeDocPath uses path.relative + startsWith('..')/isAbsolute, so tests must use OS-correct separators; prefer asserting the function/handler return over crafting raw HTTP.

slugify is shared (markdown.ts) between the rendered heading id (Markdown.tsx:43-47) and section-comment anchors — the same-slug invariant is load-bearing for annotate-topic, so keep slugify's contract strict. parseHeadings has its OWN ATX regex and fence-skipper independent of remark; it feeds the comment panel's section list, so it must agree with slugify but is not what renders the page.

resolveDocHref tries three candidates in order — current-doc-dir-relative, then docs/-stripped, then as-is (markdown.ts:68-72) — and the ONLY real cross-link in the corpus today is docs/glossary.md → decisions/0002 (a docs-root-relative href from a top-level doc, so candidate #1 resolves). The '..'-relative and docs/-prefix-strip branches exist but have no corpus example, so prove them with pure-function contracts, not the integration test. The Markdown link component (Markdown.tsx:73-85) layers three cases: in-corpus → docHref internal link; '://' scheme → new-tab external; else → raw href.

DocView memoizes the <Markdown> subtree (DocView.tsx:51-59) on purpose: the annotation layer injects highlight <mark>s imperatively and a React reconcile would strip them. That memo is an annotate-topic concern; the read path is just fetch→loading/ready/error→render — don't entangle the two when scoping read contracts.

HONEST STATE: no test runner is wired in apps/studio (no *.test.* files) and no scripted integration test. Most contracts are pure functions trivially unit-testable; the handleDocs ones need a tiny fake req/res + a temp docs dir; listDocs needs a temp tree; the integration test needs the real dev server up. None of this exists yet.

## Integration test

**Goal —** An operator browses the grouped corpus index, opens a document by deep-link, reads it as rendered markdown, and follows an in-corpus cross-link to a sibling doc — all against the real docs/ tree on disk, no fixtures.

The integration test exercises read-corpus against its **real in-story collaborators** —
the real `dev-server-persistence-backbone` middleware seam it rides, and the real `docs/`
tree served off disk — with **no stubs within the organism** (ADR-0010 §2/§5). It would,
against the real running studio:

1. Start the studio with `pnpm --filter studio dev`; load the app at #/ (Overview). Assert the left Sidebar shows two document sections, 'ADRs (history)' and 'Reference', that the ADR section lists the decisions/ files first in filename order while glossary/adjudication/open-questions/v1-conflicts sit under Reference — proving the index rendered from the real docs/ tree, grouped by deriveGroup and ordered Decisions-first.
2. Assert each sidebar entry shows its human title (the doc's first '# ' heading text via deriveTitle) rather than the bare filename — e.g. the glossary entry reads as its '# ' title, not 'glossary.md'.
3. Click the glossary entry. Assert the URL hash becomes #/doc/glossary.md (docHref URI-encodes the relpath into one segment) and the entry gains the 'active' class; assert DocView shows a brief 'Loading …' then renders the document — proving the deep-link route resolved (parseRoute 'doc'), api.docContent fetched /api/docs/content?id=glossary.md, the real backbone server read the real file off disk, and ReactMarkdown rendered the prose (headings, lists, GFM tables) with the 'docs / glossary.md' crumb.
4. Reload the browser on that same #/doc/glossary.md URL (cold deep-link, no prior navigation) and assert the same document renders — proving the hash route alone deep-links to a doc.
5. In the rendered glossary, assert a heading carries a stable slug id and a '#' anchor (clicking '#' sets location.hash to that slug) — proving slugify-based section anchors on the rendered headings.
6. Find the in-corpus cross-link in the glossary body that points at ADR-0002 (the decisions/0002-... link). Assert it rendered as an internal link whose href is #/doc/decisions%2F0002-... (resolveDocHref matched it to a known doc id and rewrote it through docHref), NOT a raw .md href and NOT a new browser tab.
7. Click that cross-link. Assert the studio navigates in-place to #/doc/decisions/0002-...md and DocView loads and renders ADR-0002 from disk — completing one coherent 'browse the index → open a doc → read it → follow a cross-link to a sibling doc' walk against the real corpus.
8. Negative read-path check (same surface, the security boundary the happy path rides): request /api/docs/content?id=../package.json and /api/docs/content?id=glossary (no .md). Assert both return 404 'doc not found' and no file contents — proving the read-only doc-serving guard refuses traversal and non-markdown ids on the exact endpoint this test uses.

## Contracts (12)

The test-proven leaf behaviours — each **one isolated automated test** with
collaborators stubbed (ADR-0002). No automated tests exist yet; each entry is the
assertion a contract test *would* prove, with the real code it covers.

1. **`rc-listdocs-walks-and-groups-real-tree`** — listDocs returns every .md under docs/, titled and grouped
   - **asserts —** Given a temp docs dir with decisions/0002-x.md (first line '# Work Hierarchy') and glossary.md, listDocs(dir) resolves to DocMeta[] containing {id:'decisions/0002-x.md',title:'Work Hierarchy',group:'Decisions'} and {id:'glossary.md',group:'Reference'}, with forward-slash ids on every entry.
   - **covers —** `apps/studio/server/devApi.ts:105-126`
2. **`rc-listdocs-orders-decisions-first-then-alpha`** — Doc index sorts Decisions-first, then by id
   - **asserts —** Given a temp docs dir with glossary.md, adjudication.md, decisions/0009-z.md and decisions/0001-a.md, listDocs(dir) returns the two decisions/ entries (0001 then 0009) before the Reference entries (adjudication.md before glossary.md).
   - **covers —** `apps/studio/server/devApi.ts:122-125`
3. **`rc-safedocpath-refuses-traversal`** — safeDocPath refuses path traversal outside docs/
   - **asserts —** safeDocPath('/docs','../package.json') returns null (the resolved path escapes docsDir).
   - **covers —** `apps/studio/server/devApi.ts:129-133`
4. **`rc-safedocpath-refuses-non-markdown`** — safeDocPath refuses non-.md ids
   - **asserts —** safeDocPath('/docs','glossary') (an in-bounds id without a .md extension) returns null.
   - **covers —** `apps/studio/server/devApi.ts:133`
5. **`rc-handledocs-content-404-on-bad-id`** — /api/docs/content 404s a rejected id without leaking contents
   - **asserts —** handleDocs invoked for url /api/docs/content?id=../package.json (a stubbed res capturing statusCode/body) ends with status 404 and body {error:'doc not found'}, and never calls fs.readFile.
   - **covers —** `apps/studio/server/devApi.ts:335-338`
6. **`rc-handledocs-content-reads-file-and-derives-title`** — /api/docs/content returns {id,title,markdown} for a valid doc
   - **asserts —** For a temp docs dir containing glossary.md whose body starts with '# Glossary', handleDocs for /api/docs/content?id=glossary.md ends with status 200 and JSON {id:'glossary.md',title:'Glossary',markdown:<file body>}.
   - **covers —** `apps/studio/server/devApi.ts:339-340`
7. **`rc-dochref-roundtrips-slash-bearing-id`** — docHref/parseRoute round-trip a slash-bearing doc id
   - **asserts —** parseRoute(docHref('decisions/0002-work-hierarchy.md')) deep-equals {name:'doc',id:'decisions/0002-work-hierarchy.md'} — the slash survives URI-encode then hash-parse.
   - **covers —** `apps/studio/src/lib/route.ts:26-28,61`
8. **`rc-parseroute-defaults-unknown-to-home`** — parseRoute falls back to home for unrecognised hashes
   - **asserts —** parseRoute('#/nope') returns {name:'home'}.
   - **covers —** `apps/studio/src/lib/route.ts:37`
9. **`rc-slugify-stable-heading-slug`** — slugify produces a stable, punctuation-stripped slug
   - **asserts —** slugify('The *boundary* is the proof mode!') === 'the-boundary-is-the-proof-mode' (emphasis marks and punctuation removed, spaces collapsed to single hyphens, no leading/trailing hyphen).
   - **covers —** `apps/studio/src/lib/markdown.ts:7-16`
10. **`rc-parseheadings-skips-code-fences`** — parseHeadings ignores #-lines inside fenced code blocks
   - **asserts —** For markdown containing a real '## Real Heading' and, inside a ```-fenced block, a line '# not a heading', parseHeadings returns exactly one Heading {depth:2,text:'Real Heading',slug:'real-heading'}.
   - **covers —** `apps/studio/src/lib/markdown.ts:25-40`
11. **`rc-resolvedochref-matches-in-corpus-link`** — resolveDocHref maps an in-corpus relative link to its doc id
   - **asserts —** resolveDocHref('decisions/0002-x.md','glossary.md',new Set(['decisions/0002-x.md'])) returns 'decisions/0002-x.md' (the docs-root-relative cross-link the real glossary uses).
   - **covers —** `apps/studio/src/lib/markdown.ts:57-76`
12. **`rc-resolvedochref-rejects-external-and-anchor`** — resolveDocHref returns null for external/anchor/unknown hrefs
   - **asserts —** resolveDocHref('https://example.com','glossary.md',new Set()) returns null (and so do '#frag' and a relative href not present in knownIds).
   - **covers —** `apps/studio/src/lib/markdown.ts:62-76`
