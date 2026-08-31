---
id: "read-corpus"
tier: capability
story: studio
title: "Read a reference document from the docs/ tree"
outcome: "An operator opens a reference document by deep link or in-corpus cross-link and reads it as rendered markdown, and a link the doc index cannot resolve says why instead of reading as absent."
status: "proposed"
proof_mode: "integration-test"
depends_on: [dev-server-persistence-backbone]
---

# Read a reference document from the docs/ tree

**Outcome —** An operator opens a reference document by deep link or in-corpus cross-link and reads
it as rendered markdown, and a link the doc index cannot resolve says why instead of reading as
absent.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md)

> ## ⚠ RE-SCOPED, 2026-08-31 — `prove-unproven-capabilities-arc` inc-25, Group 2
>
> **The outcome is alive; three of the four things the previous wording named are not.** This spec
> described a grouped docs SIDEBAR over a corpus whose headline half was `docs/decisions/`, served by
> handlers in `apps/studio/server/devApi.ts`. Verified at source 2026-08-31, in this worktree:
>
> - **The `Decisions` group is gone.** `listDocs` hardcodes `group: 'Reference'` for every entry
>   (`apps/studio/server/apiRouter.ts`), and its own comment says why: ADR-0403 dec 1 made decisions
>   ordinary `adr` Library artifacts and deleted `docs/decisions/`, so the ADR-specific machinery
>   this walker carried — a frontmatter status read, the lineage fold, the number→id map — was
>   deleted rather than left unreachable. `deriveGroup` no longer exists. Neither does
>   `docs/glossary.md` (retired at ADR-0135), which was the previous walkthrough's worked example and
>   the only doc in the corpus carrying the cross-link that leg followed.
> - **The grouped sidebar is gone.** `apps/studio/src/components/Sidebar.tsx` is now a single
>   `Library` head-link that opens the lens over the map; its per-category rail retired with the
>   standalone `#/library` page (ADR-0185 dec 6). There is no browsable doc INDEX surface any more.
> - **The handlers moved.** `listDocs` / `safeDocPath` / `handleDocs` / `deriveTitle` all live in
>   `apps/studio/server/apiRouter.ts` now — the ONE route table shared by the Vite dev plugin and the
>   hosted server (`studio-cloud`'s `serve-mode`). `devApi.ts` is 123 lines of Vite wiring, so every
>   `devApi.ts:NNN` citation in the old text pointed at nothing.
> - **One pathway in genuinely died, and it is not the same as the deep link.** ADR-0205 named two
>   ways a reference doc is reached: a `#/doc/<id>` deep link, and an in-corpus cross-link. The
>   STRUCTURED half of the second — an artifact's `doc:` entry in a `Sources` pane — went with the
>   citation tier at ADR-0477 D1; `AssetView` renders no `Sources` block and `RefLink` no longer
>   exists. What survives is the MARKDOWN half: a relative link inside any rendered body, rewritten
>   by `Markdown.tsx` through `resolveDocHref`.
>
> **What is genuinely NEW since the first authoring, and is the more interesting half of this unit:**
> the doc index has an honest READINESS vocabulary. `docsStatus` / `docsError` plus
> `unresolvedDocReason` (`src/lib/docsIndex.ts`) exist because `map-boot-independence` removed the
> shared `status` gate and left a failed `/api/docs` degrading into confident wrongness — a link
> rendered inert, an ADR rendered "(no doc found)" — when the honest answer was "the index never
> loaded".
>
> **NO `proof:` BLOCK IS AUTHORED HERE, and the absence is the finding.** Real coverage exists and is
> named under § Coverage below, but it does not reach this capability's own outcome end to end, and
> naming a command that merely looks like it exercises the thing is the failure this re-scope exists
> to avoid.

## Guidance

**WHERE THE CODE IS.** Server: `apps/studio/server/apiRouter.ts` owns `listDocs`, `deriveTitle`,
`stripFrontmatter`, `deriveExcerpt`, `containedPath`, `safeDocPath` and `handleDocs`. Client:
`src/api.ts` (`listDocs`, `docContent`), `src/lib/route.ts` (`docHref`, `parseRoute`),
`src/lib/markdown.ts` (`slugify`, `parseHeadings`, `isInCorpusDocHref`, `resolveDocHref`,
`mermaidSource`), `src/lib/docsIndex.ts` (`DocsStatus`, `unresolvedDocReason`),
`src/components/DocView.tsx` and `src/components/Markdown.tsx`.

**THE `dev-server-persistence-backbone` EDGE IS UNCHANGED IN SUBSTANCE AND MOVED IN FORM.** This
capability owns the doc handlers but does not own the dispatch: `handleDocs` is reached only because
`handleApiRequest`'s route table claims `/api/*` ahead of Vite's SPA history fallback. That
registration is the backbone's, and it is still the coupling — it just lives in `apiRouter.ts` now
rather than in `configureServer`. Nothing here writes: docs are served read-only from
`<repo>/docs` and never mutated, so the JSON/pg store split does not reach this capability at all.

**ONE GROUP, AND THE FLATNESS IS THE DECISION, NOT AN OVERSIGHT.** Every `DocMeta` comes back
`group: 'Reference'`. Do not re-introduce a `Decisions` arm: `docs/decisions/` does not exist, and
the two places that DID keep grouping decisions after the delete (`librarySearch`'s doc fold and
`overviewConstellation`'s doc squares) were both removed for the same reason — they had stopped
carrying decisions and were relabelling the ~113 surviving REFERENCE documents as decisions, which is
a lie rather than a cosmetic defect.

**DOC IDENTITY.** The docs-relative path with forward slashes (`path.relative(...).split(path.sep)
.join('/')`), so a slug-bearing id survives on Windows too. `docHref` URI-encodes the WHOLE id into
one hash segment and `parseRoute` decodes it back; a naive `/`-split router would shatter it.

**TITLE IS NOT FRONTMATTER, and frontmatter is stripped before anything reads the body.**
`stripFrontmatter` drops a leading `---` block, then `deriveTitle` takes the first ATX `# ` line and
falls back to the filename minus `.md`. `deriveExcerpt` is a later addition: the first block that
actually reads as PROSE (skipping the title, headings and short metadata values), first sentence,
capped at 200 chars.

**THE SECURITY BOUNDARY IS TWO FUNCTIONS, NOT ONE, AND THAT SPLIT IS LOAD-BEARING.** `containedPath`
is the containment rule shared with `uatContextForStory`; `safeDocPath` adds the `.md` refusal on
top. `containedPath` takes an INJECTABLE `path` flavour because its two arms answer on different
platforms — posix can always express an escape as a `..`-prefixed relpath, so the `isAbsolute` arm is
dead there, while win32 has many roots and that arm is the only thing refusing `D:\secret.md` or a
UNC share. Measured 2026-08-30: before the injection, deleting `isAbsolute` left the whole studio
suite green. This is a contract here rather than a capability because it has no operator journey —
its only walkable exercise is this capability's happy `GET` path.

**`slugify` IS STILL SHARED, BUT ITS SECOND CONSUMER CHANGED.** It produces the rendered heading `id`
in `Markdown.tsx` and the new-artifact slug in `AssetEditor.tsx`. The section-comment anchors it used
to have to agree with are gone with `annotate-topic`/`resolve-comment` — which also leaves
`parseHeadings` with no consumer outside `markdown.ts` itself (recorded, not actioned: deleting app
source is outside this spec's authority).

**THE THREE-CANDIDATE RESOLVER, and the one branch that has no corpus example any more.**
`resolveDocHref` tries current-doc-dir-relative, then `docs/`-stripped, then as-is. The single real
in-corpus cross-link the old walkthrough followed (`glossary.md` → ADR-0002) is gone with both of its
endpoints, so NO branch of this resolver currently has a guaranteed corpus example — prove all three
with pure-function contracts, and do not write an integration leg that assumes a specific link exists
in `docs/`.

**MARKED-NOT-INERT IS THE POINT.** `Markdown`'s link component layers four cases in order: resolved
in-corpus → internal `#/doc/<id>` link; `://` scheme → new-tab external; in-corpus-SHAPED but
unresolved WHILE `docsStatus` is `loading`/`error` → marked with the reason from
`unresolvedDocReason`; otherwise → a raw href. `isInCorpusDocHref` deliberately answers only the
SHAPE question, because separating "points outside the corpus" from "the index hasn't loaded" is what
makes the third case expressible at all.

**`/api/docs` IS MEMOIZED AND VALIDATED, AND THAT IS SOMEONE ELSE'S CAPABILITY.** `handleDocs` reads
the index through `memoizeCorpusWalk` and answers with `no-cache` + `ETag`. That behaviour belongs to
`map-server-memo`, which proves it; this capability must leave `listDocs`'s exported signature and
returned VALUE unchanged, which is the fence that keeps the two from entangling.

**DEV-ONLY IS NO LONGER TRUE.** The old text said this capability exists only under `vite` dev. The
same route table is mounted by `server/serve.ts` for the hosted studio, so the doc read path runs in
both postures.

## Coverage — what exists today, and what does not

Recorded so the gap is visible rather than inferred. This is NOT a proof claim: no command below
drives this capability's own outcome end to end, which is why no `proof:` block is authored.

**Genuinely exercised (`pnpm --filter studio test`):**
- `server/pathTraversal.test.ts` — `containedPath`'s BOTH arms on one platform via the injected
  flavour, and `safeDocPath`'s `.md` refusal separately from the containment rule.
- `src/components/Markdown.test.tsx` — the in-corpus link component against a RESOLVED, a LOADING and
  a FAILED doc index, plus that an external link and a page anchor are never marked; and the
  ```mermaid fence path.
- `src/App.docs-index-honesty.test.tsx` — an integration test over the real `App` + real `Markdown`
  through a doubled transport: a failed `/api/docs` is operator-visible and does not blank the map.
- `server/mapServerMemo.integration.test.ts` — `/api/docs` through the REAL route table over a real
  socket (freshness, ETag/`no-cache` validators, byte-identical bodies). It proves the MEMO; it
  reaches `listDocs` only as that memo's subject.

**Exercised by NOTHING:**
- `listDocs`'s walk itself — the forward-slash id on Windows, the `Reference` group, the id sort, the
  `existsSync` guard on a missing dir.
- `deriveTitle` (first ATX line, filename fallback), `stripFrontmatter`, `deriveExcerpt`.
- `GET /api/docs/content` — neither the 200 `{id,title,markdown}` shape nor the 404 on a refused id.
- `docHref` / `parseRoute` round-tripping a slash-bearing doc id (`src/lib/route.test.ts` covers only
  the `#/library` retirement).
- `slugify` and `parseHeadings` directly, and the rendered heading's `id` + `#` anchor.
- `resolveDocHref`'s three candidate branches directly (`Markdown.test.tsx` reaches it only through
  the component, on the docs-root-relative branch).
- `DocView`'s own loading / error / ready states.

## Integration test

**Goal —** An operator opens a reference document by its `#/doc/<id>` deep link, reads it as rendered
markdown with slugged heading anchors, follows an in-corpus cross-link to a sibling document, and —
when the doc index has not resolved — sees an in-corpus link MARKED with the reason rather than
rendered as an ordinary dead link.

The integration test exercises read-corpus against its **real in-story collaborators** — the real
route table it rides for `/api/*` dispatch (`dev-server-persistence-backbone`), and a real `docs/`
tree on disk — with **no stubs within the organism** (ADR-0010 §2/§5). It is written against a
TEMP docs dir the test itself lays down, not against the repo's own `docs/`: the previous version
pinned `glossary.md` and its ADR-0002 cross-link, and both were deleted out from under it, which is
exactly how a walkthrough comes to describe a corpus that no longer exists. It would:

1. Lay down a temp docs tree — `a.md` (a `# ` title, a `## ` heading, and a relative link to
   `sub/b.md`), `sub/b.md` (its own `# ` title), and one non-`.md` file — and start the studio over
   it. Assert `GET /api/docs` answers 200 with a `DocMeta` per `.md` file, ids forward-slashed and
   docs-relative, every `group` equal to `'Reference'`, sorted by id, and the non-`.md` file absent.
2. Assert each entry's `title` is its first `# ` heading text (not the filename), and that a doc
   whose file opens with a `---` frontmatter block still titles from the `# ` line BELOW it.
3. Open `#/doc/a.md` COLD — no prior in-app navigation — and assert `DocView` shows its loading state
   and then renders: the `docs / a.md` crumb, and the prose through `Markdown` with GFM.
4. Assert the rendered `## ` heading carries a stable `slugify` id and a `#` anchor whose href is
   that slug, and that clicking it sets `location.hash` to the slug.
5. Assert the relative link to `sub/b.md` rendered as an INTERNAL link whose href is
   `#/doc/sub%2Fb.md` — `resolveDocHref` matched it against the loaded index and `docHref` re-encoded
   it — rather than a raw `.md` href or a new-tab external link.
6. Click it. Assert the app navigates in place and `sub/b.md` renders from disk, completing the
   deep-link → read → cross-link walk. This is the walk that is REALLY available: there is no doc
   index surface to browse from, by design (ADR-0185 dec 6).
7. THE HONESTY LEG. With `/api/docs` failing (the index never resolves), open the same document and
   assert its in-corpus link is MARKED as unresolved and names the reason — "the document index
   failed to load" — while the same page's external link and its `#fragment` anchor are NOT marked.
   Assert the map is still mounted and painting, so the honesty did not come at the cost of
   re-coupling the boot (`map-boot-independence`'s contract).
8. Negative read-path check on the endpoint this whole test rides: request
   `/api/docs/content?id=../package.json`, `?id=sub/../../secret.md`, and `?id=a` (no `.md`). Assert
   all three answer 404 `doc not found` with no file contents.

## Contracts (12)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). The `covers —` lines are the CURRENT homes, re-verified 2026-08-31; where a contract has
a real test today it is named, and where it does not, § Coverage above is the record.

1. **`rc-listdocs-walks-tree-as-reference`** — listDocs returns every `.md` under docs/ as a Reference entry
   - **asserts —** Given a temp docs dir with `sub/b.md` (first line `# B`) and `a.md`, `listDocs(dir)` resolves to `DocMeta[]` containing `{id:'a.md',group:'Reference'}` and `{id:'sub/b.md',title:'B',group:'Reference'}`, with forward-slash ids on every entry and no `Decisions` group for any input (ADR-0403 dec 1). A non-`.md` file yields no entry, and a missing dir yields `[]`.
   - **covers —** `apps/studio/server/apiRouter.ts` `listDocs`
2. **`rc-listdocs-sorts-by-id`** — The doc index is ordered by id
   - **asserts —** Given `sub/z.md`, `a.md` and `b.md`, `listDocs(dir)` returns them in `localeCompare` id order. (The old Decisions-first arm is gone with the group.)
   - **covers —** `apps/studio/server/apiRouter.ts` `listDocs` (the trailing sort)
3. **`rc-derivetitle-and-stripfrontmatter`** — Title comes from the first ATX heading below any frontmatter, else the filename
   - **asserts —** `deriveTitle(stripFrontmatter(md), 'x.md')` returns the `# ` text for a plain body, returns it for a body opening with a `---` frontmatter block, and returns `'x'` for a body with no `# ` line at all.
   - **covers —** `apps/studio/server/apiRouter.ts` `deriveTitle` / `stripFrontmatter`
4. **`rc-deriveexcerpt-skips-metadata-and-truncates`** — The excerpt is the first block that reads as prose
   - **asserts —** `deriveExcerpt` skips the H1 and any heading, skips a block with no sentence punctuation (`accepted`, a bare date), returns the first sentence of the first prose block, and truncates a >200-char result to 197 chars + `…`.
   - **covers —** `apps/studio/server/apiRouter.ts` `deriveExcerpt`
5. **`rc-containedpath-refuses-escape-on-both-arms`** — containedPath refuses a `..` escape and a cross-root id
   - **asserts —** Under the INJECTED posix flavour a `../package.json` id returns null; under the injected win32 flavour a `D:\secret.md` id — which resolves to an absolute relpath NOT starting with `..` — returns null via the `isAbsolute` arm; a contained id resolves under both.
   - **covers —** `apps/studio/server/apiRouter.ts` `containedPath` — HAS A TEST: `server/pathTraversal.test.ts`
6. **`rc-safedocpath-refuses-non-markdown`** — safeDocPath adds the `.md` refusal on top of containment
   - **asserts —** `safeDocPath('/docs','a')` (contained, no extension) returns null while `safeDocPath('/docs','a.md')` resolves; a traversal id ending in `.md` is still refused.
   - **covers —** `apps/studio/server/apiRouter.ts` `safeDocPath` — HAS A TEST: `server/pathTraversal.test.ts`
7. **`rc-handledocs-content-404-on-refused-or-missing-id`** — /api/docs/content 404s without leaking contents
   - **asserts —** `handleDocs` for `/api/docs/content?id=../package.json` and for a contained id whose file does not exist both throw `HttpError(404,'doc not found')`, and neither reads a file.
   - **covers —** `apps/studio/server/apiRouter.ts` `handleDocs`
8. **`rc-handledocs-content-returns-stripped-body`** — /api/docs/content returns `{id,title,markdown}` with frontmatter stripped
   - **asserts —** For a temp docs dir containing `a.md` whose body opens with a `---` block then `# A`, `handleDocs` answers 200 with `{id:'a.md',title:'A',markdown:<body without the frontmatter block>}`.
   - **covers —** `apps/studio/server/apiRouter.ts` `handleDocs`
9. **`rc-dochref-roundtrips-slash-bearing-id`** — docHref/parseRoute round-trip a slash-bearing doc id
   - **asserts —** `parseRoute(docHref('sub/b.md'))` deep-equals `{name:'doc',id:'sub/b.md'}` — the slash survives URI-encode then hash-parse — and `parseRoute('#/nope')` falls back to the tree route.
   - **covers —** `apps/studio/src/lib/route.ts` `docHref` / `parseRoute`
10. **`rc-slugify-and-parseheadings`** — slugify is stable and parseHeadings ignores fenced code
   - **asserts —** `slugify('The *boundary* is the proof mode!') === 'the-boundary-is-the-proof-mode'`; and for markdown containing a real `## Real Heading` plus a `# not a heading` line INSIDE a ```-fence, `parseHeadings` returns exactly one `{depth:2,text:'Real Heading',slug:'real-heading'}`.
   - **covers —** `apps/studio/src/lib/markdown.ts` `slugify` / `parseHeadings`
11. **`rc-resolvedochref-tries-three-candidates`** — resolveDocHref maps a relative link to a known doc id, or null
   - **asserts —** With `knownIds` = `{'sub/b.md'}`: from base `sub/a.md` the href `b.md` resolves (dir-relative branch); from base `a.md` the href `docs/sub/b.md` resolves (`docs/`-stripped branch); the href `sub/b.md` resolves as-is; and `https://example.com`, `#frag`, `mailto:x@y` and an unknown relative href all return null.
   - **covers —** `apps/studio/src/lib/markdown.ts` `resolveDocHref` / `isInCorpusDocHref`
12. **`rc-unresolved-in-corpus-link-is-marked-with-its-reason`** — An unresolved in-corpus link says WHY rather than rendering inert
   - **asserts —** `Markdown` renders an in-corpus-shaped href that does not resolve as a MARKED link carrying `unresolvedDocReason(docsStatus)` — "the document index is still loading" while loading, "the document index failed to load" on error — and renders it unmarked when `docsStatus` is `ready` (genuinely not in the corpus); an external link and a `#fragment` are never marked in any state.
   - **covers —** `apps/studio/src/components/Markdown.tsx` + `src/lib/docsIndex.ts` `unresolvedDocReason` — HAS A TEST: `src/components/Markdown.test.tsx`
