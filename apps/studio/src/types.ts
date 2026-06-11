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
  | 'process' // "a repeatable operating ceremony"
  | 'agent' // "a role and its operating discipline"
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
  /**
   * Markdown body — the guidance itself. For a structured Knowledge unit this is the DERIVED
   * render of {@link GuidanceAsset.fields} (read-only on the wire); for a body-only unit
   * (template / adr) it is the authored source.
   */
  body: string;
  /**
   * Per-kind STRUCTURED fields (KIND_SPECS in @storytree/core), keyed by field name
   * (oneLine / whatItIs / options / …). Present iff this is a structured Knowledge unit
   * (its `category` is one of the six structured kinds); absent for body-only units
   * (template / adr). When present these are AUTHORITATIVE — `body` is their derived render
   * (option C of oq-library-doc-shape, ADR-0013/0017/0023). The studio editor edits these
   * directly so a save never collapses structure into a one-way rendered body.
   */
  fields?: Record<string, string>;
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
  /**
   * Present (the reason, one line) when the SERVER could not faithfully render the stored doc —
   * an unknown kind, or a schemaVersion newer than the server's code (a stale long-running
   * studio server). `body` is then a raw-field fallback view and `fields` is absent.
   */
  degraded?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields a client supplies when creating/replacing an artifact. */
export interface AssetInput {
  id: string;
  category: AssetCategory;
  title: string;
  description: string;
  /** Derived render of {@link AssetInput.fields} for a structured unit; the source for a body-only one. */
  body: string;
  /** Per-kind structured fields when the category is a structured Knowledge kind (option C). */
  fields?: Record<string, string>;
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

/**
 * GET /api/health — which store backs this studio session and whether the DB
 * answers. `db` is 'n/a' for the offline json store; for pg it is the result
 * of a cheap connectivity probe (the endpoint itself never 500s — it is what
 * the UI leans on precisely when the DB is down).
 */
export interface StoreHealth {
  store: 'pg' | 'json';
  db: 'ok' | 'unreachable' | 'n/a';
  /**
   * pg + reachable only: the library schemaVersion the server's CODE knows vs the highest the
   * DB holds. db > code means the studio server is running stale code (pull + restart) — the
   * banner turns this into a distinct message instead of a generic API failure.
   */
  schema?: { code: number; db: number };
}

/** GET /api/db/status — the Cloud SQL instance as gcloud reports it. */
export interface DbStatus {
  /** e.g. 'RUNNABLE' | 'STOPPED' */
  state: string;
  /** e.g. 'ALWAYS' | 'NEVER' */
  activationPolicy: string;
}

export const ASSET_CATEGORIES: AssetCategory[] = [
  'definition',
  'principle',
  'pattern',
  'guardrail',
  'techstack',
  'process',
  'agent',
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
  process: 'a repeatable operating ceremony',
  agent: 'a role and its operating discipline',
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

// ---------- story tree (GET /api/tree) ----------

/** Work-hierarchy status vocabulary (`Status` in @storytree/core schema.ts). */
export type WorkStatus =
  | 'proposed'
  | 'building'
  | 'healthy'
  | 'unhealthy'
  | 'mapped'
  | 'retired';

/**
 * The latest signed verdict for a unit, read from `events.verdict` when the studio
 * runs on the live pg store and the DB answers — SILENTLY ABSENT otherwise
 * (ADR-0033 owner decision 3 semantics: ✓ proven / ✗ last run failed / – never
 * built; a story's verdict is its OWN UAT node's, never a roll-up from children).
 */
export interface TreeVerdict {
  outcome: 'pass' | 'fail';
  at: string;
}

/**
 * One capability node in the tree view. `status: null` + `error` means the spec
 * file was missing or failed frontmatter validation — the view still renders the
 * node (tolerant, like `storytree tree`) with the reason on its detail panel.
 */
export interface TreeCapability {
  id: string;
  title: string;
  outcome: string;
  status: WorkStatus | null;
  proofMode: string;
  /** Sibling capability ids this one depends on (the in-story `depends_on` edges). */
  dependsOn: string[];
  verdict?: TreeVerdict;
  error?: string;
}

/** One story: its own spec fields, story-level depends_on, and its capability DAG. */
export interface TreeStory {
  id: string;
  title: string;
  outcome: string;
  status: WorkStatus | null;
  proofMode: string;
  /** Story ids this story depends on (frontmatter `depends_on` — consumed cross-story seams). */
  dependsOn: string[];
  /** The story's OWN UAT verdict (unit_id = story id) — never a child roll-up. */
  verdict?: TreeVerdict;
  capabilities: TreeCapability[];
  error?: string;
}

/**
 * An active session from the notice board (ADR-0033), woven into the tree view when
 * the live store answers — SILENTLY ABSENT otherwise, like the CLI presence block.
 * `band` is derived server-side at read time (never stored): fresh < 1h ≤ stale < 4h
 * ≤ possibly-dead.
 */
export interface TreeSession {
  sessionId: string;
  branch: string;
  workingOn: string;
  /** Work-hierarchy ids the session anchored to (story or capability ids). */
  nodes: string[];
  band: 'fresh' | 'stale' | 'possibly-dead';
  lastSeenAt: string;
}

export interface TreePayload {
  stories: TreeStory[];
  /** Present only when the live store answered AND at least one session is active. */
  sessions?: TreeSession[];
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
