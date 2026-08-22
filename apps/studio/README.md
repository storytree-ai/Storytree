# studio (foundation)

The web surface for storytree: a forum-style interface over the project's record,
plus the **story world** at `#/tree` — an SVG hex-island map of the work hierarchy
(ADR-0036; the ADR-0001 PixiJS plan is superseded).

Think of the whole thing as a **forum**: documents and Library artifacts are
*topics*; comments are *posts*. It does three things:

1. **Read the record** — the ADRs are kept as *history* (the justification
   record) alongside the glossary, open-questions, and adjudication. Rendered
   markdown with stable section anchors and in-corpus cross-links.
2. **Annotate** — select any text to attach a comment to that exact span; it
   highlights inline (like a word processor). Comment on a whole topic, a
   section, or a selection; resolve when addressed. Highlights re-anchor to the
   text, so they survive edits and re-renders.
3. **Library** — modular, injectable **artifacts** (`definition` / `principle` /
   `pattern` / `guardrail` / `techstack` / `template`), plus the **ADRs** folded
   in as read-only, doc-backed `adr` cards — all browsable and searchable in one
   place. The durable guidance is synthesised from the ADRs (each artifact cites
   its source ADR); every glossary term is a `definition` artifact. Authoring
   conforms to per-category **templates**, enforced on save.

## Run it

From the repo root (Node 24, `corepack enable pnpm`):

```bash
pnpm install
pnpm --filter studio dev     # → http://localhost:5173
```

One process. Vite serves the React app *and* a small middleware API
([`server/devApi.ts`](server/devApi.ts)) that reads docs live from `../../docs`
and persists comments + artifacts to `data/*.json`. No separate backend, no
database.

```bash
pnpm --filter studio typecheck    # strict tsc (repo tsconfig.base)
pnpm --filter studio build        # static SPA build (no API — see "Persistence")
```

The structured source of truth is the shared Cloud SQL Postgres store
([`@storytree/library/store`](../../packages/library/src/store)), which the studio reads **by
default** (`STORYTREE_STUDIO_STORE=pg`; bring the DB up with `pnpm db:up`). It is the ONLY source
(ADR-0302 D1) — the committed `data/knowledge.json` seed that used to mirror it is deleted, and no
file mirrors it now. Edit the Library through the CLI (`storytree library artifact edit <id> --pg`)
or the studio itself.

`STORYTREE_STUDIO_STORE=json` selects the **offline sandbox** backend. Read what it is precisely: it
seeds itself on first read from the library's small committed FIXTURE corpus
(`@storytree/library/fixture` — a frozen handful of artifacts, not a copy of the Library) and
persists edits to a gitignored `data/assets.runtime.json`. It is a local scratch surface for working
on the UI without a database; it is **not** a way to browse the corpus. The old
`data/build-corpus.mjs` + `data/assets.json` generated view was **retired by ADR-0210**; the older
`data/seed.assets.mjs` seeder and `docs/glossary.md` (a second generated view, ADR-0135) were
retired before it.

## Commenting — block placement + the Review-mode editor

Comments attach to a **content block** (`kind: 'block'`, the stable `splitBlocks`
handle; ADR-0140) and render inline in the document flow. Review-mode editing is a
top-left **View ↔ Edit** toggle: Edit is a split-pane markdown **source** editor
(left) + live **preview** (right), with a toolbar that inserts **CriticMarkup**
tracked-changes / comments (`{++ins++}` · `{--del--}` · `{~~old~>new~~}` ·
`{>>comment<<}` · `{==hl==}`); ADR-0146, [`src/components/ReviewEditor.tsx`](src/components/ReviewEditor.tsx),
parser in [`src/lib/criticmarkup.ts`](src/lib/criticmarkup.ts).

The old W3C text-quote anchoring (the `annotate.ts` / `useAnnotations.tsx`
select-to-highlight popover, the range `<mark>` highlights, the margin gutter, and
the `kind: 'text'` anchor) was **removed** — a clean swap to block placement
(`remove-text-selection-anchoring`, ADR-0146).

## Data model

Two JSON stores under [`data/`](data/), both tracked in git so feedback and
guidance are durable and reviewable. Shapes are in [`src/types.ts`](src/types.ts).

### Comment (a forum *post*)

```jsonc
{
  "id": "uuid",
  "topicKind": "doc" | "asset",        // a topic is a document or a Library artifact
  "topicId": "decisions/0002-….md",    // doc relpath, or an artifact id
  "anchor": {
    "kind": "topic" | "section" | "text",
    "headingSlug": "decision" | null,  // section id, or the section a text anchor lives in
    "headingText": "Decision" | null,
    "quote":  "exact selected text" | null,   // text-quote anchor →
    "prefix": "…context before"     | null,
    "suffix": "context after…"      | null,
    "startOffset": 486 | null,              // position hint for disambiguation
    "color": "#f5c542" | null               // highlight colour
  },
  "body": "markdown",
  "author": "operator",                // single local operator (see Design choices)
  "createdAt": "ISO-8601",
  "resolved": false,
  "resolvedAt": "ISO-8601" | null
}
```

The **same** `slugify` produces both a heading's rendered `id` and a section
comment's `headingSlug`, so anchors line up.

### GuidanceAsset — a Library artifact

```jsonc
{
  "id": "deep-modules",                // kebab-case slug, unique (the v1 `name`)
  "category": "principle",             // definition | principle | pattern | guardrail |
                                       //   techstack | template | adr
  "title": "Deep modules",
  "description": "one line — what it is / when to inject it",
  "body": "markdown",
  "references": ["doc:decisions/0002-….md", "asset:proof-mode"],  // → clickable in-app links
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

The **7 artifact categories** cover the durable outputs the ADRs produce:
`definition` (what something is), `principle` (how to judge), `pattern` (a
reusable approach), a **`guardrail`** (a *deterministically-enforced* boundary —
it must name what enforces it), `techstack` (what we build on), a **`template`**
(the shape an artifact conforms to), and an **`adr`** (a decision record). A small
fixed ontology, not the unbounded tags we removed.

**Templates are enforced.** Each artifact category ships a generated
`template-<category>` scaffold. The editor offers a "Start from the <category>
template" button when authoring a new artifact, and **blocks save** when a
required section is missing. The load-bearing rule: a **`guardrail`** must include
an **"Enforced by"** section naming its deterministic enforcement (a gate / schema
/ DB constraint / code path) — else it is a `pattern`, not a guardrail. The
required-section map lives in [`src/lib/templates.ts`](src/lib/templates.ts). The
`adr` category has a `template-adr` scaffold too (the canonical ADR section
shape), and authoring an `adr` works exactly like the other categories.

**`adr` is a first-class artifact category, and since ADR-0403 it is the ONLY kind there is.**
You author ADRs in the editor like any other artifact — start from the `template-adr` scaffold;
they persist to the Library store and open in `AssetView`. The `adr` category used to span two
populations — artifacts authored here, plus the canonical decision records folded in read-only
from `docs/decisions/*.md` — but that directory was deleted when all 403 decisions became rows,
so there is one population now and no doc-backed half. ⚠ The studio's docs walker was not moved
with them: its `Decisions` group is served by a walk of `docs/`, which can no longer produce a
decision, so the shelf is EMPTY in the UI until that read is re-pointed at the store
(`decision-log-readers-arc`, increment 1). The CLI is unaffected —
`storytree library artifact adr-NNNN`. The open-questions / adjudication / v1 registers stay in
the sidebar's **Reference** section, not the Library.

The Library is the structured corpus in the live Postgres store — curated guidance synthesised from
the ADRs (each `references` its source ADR), one `definition` per term, and a few v1 imports — plus
the per-kind `template` scaffolds from `libraryTemplates()` (`@storytree/library`). The default
studio reads it live; the offline sandbox backend derives its much smaller view from the committed
fixture corpus (ADR-0210, ADR-0302 D1). The decisions are in that same store as ordinary `adr` rows
(ADR-0403) — there is no separate read-only fold from `docs/decisions/` any more, because the
directory is gone.

### API (dev only)

| Method | Path | |
|---|---|---|
| GET | `/api/docs` | list doc topics (`{id,title,group,excerpt}`) |
| GET | `/api/docs/content?id=` | one doc's markdown (path-traversal-guarded) |
| GET/POST/PATCH/DELETE | `/api/comments` | comment CRUD (`?id=`, `?topicId=`) |
| GET/POST/PATCH/DELETE | `/api/assets` | artifact CRUD (`?id=`) |

## Design choices (for owner review)

- **`adr` is a first-class artifact category.** ADRs are authored in the editor
  like any other artifact and persist to the Library store. ⚠ **This entry recorded a
  two-population design that ADR-0403 ended.** The plan here was that existing decision
  records would stay canonical markdown under `docs/decisions/`, fold into the same `adr`
  category read-only, and NOT be auto-migrated — the files remaining the source of truth for
  the originals. They were migrated: all 403 became rows, the directory was deleted, and the
  store is now the only source of truth for every decision. Durable guidance is still
  **synthesised out of** the ADRs into principles/patterns/guardrails, each citing
  its source ADR via `references`.
- **Definitions are the term authority.** Each term is a `definition` artifact in the
  Library, looked up just-in-time. (A generated `docs/glossary.md` formerly mirrored them as
  one page; ADR-0135 retired it — the structured knowledge units are the source.)
- **Text-quote anchoring** (W3C Web Annotation) for the highlight layer — see
  "Commenting" above. No anchoring/markdown-highlight dependency; hand-rolled.
- **`GuidanceAsset`, not bare `asset`.** The corpus reserves **`asset`** for
  tree/game art (open-questions §9 / adjudication §J say the knowledge tier must
  be renamed when it returns). The type is `GuidanceAsset`; the UI says
  "artifact". This re-opens §9's parked tier as a concrete model worth a look
  before it hardens into `packages/core`.
- **No tags.** Dropped as noise; category + full-text search cover browsing.
- **Persistence = Vite dev-middleware + JSON files in the repo.** No DB, no
  separate server (ADR-0001: lean). Runs only under `vite` (dev) — the
  foundation's whole scope. A production `vite build` is a static SPA with no
  `/api`; durable persistence wired to the orchestrator is later work.
  `data/comments.json` is tracked and starts empty `[]`.
- **Single local operator identity** (ADR-0008 / adjudication §C); no auth.

## Out of scope (deliberately)

Real-time / multi-user · orchestrator / agent integration · auth · production
persistence. (The story tree itself is no longer out of scope — `#/tree` ships it
as inline SVG, ADR-0036.)

## Structure

```
apps/studio
├── vite.config.ts          # wires React + the data-api plugin
├── server/devApi.ts        # the "backend": docs + comments + artifacts over Vite
├── data/                   # comments + the gitignored offline runtime store (ADR-0210)
└── src
    ├── App.tsx             # shell: loads docs/artifacts/comments, routes
    ├── api.ts · types.ts   # typed client · shared on-disk shapes
    ├── lib/
    │   ├── criticmarkup.ts    # CriticMarkup parser (tracked-change segments for the preview)
    │   ├── blocks.ts          # splitBlocks + block-anchor helpers (ADR-0140)
    │   ├── route.ts · markdown.ts · templates.ts · appData.ts · operator.ts · format.ts
    └── components/         # Sidebar · Markdown · DocView · ReviewEditor · ReviewToggle
        ·                   # Library · AssetView · AssetEditor · Home
```
