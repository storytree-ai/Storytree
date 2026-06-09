// Shared data shapes for the studio foundation. These are the on-disk contract
// for the dev-server JSON store (apps/studio/data/*.json) and the client.
//
// Forum framing (see apps/studio/README.md): every **topic** is either a
// document (an ADR / glossary / open-question) or a Library **artifact** (a
// definition / principle / guideline); **comments** are the posts attached to a
// topic — to the whole topic, a section heading, or an exact span of text.

export type TopicKind = 'doc' | 'asset';

/**
 * Where on a topic a comment is attached.
 *
 * - `topic`   — the whole document/artifact.
 * - `section` — a specific heading (`headingSlug` matches the rendered id).
 * - `text`    — an exact span, anchored by the W3C Web Annotation **text-quote**
 *   model: the exact `quote` plus a little `prefix`/`suffix` context so it can be
 *   re-found after the doc re-renders or is edited. `headingSlug` scopes the
 *   search; `startOffset` is a position hint for disambiguation; `color` is the
 *   highlight tag.
 */
export interface CommentAnchor {
  kind: 'topic' | 'section' | 'text';
  headingSlug: string | null;
  headingText: string | null;
  quote: string | null;
  prefix: string | null;
  suffix: string | null;
  startOffset: number | null;
  color: string | null;
}

/** A post in the forum — feedback attached to a doc or artifact. */
export interface Comment {
  id: string;
  topicKind: TopicKind;
  /** Doc relpath under docs/ (e.g. "decisions/0002-...md") or an artifact id. */
  topicId: string;
  anchor: CommentAnchor;
  /** Markdown. */
  body: string;
  /** Single local operator identity for now (ADR-0008). */
  author: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
}

/** Fields a client supplies when creating a comment; the server stamps the rest. */
export interface NewComment {
  topicKind: TopicKind;
  topicId: string;
  anchor: CommentAnchor;
  body: string;
  author: string;
}

/**
 * The artifact taxonomy: a typed, reusable unit of agent guidance. A lean set,
 * shaped to the durable outputs the ADRs produce.
 * - `pattern` absorbs the old "guideline": a reusable approach you apply.
 * - `guardrail` is reserved for **deterministically-enforced** boundaries (by a
 *   gate / schema / DB constraint / code path). Anything merely advisory is a
 *   `pattern`, not a guardrail.
 * The one-line gloss per category is shown in the UI.
 */
export type AssetCategory =
  | 'definition' // "what something is"
  | 'principle' // "how to judge"
  | 'pattern' // "a reusable approach"
  | 'guardrail' // "a deterministically-enforced boundary"
  | 'techstack' // "what we build on"
  | 'template' // "the shape an artifact conforms to"
  | 'adr' // "a decision record"
  | 'open-question'; // "an unresolved decision to settle"

/**
 * A modular, injectable Library artifact — the seed of the injectable guidance
 * library (open-questions §9, resolved by ADR-0017 / ADR-0019). Named `GuidanceAsset`, NOT bare
 * `asset`: the glossary reserves `asset` for tree/game art. ADRs are *not*
 * artifacts (they are history); a principle/guideline synthesized from an ADR
 * cites it via `references`.
 */
export interface GuidanceAsset {
  /** kebab-case slug; unique; the v1 `name`. */
  id: string;
  category: AssetCategory;
  title: string;
  /** One line: what it is / when to inject it (the v1 `description`). */
  description: string;
  /** Markdown body — the guidance itself. */
  body: string;
  /**
   * Topic refs this artifact points at: "doc:<relpath>" (e.g. its source ADR) or
   * "asset:<id>". The SINGLE citation source — rendered grouped-by-type as "Sources"
   * (no body `## See also`). The seed of v1's reciprocity-checked `current_consumers`.
   */
  references: string[];
  /**
   * Optional attribution prose shown under Sources that a bare pointer can't carry —
   * origin ("Imported from v1"), deferral, or "still open" caveats. Markdown.
   */
  provenance?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields a client supplies when creating/replacing an artifact. */
export interface AssetInput {
  id: string;
  category: AssetCategory;
  title: string;
  description: string;
  body: string;
  references: string[];
  provenance?: string;
}

/** Lightweight listing entry for a document topic. */
export interface DocMeta {
  /** Relpath under docs/, e.g. "decisions/0002-...md". */
  id: string;
  title: string;
  /** "Decisions" for ADRs under decisions/, else "Reference". */
  group: string;
  /** First prose sentence after the title — the description on Library ADR cards. */
  excerpt: string;
}

export interface DocContent {
  id: string;
  title: string;
  markdown: string;
}

export const ASSET_CATEGORIES: AssetCategory[] = [
  'definition',
  'principle',
  'pattern',
  'guardrail',
  'techstack',
  'template',
  'adr',
  'open-question',
];

/** One-line gloss per category (shown in the Library UI). */
export const ASSET_CATEGORY_GLOSS: Record<AssetCategory, string> = {
  definition: 'what something is',
  principle: 'how to judge',
  pattern: 'a reusable approach',
  guardrail: 'a deterministically-enforced boundary',
  techstack: 'what we build on',
  template: 'the shape an artifact conforms to',
  adr: 'a decision record',
  'open-question': 'an unresolved decision to settle',
};

/**
 * A unified row in the Library grid. `adr` is a first-class artifact category like
 * any other — you author them in the editor and they persist to assets.json. The
 * Library *also* folds in the canonical ADR docs under docs/decisions/ as
 * read-only `adr` rows, so an item is either an editable artifact
 * (`kind: 'artifact'` → AssetView) or a doc-backed ADR (`kind: 'doc'` → read-only
 * DocView). The glossary / open-questions / research notes stay in
 * the sidebar's "Reference" section, not the Library.
 */
export interface LibraryItem {
  kind: 'artifact' | 'doc';
  id: string;
  category: AssetCategory;
  title: string;
  description: string;
}

/** Highlight colour palette for text-anchored comments. */
export interface HighlightColor {
  id: string;
  label: string;
  value: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: 'yellow', label: 'Yellow', value: '#f5c542' },
  { id: 'green', label: 'Green', value: '#34c759' },
  { id: 'blue', label: 'Blue', value: '#3b9eff' },
  { id: 'pink', label: 'Pink', value: '#ff5fa2' },
  { id: 'purple', label: 'Purple', value: '#af52de' },
];

export const DEFAULT_HIGHLIGHT = '#f5c542';
