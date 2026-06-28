# studio (foundation)

The web surface for storytree: a forum-style interface over the project's record,
plus the **story world** at `#/tree` — an SVG hex-island map of the work hierarchy
([ADR-0036](../../docs/decisions/0036-story-world-studio-visualisation.md); the
ADR-0001 PixiJS plan is superseded).

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
npx tsx apps/studio/data/build-corpus.mjs   # regenerate the Library from knowledge.json
```

The Library is **generated, not seeded.** The structured source of truth is
[`data/knowledge.json`](data/knowledge.json); `build-corpus.mjs` renders it into
[`data/assets.json`](data/assets.json) (what the UI reads). Never hand-edit that
output; edit `knowledge.json` and rebuild. The old `data/seed.assets.mjs` seeder
is **retired** (and `docs/glossary.md`, formerly a second generated view, was
retired by ADR-0135 — the Library's definition artifacts are the term authority).
The library is **also** migrated into the shared Cloud SQL Postgres
store ([`packages/store`](../../packages/store)); the studio ↔ store swap (reading
the Library from Postgres instead of the local JSON) is still **pending**.

## Commenting — text-quote anchoring

The headline feature. The hard part of attaching a comment to a span of text is
**anchoring** it durably. We use the W3C Web Annotation **text-quote** model
([`src/lib/annotate.ts`](src/lib/annotate.ts)): a `text` comment stores the exact
`quote` plus ~32 chars of `prefix`/`suffix` context and a `startOffset` hint. To
render, we re-find the quote in the live DOM — scoped to its section heading for
speed and disambiguation — and wrap it in `<mark>` elements. This survives
re-render and edits above it, where character offsets or XPath would break.

The annotation layer ([`src/lib/useAnnotations.tsx`](src/lib/useAnnotations.tsx))
adds: a selection popover (pick a highlight colour → comment), inline highlights,
a margin **gutter** showing comment density, **hover preview cards**, click-a-
highlight-to-focus-its-thread, and resolve-fades-the-highlight. The rendered
markdown is memoized so React never reconciles it away (which would strip the
injected marks); all comment-reactive decoration is applied imperatively.

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

**`adr` is a first-class artifact category.** You author ADRs in the editor like
any other artifact — start from the `template-adr` scaffold; they persist to
`assets.json` and open in `AssetView`. The Library *also* folds in the canonical
ADRs under `docs/decisions/` as read-only `adr` rows (opening in the same
`DocView` — rendered markdown with comments + annotation), so the `adr` category
spans both authored artifacts and the doc-backed decision records. The glossary /
open-questions / adjudication / v1 registers stay in the sidebar's **Reference**
section, not the Library.

The Library is **generated** from [`data/knowledge.json`](data/knowledge.json) by
[`data/build-corpus.mjs`](data/build-corpus.mjs) — **74 knowledge units** rendered
into **81 artifacts** in `assets.json` (the 74 units plus **7 `template`
scaffolds**): curated guidance synthesised from the ADRs (each `references` its
source ADR), one `definition` per glossary term, and a few v1 imports. The
canonical ADRs under `docs/decisions/` additionally fold in read-only as `adr`
cards at runtime (served live by the dev API, not stored in `assets.json`).

### API (dev only)

| Method | Path | |
|---|---|---|
| GET | `/api/docs` | list doc topics (`{id,title,group,excerpt}`) |
| GET | `/api/docs/content?id=` | one doc's markdown (path-traversal-guarded) |
| GET/POST/PATCH/DELETE | `/api/comments` | comment CRUD (`?id=`, `?topicId=`) |
| GET/POST/PATCH/DELETE | `/api/assets` | artifact CRUD (`?id=`) |

## Design choices (for owner review)

- **`adr` is a first-class artifact category.** ADRs are authored in the editor
  like any other artifact and persist to `assets.json`. The **existing** decision
  records stay canonical markdown under `docs/decisions/` and fold into the same
  `adr` category read-only (opening in `DocView`), so authored ADRs and the
  doc-backed record browse together. The historical docs are *not* auto-migrated
  into `assets.json` — they remain the source of truth for the originals, while
  new decisions can be authored as `adr` artifacts. Durable guidance is still
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
├── data/                   # knowledge.json (source) + build-corpus.mjs → assets.json (generated)
└── src
    ├── App.tsx             # shell: loads docs/artifacts/comments, routes
    ├── api.ts · types.ts   # typed client · shared on-disk shapes
    ├── lib/
    │   ├── annotate.ts        # text-quote anchoring + highlight DOM surgery
    │   ├── useAnnotations.tsx # selection popover · highlights · gutter · hovercards
    │   ├── route.ts · markdown.ts · templates.ts · appData.ts · operator.ts · format.ts
    └── components/         # Sidebar · Markdown · DocView · CommentPanel
        ·                   # Library · AssetView · AssetEditor · Home
```
