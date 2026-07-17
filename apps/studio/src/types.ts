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
 * - `block`   — a specific content block within the topic (`blockId` is the stable
 *   handle; ADR-0140 block-anchor model). This is the live commenting model.
 *
 * The old `text` (W3C text-quote) kind is RETIRED (remove-text-selection-anchoring, ADR-0146):
 * text-selection anchoring is a clean swap to block placement. The `quote`/`prefix`/`suffix`/
 * `startOffset`/`color` fields remain only as inert nullable columns the store round-trips (the
 * write boundary `normalizeCommentAnchor` strips them); no client code reads or writes them.
 */
export interface CommentAnchor {
  kind: 'topic' | 'section' | 'block';
  /** Stable block handle; present when kind === 'block'. */
  blockId?: string;
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
 * A suggestion — a member's proposed edit to one block of a topic (ADR-0140).
 * Mirrors the store record (packages/library/src/store/pg-suggestion-store.ts):
 * `block` is the stable block handle (the splitBlocks id), `proposed`/`original`
 * the replacement and the drift witness.
 */
export interface SuggestionRecord {
  id: string;
  topicKind: TopicKind;
  topicId: string;
  block: string;
  proposed: string;
  original: string;
  status: 'open' | 'accepted' | 'rejected';
  author: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** One poll of a topic's review surface: its comments + its suggestions (cap 5's feed). */
export interface ReviewFeedPayload {
  topicId: string;
  comments: Comment[];
  suggestions: SuggestionRecord[];
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
  | 'proposal' // "a planned change to roll out when ready"
  | 'template' // "the shape an artifact conforms to"
  | 'adr' // "a decision record"
  | 'open-question' // "an unresolved decision to settle"
  | 'friction' // "what fought a session, with evidence"
  | 'arc' // "a multi-story initiative tracked to a close" (displayed "Epic", ADR-0183 D1)
  | 'plan'; // "a disposable, git-anchored choreography for one arc increment"

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
  /**
   * Typed navigation edges carried from a structured Knowledge doc's `.extend()` schema metadata
   * (OUTSIDE the KIND_SPECS body table, so they never round-trip through `body`/`fields`): an
   * `agent`'s `stepRefs` (workflow-step → outbound refs), a `process`'s `branchEdges`
   * (process-graph outbound edges), a `plan`'s `arcRef` (its containing arc). Surfaced by
   * `renderStoredDoc` ONLY on the faithfully-parsed structured branch (never on a pass-through or
   * degraded doc). Optional / absent-by-default — present only when the doc's kind carries the field,
   * never an empty array — so every existing reader and the offline json path keep validating with no
   * migration (the inc-6 `DocMeta.loadBearing?`/`references?` idiom). The inc-9 overview draws the
   * richer agent/process/plan lineage with these (ADR-0187 dec 3).
   */
  stepRefs?: { step: string; refs: string[] }[];
  /** A `process` doc's `branchEdges` — see {@link GuidanceAsset.stepRefs}. */
  branchEdges?: { ref: string; label?: string | undefined }[];
  /** A `plan` doc's `arcRef` (an `asset:<id>` pointer) — see {@link GuidanceAsset.stepRefs}. */
  arcRef?: string;
  /**
   * A `plan` doc's `status` wire mirror (ADR-0196 D3 — the plan-lifecycle projection input the
   * sibling `library-lifecycle-wire` capability crosses onto the wire). Optional / absent-by-default
   * (the `stepRefs?`/`arcRef?` idiom) so every existing `GuidanceAsset` reader keeps validating with
   * no migration; present only for a `plan` doc once the wire crosses it.
   */
  status?: string;
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

/**
 * An ADR's frontmatter lifecycle `status` (ADR-0037 §1): `proposed` (drafted, not yet ratified),
 * `accepted` (the decision stands), `superseded` (replaced by a later ADR). Mirrors the CLI's
 * `AdrStatus` (packages/drive/src/adr-frontmatter.ts) locally — the studio is browser-bundled and
 * must not import the CLI or drive packages. Surfaced as the at-a-glance status chip so a
 * wrong/premature flip is catchable (the observability "catch" ADR-0084 leans on).
 */
export type AdrDocStatus = 'proposed' | 'accepted' | 'superseded';

/** Lightweight listing entry for a document topic. */
export interface DocMeta {
  /** Relpath under docs/, e.g. "decisions/0002-...md". */
  id: string;
  title: string;
  /** "Decisions" for ADRs under decisions/, else "Reference". */
  group: string;
  /** First prose sentence after the title — the description on Library ADR cards. */
  excerpt: string;
  /**
   * The ADR's frontmatter `status` (ADR-0037) — present ONLY for `group === 'Decisions'` docs (other
   * docs carry no frontmatter status). Absent when the frontmatter is missing or unparseable
   * (tolerant, like the tree's per-node load): the card then simply shows no status chip.
   */
  status?: AdrDocStatus;
  /** The ADR's frontmatter `decided` date (ISO yyyy-mm-dd) when present — shown as the chip tooltip. */
  decided?: string;
  /**
   * The ADR's frontmatter `load_bearing` tag (ADR-0086) — present ONLY for `group === 'Decisions'`
   * docs, and true only when the tag is explicitly `load_bearing: true`. Feeds the overview
   * constellation's size + depth-of-colour = how load-bearing encoding (ADR-0187 dec 3). Optional /
   * absent-by-default so every existing `DocMeta` reader (and the offline json path) keeps validating.
   */
  loadBearing?: boolean;
  /**
   * The ADR's outbound decision-lineage edges (ADR-0037/0086 `supersedes`/`supersedes_in_part`/`amends`)
   * resolved to `doc:decisions/NNNN-slug.md` pointers — present ONLY for `group === 'Decisions'` docs
   * that carry at least one lineage edge. Lets the overview draw the ADR reference graph (ADR-0187
   * dec 3), closing the increment-5 out-degree-0 gap. Optional / absent-by-default (back-compat).
   */
  references?: string[];
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
  /**
   * The code stamp (both stores, unlike `schema`): the git HEAD the server process STARTED
   * on vs the checkout's HEAD on disk now. `stale: true` means the checkout moved under the
   * running server (a pull/merge landed) — new endpoints 404 and the served bundle is old
   * until a restart (pnpm studio:down / studio:up). Absent when git can't answer.
   */
  code?: { startedAt: string; head: string; stale: boolean };
  /**
   * Desktop only (ADR-0181 Decision 3): the pinned-`main` runtime worktree's status. `branch` is the
   * branch it is on (expected `main`), `behind` is how many commits it is behind `origin/main` as of the
   * last fetch (the desktop refreshes this with a launch update-check), and `pinned` is true for the
   * installed pinned-runtime app / false for the dev launch fallback. When `pinned && behind > 0` the
   * StoreBanner shows a one-click "N commits behind main — Rebuild & relaunch" update prompt (the rebuild
   * pulls `origin/main` ff-only). The hosted/dev studio never sends this field.
   */
  runtime?: { branch: string | null; behind: number | null; pinned?: boolean };
}

// ---------- members (app-owned users, ADR-0043) ----------

export type UserRole = 'admin' | 'member';
export type UserStatus = 'invited' | 'active';

/**
 * GET /api/me — the caller's membership, so the SPA can render the app or the
 * request-access wall. `member` is false for an un-invited account; `storeUnreachable`
 * is the degraded signal when membership couldn't be resolved (the live store was down).
 */
export interface MeInfo {
  email: string | null;
  role: UserRole | null;
  status: UserStatus | null;
  member: boolean;
  storeUnreachable?: boolean;
  /** Narrow permission for signing human UAT legs. Desktop builders may have this without admin UI. */
  canAttestUat?: boolean;
  /**
   * Whether this caller may wake the idle-stopped DB from the hosted studio (ADR-0049) — drives the
   * StoreBanner's "Wake the database" button. True for admins (seed admins even while the store is
   * down); false in the open dev posture (local uses the gcloud Start DB button).
   */
  canWakeDb?: boolean;
}

/** A member row (GET /api/users) — the app-owned user projection. */
export interface Member {
  email: string;
  role: UserRole;
  status: UserStatus;
  /** The admin who invited this user; null for a bootstrap-seeded admin. */
  invitedBy: string | null;
  createdAt: string;
  lastSeenAt: string;
}

/**
 * What the invite email attempt did (rides back on POST /api/users). `sent` — the invitee was
 * emailed the studio link; `skipped` — email isn't configured (share the link manually); `failed` —
 * configured but the send errored. The invite ROW is written either way (status is advisory).
 */
export interface InviteNotice {
  status: 'sent' | 'skipped' | 'failed';
  detail?: string;
}

/** POST /api/users response: the new member row plus the email-notification outcome. */
export interface InviteResult extends Member {
  notify: InviteNotice;
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
  'proposal',
  'template',
  'adr',
  'open-question',
  'friction',
  'arc',
  'plan',
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
  proposal: 'a planned change to roll out when ready',
  template: 'the shape an artifact conforms to',
  adr: 'a decision record',
  'open-question': 'an unresolved decision to settle',
  friction: 'what fought a session, with evidence',
  arc: 'a multi-story initiative tracked to a close',
  plan: 'a disposable, git-anchored choreography for one arc increment',
};

/**
 * A unified row in the Library grid. `adr` is a first-class artifact category like
 * any other — you author them in the editor and they persist to the Library store. The
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
  /** ADR lifecycle status (doc-backed `adr` items only) — drives the at-a-glance status chip. */
  status?: AdrDocStatus;
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
 * Binding-staleness drift state (ADR-0016 §3 `DriftState`, mirrored locally like {@link WorkStatus}):
 * `fresh` (the proved span's hash is unchanged), `stale` (it changed AND a described change explains
 * it → re-prove THIS unit), `drifted-undescribed` (changed but unexplained → DEMOTED, audit-only,
 * never a re-UAT trigger). Drift is a SEPARATE dimension from {@link WorkStatus}: it rides ALONGSIDE
 * the proven hue and never replaces it (ADR-0040 §7 — a once-green unit that drifts stays green AND
 * wears a distinct stale marker; never a silent green→brown reversion).
 */
export type DriftState = 'fresh' | 'stale' | 'drifted-undescribed';

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
  /**
   * The number of declared leaf contracts (the spec's `## Contracts` section, parsed via
   * `parseContracts` from `@storytree/library`) — 0 when the spec declares no `## Contracts` section.
   */
  testCount: number;
  /**
   * Whether this node can be driven through the prove-it-gate (it carries a proof config — spec-borne
   * or registry), i.e. `storytree node build <id>` would resolve. Drives the studio's UI-driven Build
   * control (ADR-0090 Phase 1): the Build button is offered only for a buildable node. Computed
   * server-side via the SAME `resolveBuildConfig` discovery `node build`/`node resolve` use.
   */
  buildable?: boolean;
  verdict?: TreeVerdict;
  /**
   * Binding-staleness drift of the code this unit's proof was signed against (ADR-0016 §3), present
   * only when the live store carries the unit's anchor + change log (the data-wiring is a deferred
   * slice; absent today). It rides ALONGSIDE `status`/`verdict`, never replacing them — see
   * `worldStatus.driftBadge`.
   */
  drift?: DriftState;
  error?: string;
}

/**
 * The status-aware go-green AFFORDANCE (ADR-0094, mirrors `@storytree/orchestrator`'s `StoryGoGreen`
 * locally — the studio is browser-bundled and must not import the node-only orchestrator):
 * - `build` — a `proposed` story with a real build to drive (`story build --real`): drive its
 *   author-declared obligations red→green through the gate.
 * - `adopt` — a `mapped` brownfield story with declared `## Reliability Gates`: observe-and-sign each
 *   to an `adopted` verdict (`storytree gate run <id> --pg`, ADR-0085). Never a fail-closed Build.
 * - `none` — `healthy` (re-verification aside), a `mapped` story with no gates yet, a `proposed` story
 *   with no real path, or `unhealthy` (red-recovery is the agent loop, not a user button — ADR-0094 d.2).
 */
export type StoryGoGreen = 'build' | 'adopt' | 'none';

/** One reliability gate to Adopt — its id + kind + (for an `observe` gate) the command the spine
 * observe-and-signs (ADR-0085). The studio surfaces these as the `storytree gate run <id> --pg` path. */
export interface AdoptGate {
  id: string;
  kind: 'observe' | 'build-tests' | 'integrate';
  /** The declared command the spine OBSERVES (present for `observe` gates; absent for build-tests/integrate). */
  command?: string;
}

/**
 * One capability's covered/uncovered classification in the adoption plan (ADR-0097 Layer 2). Mirrors
 * the orchestrator's `CapAdoption` locally — the studio is browser-bundled and must NOT import the
 * node-only orchestrator (computed server-side, shipped on {@link TreeStory.adoption}).
 */
export interface AdoptionCap {
  /** The capability id. */
  capId: string;
  /** Structural (Fork-1) verdict: covered iff a declared `(covers:)` reliability gate names it. */
  covered: boolean;
  /** The covering gate ids (empty when uncovered) — surfaced so the panel shows HOW it's covered. */
  coveredBy: string[];
}

/**
 * The adoption plan for a brownfield story (ADR-0097 Layer 2): the per-capability covered/uncovered
 * classification (the structural covers-diff, Fork 1) — "what still owes real work." Present only when
 * `goGreen === 'adopt'`. The finer observe/R1/R2 call of the uncovered set is the story-author's
 * analysis (ADR-0098, proposed), not surfaced here.
 */
export interface AdoptionPlan {
  capabilities: AdoptionCap[];
  /** The covered cap ids (a declared `(covers:)` gate names each). */
  covered: string[];
  /** The uncovered cap ids — the set that still owes real `build-tests` work (holds the crown `proposed`). */
  uncovered: string[];
}

/**
 * One WITNESSABLE UAT test criterion's proof-state summary (the lantern-walk arc, forest-parcels inc-2):
 * `proven` — the latest SIGNED verdict for this test id is a pass; `failing` — the latest signed
 * verdict is a fail; `pending` — no signed verdict yet, OR the live store can't answer (json backend /
 * down DB) — never fabricated. DELIBERATELY the same rigor as {@link UatTestCriterionRow.proven}
 * (signed proof, never the lower-rigor human/machine vouch mark), just folded to a compact per-story
 * summary shape for the tree wire.
 */
export interface UatCriterionSummary {
  id: string;
  state: 'proven' | 'pending' | 'failing';
}

/** One story: its own spec fields, story-level depends_on, and its capability DAG. */
export interface TreeStory {
  id: string;
  title: string;
  outcome: string;
  status: WorkStatus | null;
  proofMode: string;
  /**
   * Who witnesses this story's UAT (ADR-0040) — the EFFECTIVE value, resolved server-side
   * through core's `effectiveUatWitness` (absent frontmatter = 'human', fail-closed). Only
   * human-witnessed stories carry a signpost in the world.
   */
  uatWitness: 'human' | 'machine';
  /** Story ids this story depends on (frontmatter `depends_on` — consumed cross-story seams). */
  dependsOn: string[];
  /**
   * Provider-side inbound edges (frontmatter `consumed_by`, ADR-0074 §4): the story ids that
   * CONSUME this organism — the complement of `dependsOn`. The radial world (ADR-0074 §6) draws
   * these as the faint hub SPOKES (e.g. a spoke per organism declaring `consumed_by: [cli]`); the
   * forest's `depends_on` roads omit them. `[]` for the common case.
   */
  consumedBy: string[];
  /**
   * Studio render hint (ADR-0076, frontmatter `render: building`): when true this story is a
   * foundation utility drawn as a BUILDING on the map with NO connection lines, rather than its
   * own connected island/organism node. A MANUAL, agent-authored tag (set during story writing /
   * review), never derived. `library` is the first tagged building. Absent/false = a normal island.
   */
  building?: boolean;
  /** Whether this story node is gate-buildable (see {@link TreeCapability.buildable}, ADR-0090 Phase 1). */
  buildable?: boolean;
  /**
   * Whether pressing Build on the STORY itself runs a whole-story build (`storytree story build <id>
   * --real`): a non-empty drive order whose every driven capability (and the story's own UAT node,
   * unless human-witnessed and withheld) is REAL-buildable. Computed server-side via the SAME
   * `isStoryBuildable` predicate `story build` prechecks with, so the studio's story-level Build
   * affordance never offers a chain the gate would refuse. Distinct from `buildable` (the story
   * NODE's own single-node buildability): a story can be story-buildable while its UAT node is not a
   * single buildable node, and vice versa. Honest by absence — `agent` (capless) and
   * `drive-machinery` (no real-buildable caps) are not story-buildable.
   */
  storyBuildable?: boolean;
  /**
   * The status-aware go-green AFFORDANCE the panel renders (ADR-0094): `build` (drive a `proposed`
   * story), `adopt` (observe-and-sign a `mapped` story's reliability gates), or `none`. Computed
   * server-side via the SAME `storyGoGreen` predicate the orchestrator owns, so the studio surfaces
   * the affordance that can actually green the story — never a fail-closed Build over a mature
   * brownfield artifact. Supersedes `storyBuildable` for the go-green control's framing (the latter
   * stays the build-POST MECHANISM precheck). Absent when the spec failed to load.
   */
  goGreen?: StoryGoGreen;
  /** The reliability gates to Adopt — present only when `goGreen === 'adopt'` (ADR-0094 / ADR-0085). */
  adoptGates?: AdoptGate[];
  /**
   * The Layer-2 adoption plan (ADR-0097): the per-capability covered/uncovered classification —
   * "what still owes real work." Present only when `goGreen === 'adopt'`; computed server-side via the
   * orchestrator's `classifyAdoption` covers-diff so the studio never imports the node-only spine.
   */
  adoption?: AdoptionPlan;
  /**
   * The story's deciding ADR numbers (`decisions:` frontmatter, ADR-0037 §2) — the "Relevant ADRs" the
   * panel links to the Decisions-group Library docs. `[]` when the story declares none / the spec failed
   * to load. Plumbed through for ADR-0097 Layer 2's panel context.
   */
  decisions?: number[];
  /** The story's OWN UAT verdict (unit_id = story id) — never a child roll-up. */
  verdict?: TreeVerdict;
  /** Binding-staleness drift of the story's own UAT span (ADR-0016 §3); see {@link TreeCapability.drift}. */
  drift?: DriftState;
  /**
   * The story's WITNESSABLE UAT test criteria, summarised for the lantern-walk map layer
   * (forest-parcels inc-2): one entry per declared `## UAT Test Criteria` leg that is NOT a would-be
   * (aspirational, ADR-0097) leg. `## Reliability Gates` (ADR-0085 brownfield obligations) are
   * deliberately EXCLUDED — this is the story's own UAT test criteria, a narrower set than the crown's
   * full green obligation union ({@link applyUatCrowns}'s `ownObligations`). Computed server-side, set
   * for every story that reaches the tree route (possibly `[]`) — optional here only because it is
   * settled by a later enrichment pass, like {@link TreeStory.verdict}, and a hand-built pre-pass
   * fixture (e.g. `readTree` callers in tests) legitimately omits it.
   */
  uatCriteria?: UatCriterionSummary[];
  capabilities: TreeCapability[];
  error?: string;
}

/**
 * RETIRING (ADR-0200 D7 — self-reported presence retires; the claim ledger is the one
 * coordination + observability signal): the studio FRONTEND no longer reads this shape anywhere
 * (the presence lib, the `/api/presence` poll, and every session render are deleted). It is kept
 * ONLY because apps/studio/server (a parallel inc-6 lane's fence) still emits presence
 * (`libraryBackend.activeSessions` / the `/api/tree` `sessions` seed / `/api/presence`); delete
 * this type — and {@link TreePayload.sessions} below — with that server-side retirement.
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
  /**
   * RETIRING (ADR-0200 D7) — see {@link TreeSession}: no frontend reader remains; kept only
   * until the parallel server lane stops seeding it into `/api/tree`.
   */
  sessions?: TreeSession[];
  /** Present only when the live store answered AND at least one build is in flight (ADR-0048). */
  builds?: BuildActivity[];
  /**
   * STALE CONTRACT (ADR-0200 D7): historically documented as the claims seed sibling to `builds`
   * ("so the world paints claim wisps on first load too") — but `/api/tree` never actually sets this
   * field; only `builds` is seeded there (apps/studio/server/apiRouter.ts's `/api/tree` handler;
   * it never assigns `payload.claims`). Claims (and departures) are seeded instead by the FIRST
   * poll of the same `/api/activity` wire `useClaimActivity` already reads (lib/buildActivity.ts)
   * — a one-poll-cycle-later seed, not a one-shot one. Left optional / always-undefined so
   * `p.claims ?? []` degrades identically either way (dead but harmless); not removed here — a
   * TreePayload wire shape change is apps/studio/server/** territory, outside this unit's file
   * fence. The retired presence layer's `sessions?` seed is GONE outright (this lane).
   */
  claims?: ClaimActivity[];
}

// ---------- per-UAT-test attestations (ADR-0044) ----------

/**
 * A recorded attestation mark (mirrors core's `Attestation`) — a SIGNED vouch that a human
 * or a machine saw a test work. NOT a gate verdict (it never paints the crown-green hue;
 * ADR-0044 d.2): it renders distinctly in the story detail and never rolls up to the story.
 */
export interface AttestationMark {
  testId: string;
  outcome: 'pass' | 'fail';
  witness: 'human' | 'machine';
  /** The resolved signing identity (the operator who observed, or the machine runner). */
  signer: string;
  at: string;
  note?: string;
  /** The agent/session that scribed a relayed human attestation (absent = direct/machine). */
  relayedBy?: string;
}

/**
 * One UAT test of a story (parsed from its `## UAT Test Criteria` prose) joined with its latest
 * human/machine attestation. `witness` is the RESOLVED binary witness (ADR-0106): the server resolves
 * the declared permission (`human`|`machine`|`either`) through the SAME classifier the adopt pass uses
 * before it leaves the wire, so the owner surface is binary — `human` shows a confirm affordance, a
 * `machine` leg shows none, and the undecided `either` is NEVER rendered (ADR-0106 d.5). `human`/
 * `machine` are the actual recorded vouch marks (absent = un-attested → blank).
 */
export interface UatTestCriterionRow {
  id: string;
  title: string;
  /** The RESOLVED binary witness (ADR-0106) — `either` is resolved server-side and never reaches here. */
  witness: 'human' | 'machine';
  human?: AttestationMark;
  machine?: AttestationMark;
  /**
   * The per-test PROVEN state (ADR-0082): the latest SIGNED verdict in `events.verdict` for this
   * test id — `pass` (✓) / `fail` (✗) / absent (–, never proven). This is the real gate verdict; the
   * per-test UAT roll-up is one of the two clauses that green the story crown (the other is all
   * capabilities proven healthy — `rollupStoryGreen`, ADR-0083 Fork A). DELIBERATELY DISTINCT from
   * the lower-rigor `human`/`machine` vouch marks above (a vouch is not a proof). Silently absent
   * when the live store can't answer (json backend / down DB), like the CLI tree's proven glyphs.
   */
  proven?: 'pass' | 'fail';
}

/** GET /api/attestations?storyId=… — a story's UAT test criteria with their per-test marks + proven state. */
export interface AttestationsPayload {
  storyId: string;
  tests: UatTestCriterionRow[];
  /**
   * The story's own UAT roll-up (ADR-0082 d.3): the AND over its per-test SIGNED verdicts —
   * `healthy` iff every declared test has a signed pass, `unhealthy` if any regressed to a signed
   * fail, `null` (abstain/under-claim) otherwise. Absent when the live store can't answer.
   */
  storyUat?: 'healthy' | 'unhealthy' | null;
  /**
   * The "no `either` at rest" guard (ADR-0106 d.1): the ids of UAT legs still declared `either`
   * (undecided) on an ADOPTED story (past `mapped`) — an invariant violation, since the adopt
   * story-writer pass should have recorded each leg's decided witness. Present (non-empty) only when
   * the violation exists; the UI surfaces it as a re-author nudge. A still-`mapped` (pre-adopt) story
   * legitimately holds undecided legs, so the guard does not fire for it.
   */
  unresolvedWitnesses?: string[];
}

/**
 * POST /api/uat/attest — the result of signing an `operator-attested` UAT verdict (ADR-0082): the
 * real `events.verdict` row minted (NOT the `events.attestation` vouch), echoed back with the
 * story's fresh UAT roll-up so the UI can confirm whether the signature greened the crown.
 */
export interface UatVerdictResult {
  verdict: { unitId: string; outcome: 'pass' | 'fail'; signer: string; at: string };
  storyUat?: 'healthy' | 'unhealthy' | null;
}

// ---------- in-flight build activity (GET /api/activity, ADR-0048) ----------

/**
 * How long an `events.work_event` `building` row reads as "a leaf agent is
 * building this unit right now" before it's treated as stale and stops orbiting
 * (ADR-0048 §2). MUCH tighter than the 4 h session staleness: a build is bounded
 * and self-terminating, so a dangling `building` (a hard-killed run that never
 * produced a terminal verdict) clears in minutes, not hours — no multi-hour
 * false positives. Applied both server-side (bounds the read) and client-side
 * (the ticker ages it between polls).
 */
export const BUILD_IN_FLIGHT_TTL_MS = 20 * 60 * 1_000; // 20 minutes

/**
 * A build the harness is driving through the prove-it-gate right now (ADR-0048):
 * the latest `building` work-event for a unit whose run has not yet produced a
 * signed verdict, within {@link BUILD_IN_FLIGHT_TTL_MS}. This is the signal the
 * orbiting wisp is sourced from — mechanical work, not session presence. Keyed
 * by `runId` so it has its own identity (never a session's), self-clearing when
 * the verdict lands (pass → hands off to the ADR-0045 bloom) or the TTL passes.
 */
export interface BuildActivity {
  /** The unit being built — a story or capability id (resolves to a territory). */
  unitId: string;
  /** The work tier (story | capability | contract). */
  tier: string;
  /** The build run id — the wisp's stable identity (orbit phase, react key). */
  runId: string;
  /** When the `building` event was appended (ISO) — drives TTL aging. */
  at: string;
  /**
   * The LIVE prove-it-gate phase the latest `building` mark for this run was emitted at (ADR-0048
   * §3 v2) — `AUTHOR_TEST`/`CONFIRM_RED`/`IMPLEMENT`/`CONFIRM_GREEN`/`GATE`. The studio folds it to a
   * red→green wisp BAND. Absent for a pre-ADR-0048 `building` row (or the json/down-DB read) — the
   * wisp then shows the coarse teal "building" band. Mirrors `BuildPhase` in proof-protocol (the
   * studio is browser-bundled, so it duplicates the literal union rather than importing the contract).
   */
  phase?: BuildPhase;
  /**
   * The live SUBAGENT colour-state the latest `building` work-event stamped (ADR-0138 §5,
   * `WorkEventDoc.colourState`) — the role the orchestrator was running when the mark was emitted.
   * Advisory + optional + back-compat, EXACTLY like `phase`: absent for a pre-ADR-0138 row (or the
   * json/down-DB read), in which case the build wisp keeps its plain `phaseBand` look. Threaded onto
   * the build wisp as a role tint. Mirrors `SubagentColourState` (the studio is browser-bundled, so
   * it duplicates the literal union rather than importing `@storytree/drive`).
   */
  colourState?: SubagentColourState;
}

/**
 * The three ADR-0138 §5 subagent colour-states — what the orchestrator is doing on a claimed story:
 * `authoring` (story-author), `proving` (red→green leaf), `supplementing` (glue). Mirrors
 * `@storytree/drive`'s `subagentColourState` OUTPUT locally (like {@link BuildPhase} mirrors the
 * proof-protocol enum) — the studio is browser-bundled and must NOT import the drive/agent packages
 * (`modelPathBoundary.test.ts`). GUARANTEED never `green`/`bloom`: a claim is a coordination signal,
 * never a proof (only a signed verdict paints the green bloom — the §5 honesty wall).
 */
export type SubagentColourState = 'authoring' | 'proving' | 'supplementing';

/**
 * A story CLAIM the world renders as an orbiting coordination wisp (ADR-0138 §5): the live
 * `events.node_claim` for a claimed story, folded server-side ({@link import('../server/inFlightActivity').claimsToActivity}).
 * `kind: "claim"` is the DISCRIMINATOR — the renderer paints this VISIBLY DISTINCT from a proven-green
 * bloom (ADR-0045): a claim is "a session is working this story," never a proof. The wire shape mirrors
 * the server's `ClaimActivity`; the colour is folded from `intent` client-side (lib/claimColour.ts).
 */
export interface ClaimActivity {
  /** The claimed unit — a story or capability id (resolves to a territory). */
  unitId: string;
  /** Discriminator: always "claim" — never "green"/"bloom" (the §5 honesty wall). */
  kind: 'claim';
  /** The claiming session — the claim wisp's stable identity (orbit phase, react key). */
  sessionId: string;
  /** The claim's branch (released on its CI merge — ADR-0138 §4). */
  branch: string;
  /** The free-prose intent the spine stamped ("edit"|"real"|"orchestrate", or other) — folded to a
   *  colour-state client-side; an unknown intent defaults to `supplementing` (never throws). */
  intent: string;
  /**
   * The claim's GRADE (ADR-0200 D2/D7) — which drawable family the world renders: `exploring` hovers
   * at rest beside the tree, `waiting` queues in a visible line, `work` orbits (the original claim
   * wisp). Mirrors the server's folded output (apps/studio/server/inFlightActivity.ts's
   * `claimsToActivity`, which already normalises an absent/unrecognised raw grade to `work`), so a
   * live row always carries one. OPTIONAL / absent-by-default here anyway — the back-compat idiom
   * every field on this wire follows ({@link BuildActivity.phase} etc.) — so a hand-built fixture
   * that predates ADR-0200 (or a narrower mock) still type-checks; a reader defaults a missing grade
   * to `work` (the SAME D2 back-compat default the server applies).
   */
  grade?: ClaimGrade;
  /** ISO string of when the claim was taken (`claimed_at`). */
  at: string;
}

/**
 * The prove-it-gate's red-green phases (ADR-0020 §1 / ADR-0048 §3 v2), mirrored locally like
 * {@link WorkStatus} — the studio is browser-bundled and reads this off the `/api/activity` wire; it
 * MUST NOT import the node-only orchestrator or the proof-protocol's zod enum at the type layer.
 */
export type BuildPhase =
  | 'AUTHOR_TEST'
  | 'CONFIRM_RED'
  | 'IMPLEMENT'
  | 'CONFIRM_GREEN'
  | 'GATE';

/**
 * GET /api/activity — the map-activity layer (ADR-0048 builds + ADR-0138 story claims + ADR-0200 D7
 * claim departures), polled on the shared slow cadence (lib/poll.ts). Always a 200: `null` is the advisory-absent answer
 * (down DB / json store), never a 503; `[]` means nothing is building / claimed / departing right now.
 * `claims` is optional on the wire (a narrow backend may omit it → treated as `null`), back-compat
 * with a pre-ADR-0138 server that sent only `builds`; `departures` is the SAME optional/back-compat
 * shape, sibling to `claims` (a pre-ADR-0200-D7 server omits it → treated as `null`).
 */
export interface ActivityPayload {
  builds: BuildActivity[] | null;
  claims?: ClaimActivity[] | null;
  departures?: DepartedClaim[] | null;
}

// ---------- claim-ledger dock view (GET /api/claims, ADR-0200 D7) ----------

/**
 * The claim GRADES — mirrors `ClaimGradeT` from `@storytree/notice-board` locally (like
 * {@link BuildPhase}/{@link SubagentColourState} above mirror proof-protocol/drive enums rather
 * than importing them): `work` (the exclusive build/edit mutex), `waiting` (queued behind a work
 * holder), `exploring` (shared, session-start "what I'm thinking").
 */
export type ClaimGrade = 'exploring' | 'waiting' | 'work';

/**
 * A recently-RELEASED claim still inside the departure window (ADR-0200 D7 — wisp-out legibility,
 * unparking friction-released-build-wisp-reads-as-lost-claim): rendered as a fading `departing-wisp`
 * instead of vanishing indistinguishably from a lost/stale claim. Mirrors the server's `DepartedClaim`
 * (apps/studio/server/inFlightActivity.ts / `@storytree/notice-board`'s `foldDepartures`) exactly —
 * `{unitId, sessionId, grade, ageMs, at}`. `ageMs` is the server's READ-TIME snapshot (elapsed ms
 * since the release, as of the poll that answered); the client folds it to a fade ratio against the
 * DEPARTURE_WINDOW_MS mirrored in TreeView.tsx rather than re-deriving it from `at` + a live ticker —
 * a departure is a courtesy read, not a re-ticked wisp (so it fades in discrete poll-sized steps, not
 * continuously).
 */
export interface DepartedClaim {
  unitId: string;
  sessionId: string;
  /** The grade the claim held when released — `work` when the doc doesn't say (pre-grade/odd docs). */
  grade: ClaimGrade;
  /** Elapsed ms since the release, as of the server's read (not re-ticked client-side). */
  ageMs: number;
  /** When the release was written (ISO 8601). */
  at: string;
}

/** One claim inside a {@link SessionClaimGroup} — mirrors the server's `SessionClaimEntry`. */
export interface SessionClaimEntry {
  unitId: string;
  grade: ClaimGrade;
  intent: string;
  /** Elapsed ms since `claimedAt`, stamped by the server at read time. */
  ageMs: number;
  claimedAt: string;
}

/**
 * One session's live claims — the studio session dock's claims-grouped-by-session rendering unit
 * (ADR-0200 D7). Mirrors the server's `SessionClaimGroup` (packages/notice-board's pure
 * `groupClaimsBySession` fold), oldest-session-first, claims within a group ranked work > waiting >
 * exploring.
 */
export interface SessionClaimGroup {
  sessionId: string;
  branch: string;
  claims: SessionClaimEntry[];
}

/**
 * GET /api/claims — every live claim row folded by session (ADR-0200 D7), sibling to
 * {@link ActivityPayload}: `sessions: null` means the live store didn't answer (down DB / json
 * store) — advisory absence, not an error; the dock renders an honest silent-store note. Fetched
 * only while the session dock is open (not on the world's poll cadence — no new always-on cost
 * class).
 */
export interface ClaimsPayload {
  sessions: SessionClaimGroup[] | null;
}

// ---------- UI-driven build (POST/GET /api/build, ADR-0090 Phase 1) ----------

/** A build run's lifecycle state (mirrors the server's `BuildRunStatus`). */
export type BuildRunStatus = 'building' | 'passed' | 'failed';

/** POST /api/build response: the accepted run's id (the client then polls GET for progress). */
export interface BuildIntentResult {
  runId: string;
}

/**
 * GET /api/build?runId — a run's live status + COARSE transcript. `envelope` (the final build body)
 * is present only on a `passed` run; `reason` only on a `failed` run. The transcript is ephemeral
 * progress (in-memory, gone on a dev-server restart); the DURABLE artifact is the signed verdict the
 * build persists to events.verdict, which the world reads via /api/tree.
 */
export interface BuildStatus {
  runId: string;
  unitId: string;
  status: BuildRunStatus;
  transcript: string[];
  envelope?: string;
  reason?: string;
}

