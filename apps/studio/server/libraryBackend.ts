// LibraryBackend — the persistence seam behind the studio dev API's /api/assets and
// /api/comments endpoints (see server/devApi.ts). The HTTP handlers parse + validate the
// request, stamp ids/timestamps, and map errors to status codes; the backend just persists.
//
// Two implementations sit behind the SAME interface so the /api/* request/response shapes the
// React client sees are byte-identical regardless of where state lives:
//   • JsonBackend — the original behaviour: reads/writes apps/studio/data/{assets,comments}.json.
//     The offline opt-out (no DB, $0, per-worktree state). Selected by STORYTREE_STUDIO_STORE='json'.
//   • PgBackend — the live shared Cloud SQL Postgres store (packages/store): a PgLibraryStore for
//     assets (stored as rendered GuidanceAsset docs) + a PgCommentStore for comments. The DEFAULT
//     (oq-studio-store-default → B, dogfooding shared state); needs `pnpm db:up` first. Built lazily
//     (first pg use) so an offline json session never touches pg.
//
// Asset write semantics (pg): a structured Knowledge unit is persisted as a STRUCTURED doc, not a
// rendered body (option C of oq-library-doc-shape, ADR-0013/0017/0023). The studio editor sends the
// per-kind `fields`; PgBackend builds the structured doc via `buildLibraryDoc`, MERGING over the
// existing stored doc so write-only metadata (the doc-level createdAt, schemaVersion) survives
// the edit. Reads render each stored Library doc back into the GuidanceAsset wire shape via
// renderStoredDoc (a structured unit → renderBody(doc) for `body` PLUS its per-kind `fields`; a doc
// that already has a string body — template / adr — → served as-is). A non-structured category, or a
// write without `fields`, still persists a rendered body-bearing asset.

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import type { UserDoc } from '@storytree/studio-members';
import type { PresenceDeclarationDoc } from '@storytree/notice-board';
import type { Attestation, Verdict } from '@storytree/proof-protocol';
import {
  type AssetCategory,
  type BuildActivity,
  type Comment,
  type GuidanceAsset,
  type TreeSession,
  type TreeVerdict,
} from '../src/types';
import { rowsToBuildActivity } from './inFlightBuilds';
import type { BuildRow } from './inFlightBuilds';
import { claimsToActivity } from './inFlightActivity';
import type { ClaimActivity, ClaimRow } from './inFlightActivity';

/** Latest-per-(testId,witness) attestation marks for one story's tests, keyed by test id. */
export type StoryAttestations = Record<string, { human?: Attestation; machine?: Attestation }>;

/** Fields the API validates from a create/update asset request (no server-stamped timestamps). */
export interface AssetInput {
  id: string;
  category: AssetCategory;
  title: string;
  description: string;
  body: string;
  references: string[];
  provenance?: string;
  /** Per-kind structured fields when `category` is a structured Knowledge kind (option C). */
  fields?: Record<string, string>;
}

/** Filter for listing comments: by topic id and/or topic kind (mirrors the JSON dev API filter). */
export interface CommentFilter {
  topicId?: string;
  topicKind?: 'doc' | 'asset';
}

/** A partial update to a comment, as the API derives it from a PATCH body. */
export interface CommentPatch {
  body?: string;
  resolved?: boolean;
  resolvedAt?: string | null;
}

/**
 * What /api/health reports beyond the store name. `schema` is the version-skew probe (pg +
 * reachable only): the library schemaVersion this CODE knows vs the highest the DB holds —
 * db > code means this long-running server is running stale code (the "specs is not iterable"
 * incident) and the UI tells the operator to pull + restart instead of blaming the DB.
 */
export interface HealthProbe {
  db: 'ok' | 'unreachable' | 'n/a';
  schema?: { code: number; db: number };
}

/** Thrown by createAsset when an asset with the requested id already exists (→ HTTP 409). */
export class AssetConflictError extends Error {
  constructor(public readonly assetId: string) {
    super(`an asset with id "${assetId}" already exists`);
    this.name = 'AssetConflictError';
  }
}

/**
 * The persistence seam. Assets and comments only. Docs (/api/docs) are NOT here — they are read
 * live from the filesystem and never touch the store.
 */
export interface LibraryBackend {
  listAssets(): Promise<GuidanceAsset[]>;
  /** Throws {@link AssetConflictError} if `input.id` already exists. */
  createAsset(input: AssetInput): Promise<GuidanceAsset>;
  /** Returns the updated asset, or `null` if `id` does not exist. */
  updateAsset(id: string, input: AssetInput): Promise<GuidanceAsset | null>;
  /** Returns `true` if a row was removed, `false` if `id` did not exist. */
  deleteAsset(id: string): Promise<boolean>;

  /** Cheap connectivity + schema-skew probe for /api/health. Never throws. */
  health(): Promise<HealthProbe>;

  /**
   * Latest signed verdict per unit from `events.verdict`, for the tree view's glyphs
   * (ADR-0033 owner decision 3: ✓ / ✗ / absent-means-never-built). NEVER throws —
   * `null` when there is no DB behind this backend (json) or the DB doesn't answer;
   * the tree renders without glyphs rather than failing (presence-block discipline).
   */
  latestVerdicts(): Promise<Record<string, TreeVerdict> | null>;

  /**
   * The RAW signed-verdict event stream (`events.verdict` as `{ kind, seq, doc }`), for the per-test
   * UAT crown roll-up (ADR-0082): a story that declares per-test UAT tests greens when EVERY per-test
   * verdict passes (`rollupStoryUat`), so the tree handler needs the events, not just the latest-per-
   * unit map. OPTIONAL + same advisory contract as {@link latestVerdicts}: `null` for the json
   * backend / a down DB; absent on a partial mock — the handler then skips the crown roll-up.
   */
  verdictEvents?(): Promise<ReadonlyArray<{ kind: string; seq: number; doc: unknown }> | null>;

  /**
   * Sign an `operator-attested` UAT verdict into `events.verdict` (ADR-0082 — the studio admin's
   * "I saw it work" in-UI signature, ADR-0044 §4 deferred). A REAL gate verdict (the same kind
   * `storytree uat attest` / a build signs), NOT the lower-rigor {@link recordAttestation} vouch —
   * it greens the story crown via `rollupStoryUat`. The CALLER (the HTTP layer) has already built
   * the {@link Verdict}, stamped its signer from the verified identity, and cleared `checkUatProof`;
   * this only PERSISTS it (the pg store re-validates the shape at its write boundary, fail-closed).
   * OPTIONAL: implemented only by the pg backend — the json backend omits it (no `events.verdict`),
   * so the handler refuses with "needs the live store", mirroring the CLI's `--pg`-only refusal.
   */
  signUatVerdict?(verdict: Verdict, actor: string): Promise<Verdict>;

  /**
   * Persist a builder's BROKERED presence declaration into events.session via PgPresenceStore.declare
   * — the SAME atomic append+upsert path `storytree noticeboard declare` and the presence hook write
   * through (ADR-0033). Used by the write-broker (ADR-0117): a remote builder's local session declares
   * its presence so it appears on the shared notice board / in the forest. Presence carries no signing
   * chain (ADR-0033 d.1), so `actor` is advisory — the store anchors the row on the declaration's own
   * sessionId. OPTIONAL: implemented only by the pg backend (the json backend has no events.session),
   * so the broker refuses with "needs the live store", mirroring {@link signUatVerdict}.
   */
  declarePresence?(doc: PresenceDeclarationDoc, actor: string): Promise<PresenceDeclarationDoc>;

  /**
   * Active notice-board sessions (events.session projection, ADR-0033) with the
   * staleness band derived at read time. NEVER throws — `null` for the json backend
   * or when the DB doesn't answer; presence is advisory and silently absent.
   */
  activeSessions(): Promise<TreeSession[] | null>;

  /**
   * In-flight builds (ADR-0048): the latest `events.work_event` `building` row per
   * unit whose run has not yet produced a signed verdict, within the TTL — the
   * harness signal the orbiting wisp is sourced from. Same advisory contract as
   * {@link activeSessions}: NEVER throws — `null` for json / a down DB.
   */
  inFlightBuilds(): Promise<BuildActivity[] | null>;

  /**
   * In-flight story CLAIMS (ADR-0138): every live `events.node_claim` row folded (via the pure
   * `claimsToActivity`) into a claimed-but-not-proven map activity (`kind: "claim"`), so a CLAIMED
   * story orbits a wisp VISIBLY DISTINCT from a proven-green bloom — the §5 honesty wall (a claim is
   * never a proof). Same advisory contract as {@link inFlightBuilds}: NEVER throws — `null` for the
   * json backend / a down DB. OPTIONAL like {@link verdictEvents}: a narrow mock may omit it, and the
   * `/api/activity` handler falls back to `null` (advisory absence, never an over-claim).
   */
  inFlightClaims?(): Promise<ClaimActivity[] | null>;

  listComments(filter: CommentFilter): Promise<Comment[]>;
  createComment(comment: Comment): Promise<Comment>;
  /** Returns the merged comment, or `null` if `id` does not exist. */
  updateComment(id: string, patch: CommentPatch): Promise<Comment | null>;
  /** Returns `true` if a row was removed, `false` if `id` did not exist. */
  deleteComment(id: string): Promise<boolean>;

  // ----- suggestions (ADR-0140, member-suggest-write-policy) -----
  // The suggestion-decision seam behind POST /api/suggestions/decision. OPTIONAL like
  // {@link signUatVerdict}: implemented only by the pg backend (PgSuggestionStore over
  // events.suggestion_event / events.suggestion) — the json backend omits them, so the route
  // refuses with "needs the live store" (503) instead of pretending to decide.
  /** One suggestion by id, or `null` when absent. */
  getSuggestion?(id: string): Promise<Suggestion | null>;
  /**
   * The suggestion projection, optionally topic/status-filtered — the review-feed's second source
   * (review-refresh-feed, ADR-0140). Same optionality posture as {@link getSuggestion}: pg only;
   * the json backend omits it and the feed degrades to an empty suggestion list (never a throw).
   */
  listSuggestions?(filter?: SuggestionFilter): Promise<Suggestion[]>;
  /**
   * Persist a NEW open suggestion (member-suggest create, ADR-0140) through the store's atomic
   * create (append the `created` event + upsert the projection; the store's zod boundary
   * validates the doc). Same optionality posture as {@link getSuggestion}: pg only; the json
   * backend omits it and POST /api/suggestions refuses 503.
   */
  createSuggestion?(s: Suggestion, actor: string): Promise<Suggestion>;
  /**
   * Apply an accept/reject decision through the store's atomic transition (append the
   * `transitioned` event + upsert the projection). Returns the updated suggestion, `null` if the
   * id does not exist; throws the store's closed-suggestion error on a re-decide race.
   */
  transitionSuggestion?(
    id: string,
    action: 'accept' | 'reject',
    decidedBy: string,
    decidedAt: string,
  ): Promise<Suggestion | null>;

  // ----- members (app-owned users, ADR-0043) -----
  // The app-owned directory the hosted server authorizes from. The last-admin guard and zod
  // validation are enforced at the write boundary; a guard violation throws an error whose
  // `name` is 'LastAdminError' (mapped to 409 by the route layer).
  /** The whole directory (one row per lowercased email). */
  listUsers(): Promise<UserDoc[]>;
  /** One user by email, or `null` when not in the directory. */
  getUser(email: string): Promise<UserDoc | null>;
  /** Invite / re-role / activate (the caller spreads the existing row to preserve unset fields). */
  upsertUser(doc: UserDoc, actor: string): Promise<UserDoc>;
  /** Returns `true` if a row was removed, `false` if absent. Throws on a last-admin violation. */
  removeUser(email: string, actor: string): Promise<boolean>;

  // ----- per-UAT-test attestations (ADR-0044 attestation-surface) -----
  // A SIGNED vouch log, deliberately separate from verdicts. listAttestations is the DISPLAY
  // projection (latest human/machine per test) filtered to one story's `<story>#uat-*` tests;
  // recordAttestation appends one validated signal. NEVER touches events.verdict (d.2), and the
  // story island hue is unaffected (d.3) — these live in the detail only.
  /** Latest human/machine marks for the story's tests, keyed by test id. `{}` for json/down DB. */
  listAttestations(storyId: string): Promise<StoryAttestations>;
  /** Append a signed attestation (validated at the write boundary). Returns the persisted doc. */
  recordAttestation(att: Attestation, actor: string): Promise<Attestation>;

  /** Release any resources (the pg pool). No-op for the JSON backend. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// JsonBackend — the original data/*.json behaviour, refactored out of the handlers.
// ---------------------------------------------------------------------------

async function readStore<T>(file: string, fallback: T): Promise<T> {
  if (!existsSync(file)) return fallback;
  const raw = await fs.readFile(file, 'utf8');
  return raw.trim() ? (JSON.parse(raw) as T) : fallback;
}

async function writeStore(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export class JsonBackend implements LibraryBackend {
  readonly #assetsFile: string;
  readonly #commentsFile: string;
  readonly #usersFile: string;
  readonly #attestationsFile: string;

  constructor(opts: {
    assetsFile: string;
    commentsFile: string;
    usersFile: string;
    attestationsFile: string;
  }) {
    this.#assetsFile = opts.assetsFile;
    this.#commentsFile = opts.commentsFile;
    this.#usersFile = opts.usersFile;
    this.#attestationsFile = opts.attestationsFile;
  }

  async listAssets(): Promise<GuidanceAsset[]> {
    return readStore<GuidanceAsset[]>(this.#assetsFile, []);
  }

  async createAsset(input: AssetInput): Promise<GuidanceAsset> {
    const assets = await this.listAssets();
    if (assets.some((a) => a.id === input.id)) throw new AssetConflictError(input.id);
    const now = new Date().toISOString();
    const asset: GuidanceAsset = { ...input, createdAt: now, updatedAt: now };
    assets.push(asset);
    await writeStore(this.#assetsFile, assets);
    return asset;
  }

  async updateAsset(id: string, input: AssetInput): Promise<GuidanceAsset | null> {
    const assets = await this.listAssets();
    const idx = assets.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const existing = assets[idx] as GuidanceAsset;
    const next: GuidanceAsset = {
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    assets[idx] = next;
    await writeStore(this.#assetsFile, assets);
    return next;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const assets = await this.listAssets();
    const next = assets.filter((a) => a.id !== id);
    if (next.length === assets.length) return false;
    await writeStore(this.#assetsFile, next);
    return true;
  }

  async health(): Promise<HealthProbe> {
    return { db: 'n/a' }; // no DB behind the JSON files — nothing to probe
  }

  async latestVerdicts(): Promise<Record<string, TreeVerdict> | null> {
    return null; // no events.verdict behind the JSON files — glyphs silently absent
  }

  async verdictEvents(): Promise<ReadonlyArray<{ kind: string; seq: number; doc: unknown }> | null> {
    return null; // no events.verdict behind the JSON files — the UAT crown roll-up is skipped
  }

  async activeSessions(): Promise<TreeSession[] | null> {
    return null; // no events.session behind the JSON files — presence silently absent
  }

  async inFlightBuilds(): Promise<BuildActivity[] | null> {
    return null; // no events.work_event behind the JSON files — activity silently absent
  }

  async inFlightClaims(): Promise<ClaimActivity[] | null> {
    return null; // no events.node_claim behind the JSON files — claim wisps silently absent
  }

  async listComments(filter: CommentFilter): Promise<Comment[]> {
    const comments = await readStore<Comment[]>(this.#commentsFile, []);
    return comments.filter(
      (c) =>
        (filter.topicId === undefined || c.topicId === filter.topicId) &&
        (filter.topicKind === undefined || c.topicKind === filter.topicKind),
    );
  }

  async createComment(comment: Comment): Promise<Comment> {
    const comments = await readStore<Comment[]>(this.#commentsFile, []);
    comments.push(comment);
    await writeStore(this.#commentsFile, comments);
    return comment;
  }

  async updateComment(id: string, patch: CommentPatch): Promise<Comment | null> {
    const comments = await readStore<Comment[]>(this.#commentsFile, []);
    const idx = comments.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const existing = comments[idx] as Comment;
    const next: Comment = { ...existing };
    if (patch.body !== undefined) next.body = patch.body;
    if (patch.resolved !== undefined) {
      next.resolved = patch.resolved;
      next.resolvedAt = patch.resolved ? new Date().toISOString() : null;
    }
    comments[idx] = next;
    await writeStore(this.#commentsFile, comments);
    return next;
  }

  async deleteComment(id: string): Promise<boolean> {
    const comments = await readStore<Comment[]>(this.#commentsFile, []);
    const next = comments.filter((c) => c.id !== id);
    if (next.length === comments.length) return false;
    await writeStore(this.#commentsFile, next);
    return true;
  }

  // ----- users (data/users.json) — the offline mirror of PgUserStore. Validation + the
  // last-admin guard run through @storytree/studio-members (lazily loaded, the config-load trap). -----

  async listUsers(): Promise<UserDoc[]> {
    return readStore<UserDoc[]>(this.#usersFile, []);
  }

  async getUser(email: string): Promise<UserDoc | null> {
    const members = await loadStudioMembersModule();
    const target = members.normalizeEmail(email);
    return (await this.listUsers()).find((u) => u.email === target) ?? null;
  }

  async upsertUser(doc: UserDoc, _actor: string): Promise<UserDoc> {
    const members = await loadStudioMembersModule();
    const validated = members.User.parse(doc); // role-status-validated at the boundary
    const users = await this.listUsers();
    const idx = users.findIndex((u) => u.email === validated.email);
    let persisted: UserDoc;
    if (idx !== -1) {
      const existing = users[idx] as UserDoc;
      const { email: _e, createdAt: _c, ...patch } = validated;
      persisted = members.mergeUser(existing, patch);
      if (members.wouldOrphanAdminsOnRole(users, validated.email, persisted.role)) {
        throw lastAdminError(`refusing to downgrade ${validated.email}: at least one admin must remain`);
      }
      users[idx] = persisted;
    } else {
      persisted = validated;
      users.push(persisted);
    }
    await writeStore(this.#usersFile, users);
    return persisted;
  }

  async removeUser(email: string, _actor: string): Promise<boolean> {
    const members = await loadStudioMembersModule();
    const target = members.normalizeEmail(email);
    const users = await this.listUsers();
    if (!users.some((u) => u.email === target)) return false;
    if (members.wouldOrphanAdminsOnRemove(users, target)) {
      throw lastAdminError(`refusing to remove ${target}: at least one admin must remain`);
    }
    await writeStore(this.#usersFile, users.filter((u) => u.email !== target));
    return true;
  }

  // ----- attestations (data/attestations.json) — the offline mirror of PgAttestationStore.
  // Append-only array; the display projection is derived via @storytree/orchestrator (lazy). -----

  async listAttestations(storyId: string): Promise<StoryAttestations> {
    // deriveAttestations is the farmer's projection compute — it MOVED to @storytree/orchestrator
    // (ADR-0068 step 1), loaded lazily like the other Node-only farmer modules.
    const orchestrator = await loadOrchestratorModule();
    const stored = await readStore<Attestation[]>(this.#attestationsFile, []);
    const map = orchestrator.deriveAttestations(stored.map((doc, i) => ({ seq: i + 1, doc })));
    const out: StoryAttestations = {};
    for (const [testId, entry] of map) {
      if (testId.startsWith(`${storyId}#`)) out[testId] = entry;
    }
    return out;
  }

  async recordAttestation(att: Attestation, _actor: string): Promise<Attestation> {
    // The Attestation SHAPE is the verdict CONTRACT's. Though the contract is browser-safe (zod-only),
    // its raw-TS `.js` specifiers hit the same vite config-load trap as core/store, so the schema is
    // loaded lazily on first write — fail-closed at the write boundary.
    const { Attestation: AttestationDoc } = await loadContractModule();
    const validated = AttestationDoc.parse(att);
    const all = await readStore<Attestation[]>(this.#attestationsFile, []);
    all.push(validated);
    await writeStore(this.#attestationsFile, all);
    return validated;
  }

  async close(): Promise<void> {
    /* no resources to release */
  }
}

/** A last-admin guard violation tagged so the route layer maps it to 409 without importing the store. */
function lastAdminError(message: string): Error {
  return Object.assign(new Error(message), { name: 'LastAdminError' });
}

// ---------------------------------------------------------------------------
// PgBackend — the live Cloud SQL Postgres store (lazy pool).
// ---------------------------------------------------------------------------

// Cross-package, ESM. The runtime values (createPool/closePool/PgLibraryStore/PgCommentStore/
// renderStoredDoc + PgUserStore + PgAttestationStore + PgPresenceStore) are loaded LAZILY via dynamic
// imports the first time PgBackend is used — NOT a static top-level import. That matters: this module
// is reached at Vite config-load / `vite build` time (vite.config.ts → devApi.ts → here), where the
// loader has no tsx transform and cannot resolve the store subpaths' `.js` re-export specifiers
// (ERR_MODULE_NOT_FOUND on src/connection.js). It is also Node-only (pg / cloud-sql-connector) and has
// no place in a browser build. Keeping the imports dynamic means the store is only touched when
// STORYTREE_STUDIO_STORE='pg' actually runs the dev API.
//
// ADR-0077: `@storytree/store` was dissolved — the substrate + central drawers moved to
// `@storytree/library/store`, the presence drawer to `@storytree/notice-board/store`, the user drawer
// to `@storytree/studio-members/store`, and the attestation drawer to `@storytree/orchestrator/store`.
// We load each node-only `./store` subpath lazily and merge them into one module-shaped object so the
// `store.X` call sites below are unchanged.
//
// Types are `import type` only (fully erased under verbatimModuleSyntax), so they add no runtime import.
import type { PoolHandle, PgLibraryStore, PgCommentStore, PgSuggestionStore, Suggestion, SuggestionFilter } from '@storytree/library/store';
import type { PgUserStore } from '@storytree/studio-members/store';
import type { PgAttestationStore, PgWorkStore } from '@storytree/orchestrator/store';

// The merged store surface PgBackend uses: the library substrate/central drawers + the organism
// drawers it instantiates (user / attestation / presence), plus CURRENT_SCHEMA_VERSION from the
// library main entry (the schema-skew probe compares it against the DB's max version). Intersection of
// the four `./store` subpaths and the library main module.
type StoreModule = typeof import('@storytree/library/store') &
  typeof import('@storytree/studio-members/store') &
  typeof import('@storytree/orchestrator/store') &
  typeof import('@storytree/notice-board/store') &
  Pick<typeof import('@storytree/library'), 'CURRENT_SCHEMA_VERSION'>;

let storeModulePromise: Promise<StoreModule> | null = null;

/** Load the dissolved store's `./store` subpaths once, on first PgBackend use (never at config/build time). */
function loadStoreModule(): Promise<StoreModule> {
  return (storeModulePromise ??= Promise.all([
    import('@storytree/library/store'),
    import('@storytree/studio-members/store'),
    import('@storytree/orchestrator/store'),
    import('@storytree/notice-board/store'),
    import('@storytree/library'),
  ]).then(([lib, members, orch, notice, libMain]) => ({
    ...lib,
    ...members,
    ...orch,
    ...notice,
    CURRENT_SCHEMA_VERSION: libMain.CURRENT_SCHEMA_VERSION,
  })) as Promise<StoreModule>);
}

// @storytree/studio-members is raw-TS (its `.js` specifiers hit vite's config-load trap) — so the
// users last-admin guard compute (mergeUser / wouldOrphanAdmins*) is loaded lazily, on first use.
type StudioMembersModule = typeof import('@storytree/studio-members');

let studioMembersModulePromise: Promise<StudioMembersModule> | null = null;

function loadStudioMembersModule(): Promise<StudioMembersModule> {
  return (studioMembersModulePromise ??= import('@storytree/studio-members'));
}

// @storytree/notice-board is raw-TS too (same `.js` config-load trap), so classifyPresence is
// loaded lazily on the first presence read — even though it is browser-safe (zod-only, no node:).
// (ADR-0068 step 6b: presence moved out of core into the notice-board organism.)
type NoticeBoardModule = typeof import('@storytree/notice-board');

let noticeBoardModulePromise: Promise<NoticeBoardModule> | null = null;

function loadNoticeBoardModule(): Promise<NoticeBoardModule> {
  return (noticeBoardModulePromise ??= import('@storytree/notice-board'));
}

// @storytree/orchestrator hosts the farmer's proof COMPUTE (ADR-0068 step 1) — deriveAttestations
// and friends. Node-only and raw-TS like core/store, so it is loaded just as lazily, on first use.
type OrchestratorModule = typeof import('@storytree/orchestrator');

let orchestratorModulePromise: Promise<OrchestratorModule> | null = null;

function loadOrchestratorModule(): Promise<OrchestratorModule> {
  return (orchestratorModulePromise ??= import('@storytree/orchestrator'));
}

// @storytree/proof-protocol is raw-TS too: its `.js` specifiers don't resolve under vite's
// config-load (no tsx transform), so the Attestation SCHEMA is loaded lazily on first write —
// even though the contract is browser-safe (zod-only, no node:).
type ContractModule = typeof import('@storytree/proof-protocol');

let contractModulePromise: Promise<ContractModule> | null = null;

function loadContractModule(): Promise<ContractModule> {
  return (contractModulePromise ??= import('@storytree/proof-protocol'));
}

const DEFAULT_ACTOR = 'operator';

/** Coerce a rendered store doc (category: string) into the GuidanceAsset wire shape. */
function toGuidanceAsset(rendered: {
  id: string;
  category: string;
  title: string;
  description: string;
  body: string;
  references: string[];
  provenance?: string;
  fields?: Record<string, string>;
  degraded?: string;
  createdAt: string;
  updatedAt: string;
}): GuidanceAsset {
  return {
    id: rendered.id,
    category: rendered.category as AssetCategory,
    title: rendered.title,
    description: rendered.description,
    body: rendered.body,
    references: rendered.references,
    ...(rendered.provenance ? { provenance: rendered.provenance } : {}),
    ...(rendered.fields ? { fields: rendered.fields } : {}),
    ...(rendered.degraded ? { degraded: rendered.degraded } : {}),
    createdAt: rendered.createdAt,
    updatedAt: rendered.updatedAt,
  };
}

export class PgBackend implements LibraryBackend {
  #store: StoreModule | null = null;
  #handle: PoolHandle | null = null;
  #library: PgLibraryStore | null = null;
  #comments: PgCommentStore | null = null;
  #suggestions: PgSuggestionStore | null = null;
  #users: PgUserStore | null = null;
  #attestations: PgAttestationStore | null = null;
  #work: PgWorkStore | null = null;

  /** Build the pool + stores on first use (the JSON default must never touch pg). */
  async #ready(): Promise<{
    store: StoreModule;
    library: PgLibraryStore;
    comments: PgCommentStore;
    suggestions: PgSuggestionStore;
    users: PgUserStore;
    attestations: PgAttestationStore;
    work: PgWorkStore;
  }> {
    if (
      this.#store === null ||
      this.#library === null ||
      this.#comments === null ||
      this.#suggestions === null ||
      this.#users === null ||
      this.#attestations === null ||
      this.#work === null
    ) {
      const store = await loadStoreModule();
      const handle = await store.createPool();
      this.#store = store;
      this.#handle = handle;
      this.#library = new store.PgLibraryStore(handle.pool);
      this.#comments = new store.PgCommentStore(handle.pool);
      this.#suggestions = new store.PgSuggestionStore(handle.pool);
      this.#users = new store.PgUserStore(handle.pool);
      this.#attestations = new store.PgAttestationStore(handle.pool);
      // The work-hierarchy event store (events.verdict): the studio's `signUatVerdict` appends a
      // signed operator-attested verdict through it, the SAME store the CLI `uat attest` writes to.
      this.#work = new store.PgWorkStore(handle.pool);
    }
    return {
      store: this.#store,
      library: this.#library,
      comments: this.#comments,
      suggestions: this.#suggestions,
      users: this.#users,
      attestations: this.#attestations,
      work: this.#work,
    };
  }

  async listAssets(): Promise<GuidanceAsset[]> {
    const { store, library } = await this.#ready();
    const docs = await library.queryDocs();
    return docs.map((d) => toGuidanceAsset(store.renderStoredDoc(d)));
  }

  async createAsset(input: AssetInput): Promise<GuidanceAsset> {
    const { store, library } = await this.#ready();
    if (await library.getDoc(input.id)) throw new AssetConflictError(input.id);
    // Option C: a structured kind with `fields` persists a STRUCTURED doc (no rendered body);
    // anything else persists a body-bearing asset. buildLibraryDoc is the inverse of renderStoredDoc.
    const doc = store.buildLibraryDoc(input, null);
    const stored = await library.upsertDoc({
      id: input.id,
      kind: input.category,
      doc,
      actor: DEFAULT_ACTOR,
    });
    return toGuidanceAsset(store.renderStoredDoc(stored));
  }

  async updateAsset(id: string, input: AssetInput): Promise<GuidanceAsset | null> {
    const { store, library } = await this.#ready();
    const existing = await library.getDoc(id);
    if (!existing) return null;
    // Merge over the existing stored doc so write-only metadata (the doc createdAt,
    // schemaVersion) survives the edit instead of being dropped.
    const doc = store.buildLibraryDoc({ ...input, id }, existing);
    const stored = await library.upsertDoc({
      id,
      kind: input.category,
      doc,
      actor: DEFAULT_ACTOR,
    });
    return toGuidanceAsset(store.renderStoredDoc(stored));
  }

  async deleteAsset(id: string): Promise<boolean> {
    const { library } = await this.#ready();
    return library.deleteDoc(id);
  }

  /**
   * Connectivity probe for /api/health: SELECT 1 through the (lazily created) pool, raced
   * against a ~4s timeout so a stopped Cloud SQL instance answers "unreachable" quickly
   * instead of hanging the health endpoint. Never throws — a #ready() failure (pool build)
   * also reports 'unreachable', and because #ready() only caches AFTER every step succeeds,
   * a failed probe leaves the backend retryable once the DB comes back up.
   *
   * When reachable it ALSO reports the schema-skew pair: the library schemaVersion this code
   * knows vs the highest the DB holds. A DB ahead of the code means this long-running server
   * is stale (pull + restart) — the UI turns that into a distinct banner instead of letting
   * render fallbacks pass silently.
   */
  async health(): Promise<HealthProbe> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('health probe timed out')), 4000);
      });
      // #ready() is part of the raced work: against a stopped instance the POOL BUILD is
      // what hangs (well past 4s), and health must answer fast precisely then. The build
      // continues in the background and caches once it succeeds.
      const { store, library } = await Promise.race([
        (async () => {
          const ready = await this.#ready();
          if (!this.#handle) throw new Error('no pool');
          await this.#handle.pool.query('SELECT 1');
          return ready;
        })(),
        timeout,
      ]);
      try {
        const dbVersion = await library.maxSchemaVersion();
        return { db: 'ok', schema: { code: store.CURRENT_SCHEMA_VERSION, db: dbVersion } };
      } catch {
        return { db: 'ok' }; // reachable but the skew query failed — don't fail health over it
      }
    } catch {
      return { db: 'unreachable' };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * Latest verdict per unit — `SELECT DISTINCT ON (unit_id) … ORDER BY seq DESC` over
   * events.verdict, raced against the same ~4s timeout as health(). Null on ANY failure
   * (stopped instance, missing table, pool build error): the glyphs are advisory.
   */
  async latestVerdicts(): Promise<Record<string, TreeVerdict> | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('verdict probe timed out')), 4000);
      });
      // #ready() is INSIDE the race: against a stopped instance the pool build itself
      // is what hangs (30s+), and an advisory read must answer within the budget. The
      // build keeps going in the background and caches once the DB is back.
      const res = await Promise.race([
        (async () => {
          await this.#ready();
          const handle = this.#handle;
          if (!handle) throw new Error('no pool');
          return handle.pool.query(
            `SELECT DISTINCT ON (unit_id) unit_id, outcome, at
               FROM events.verdict
              ORDER BY unit_id, seq DESC`,
          );
        })(),
        timeout,
      ]);
      const out: Record<string, TreeVerdict> = {};
      for (const raw of (res as { rows: unknown[] }).rows) {
        const row = raw as { unit_id: string; outcome: string; at: Date | string };
        if (row.outcome !== 'pass' && row.outcome !== 'fail') continue;
        out[row.unit_id] = {
          outcome: row.outcome,
          at: row.at instanceof Date ? row.at.toISOString() : new Date(row.at).toISOString(),
        };
      }
      return out;
    } catch {
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * The RAW signed-verdict event stream from events.verdict (ADR-0082 per-test UAT crown), shaped as
   * `{ kind: 'signing', seq, doc }` so the orchestrator's `rollupStoryUat` reads it directly. All rows
   * ordered by seq — the AND-roll-up needs every per-test verdict, not just the latest-per-unit map.
   * Same advisory contract / 4s race as latestVerdicts(): null on any failure, never a throw.
   */
  async verdictEvents(): Promise<ReadonlyArray<{ kind: string; seq: number; doc: unknown }> | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('verdict-events probe timed out')), 4000);
      });
      const { kind, rows } = await Promise.race([
        (async () => {
          await this.#ready();
          const handle = this.#handle;
          if (!handle) throw new Error('no pool');
          const contract = await loadContractModule();
          const res = await handle.pool.query(
            `SELECT seq, doc FROM events.verdict ORDER BY seq`,
          );
          return { kind: contract.SIGNING_EVENT_KIND, rows: (res as { rows: unknown[] }).rows };
        })(),
        timeout,
      ]);
      return rows.map((raw) => {
        const row = raw as { seq: string | number; doc: unknown };
        return { kind, seq: Number(row.seq), doc: row.doc };
      });
    } catch {
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * Persist a signed `operator-attested` UAT verdict into events.verdict via PgWorkStore — the same
   * store + signing event kind the CLI `uat attest` and a real build write through (ADR-0082). Unlike
   * the advisory READS above, this is a real WRITE: it is NOT swallowed or raced — a failure (down
   * DB, or the store's own fail-closed `Verdict.parse` rejecting a malformed doc) propagates to the
   * handler, which maps it (503 for a connection failure, 400 for a zod violation). A verdict that
   * does not persist greens nothing.
   */
  async signUatVerdict(verdict: Verdict, actor: string): Promise<Verdict> {
    const { work } = await this.#ready();
    const contract = await loadContractModule();
    await work.appendEvent({
      id: `${verdict.runId}:${verdict.unitId}`,
      kind: contract.SIGNING_EVENT_KIND,
      type: 'created',
      doc: verdict,
      actor,
    });
    return verdict;
  }

  /**
   * Persist a brokered presence declaration into events.session via PgPresenceStore.declare — the SAME
   * atomic append+upsert path `storytree noticeboard declare` and the presence hook use (ADR-0033). A
   * real WRITE (not raced/swallowed like the advisory reads): a failure (down DB) propagates to the
   * handler, mapped to 503. Presence carries no signing chain (ADR-0033 d.1), so `actor` is advisory —
   * the store anchors the row on the declaration's own sessionId.
   */
  async declarePresence(doc: PresenceDeclarationDoc, _actor: string): Promise<PresenceDeclarationDoc> {
    const { store } = await this.#ready();
    const handle = this.#handle;
    if (!handle) throw new Error('no pool');
    return new store.PgPresenceStore(handle.pool).declare(doc);
  }

  /**
   * Active sessions from events.session via PgPresenceStore.listActive(), staleness
   * classified at read time (classifyPresence, the ADR-0033 fixed thresholds). Same
   * advisory contract as latestVerdicts(): null on any failure, never a throw.
   */
  async activeSessions(): Promise<TreeSession[] | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('presence probe timed out')), 4000);
      });
      // Same shape as latestVerdicts(): the pool build is part of the raced work.
      const docs = await Promise.race([
        (async () => {
          const { store } = await this.#ready();
          const handle = this.#handle;
          if (!handle) throw new Error('no pool');
          return new store.PgPresenceStore(handle.pool).listActive();
        })(),
        timeout,
      ]);
      const noticeBoard = await loadNoticeBoardModule();
      const now = new Date();
      return docs.map((d) => ({
        sessionId: d.sessionId,
        branch: d.branch,
        workingOn: d.workingOn,
        nodes: d.nodes,
        band: noticeBoard.classifyPresence(d.lastSeenAt, now),
        lastSeenAt: d.lastSeenAt,
      }));
    } catch {
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * In-flight builds (ADR-0048): the latest `building` work-event per unit whose
   * run has NOT produced a signed verdict, then TTL-filtered in JS so a dangling
   * build (a hard-killed run) clears in minutes. Keyed by `runId` (the build's
   * own identity, never a session's). Same advisory contract / 4s race as
   * latestVerdicts: null on any failure, never a throw.
   *
   * "No verdict for (unit_id, run_id)" is the authoritative terminal: a signed
   * pass for this run clears the wisp (it hands off to the ADR-0045 bloom). A
   * FAILED run signs no verdict, so the TTL is what clears it (ADR-0048 §2).
   */
  async inFlightBuilds(): Promise<BuildActivity[] | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('activity probe timed out')), 4000);
      });
      const res = await Promise.race([
        (async () => {
          await this.#ready();
          const handle = this.#handle;
          if (!handle) throw new Error('no pool');
          // latest `building` per unit, dropped if its run already has a verdict. `doc->>'phase'`
          // (ADR-0048 §3 v2) is the LATEST mark's gate phase — the wisp's red→green band; null on a
          // pre-ADR-0048 mark. DISTINCT ON … ORDER BY seq DESC already takes the newest, so a unit
          // mid-build re-colours as the spine writes each phase.
          return handle.pool.query(
            // ADR-0138 §5: `doc->>'colourState'` rides alongside `phase` — the live subagent role the
            // latest `building` mark stamped (advisory role tint; null on a pre-ADR-0138 mark).
            `WITH latest_building AS (
               SELECT DISTINCT ON (unit_id)
                 unit_id, tier, doc->>'runId' AS run_id, doc->>'phase' AS phase,
                 doc->>'colourState' AS colour_state, at
               FROM events.work_event
               WHERE type = 'building'
               ORDER BY unit_id, seq DESC
             )
             SELECT lb.unit_id, lb.tier, lb.run_id, lb.phase, lb.colour_state, lb.at
               FROM latest_building lb
              WHERE lb.run_id IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM events.verdict v
                   WHERE v.unit_id = lb.unit_id AND v.run_id = lb.run_id
                )`,
          );
        })(),
        timeout,
      ]);
      // The TTL filter + the phase surfacing are the pure rowsToBuildActivity fold (red-green in
      // inFlightBuilds.test.ts); this method owns only the live query + the 4s race.
      return rowsToBuildActivity(
        (res as { rows: BuildRow[] }).rows,
        new Date(),
      );
    } catch {
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * In-flight story claims (ADR-0138): every live `events.node_claim` row, folded into a
   * claimed-but-not-proven map activity via `claimsToActivity` (the pure §5 honesty-wall fold —
   * `kind: "claim"`, stale-dropped, never a proven-green discriminator). `node_claim.unit_id` is the
   * PRIMARY KEY, so there is at most ONE row per unit — no `DISTINCT ON` needed (unlike the building
   * query, whose append-only work-events need the newest-per-unit pick). Same advisory contract / 4s
   * race as inFlightBuilds: null on any failure (stopped instance, missing table, pool build error),
   * never a throw — a claim wisp is advisory and silently absent when the store can't answer.
   */
  async inFlightClaims(): Promise<ClaimActivity[] | null> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('claim probe timed out')), 4000);
      });
      const res = await Promise.race([
        (async () => {
          await this.#ready();
          const handle = this.#handle;
          if (!handle) throw new Error('no pool');
          return handle.pool.query(
            `SELECT unit_id, session_id, branch, intent, claimed_at, heartbeat_at
               FROM events.node_claim`,
          );
        })(),
        timeout,
      ]);
      // The stale-drop filter + the §5 honesty-wall `kind: "claim"` discriminator are the pure
      // claimsToActivity fold (red-green in inFlightActivity.test.ts); this method owns only the
      // live query + the 4s race.
      return claimsToActivity((res as { rows: ClaimRow[] }).rows, new Date());
    } catch {
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async listComments(filter: CommentFilter): Promise<Comment[]> {
    const { comments } = await this.#ready();
    const list = await comments.list(filter);
    return list as Comment[];
  }

  async createComment(comment: Comment): Promise<Comment> {
    const { store, comments } = await this.#ready();
    // ADR-0140 block-anchor lockstep: the studio's Comment type still carries the legacy
    // kind:'text' anchor (the old annotate.ts path, removed later by the
    // remove-text-selection-anchoring cap), so normalize at this write boundary to the library
    // store's canonical anchor shape — the same normalisation PgCommentStore.create applies internally.
    const created = await comments.create(
      { ...comment, anchor: store.normalizeCommentAnchor(comment.anchor) },
      DEFAULT_ACTOR,
    );
    return created as Comment;
  }

  async updateComment(id: string, patch: CommentPatch): Promise<Comment | null> {
    const { comments } = await this.#ready();
    // resolvedAt is derived here (mirroring the JSON backend) so the stored doc matches the wire shape.
    const merge: { body?: string; resolved?: boolean; resolvedAt?: string | null } = {};
    if (patch.body !== undefined) merge.body = patch.body;
    if (patch.resolved !== undefined) {
      merge.resolved = patch.resolved;
      merge.resolvedAt = patch.resolved ? new Date().toISOString() : null;
    }
    const merged = await comments.update(id, merge, DEFAULT_ACTOR);
    return merged as Comment | null;
  }

  async deleteComment(id: string): Promise<boolean> {
    const { comments } = await this.#ready();
    return comments.remove(id, DEFAULT_ACTOR);
  }

  // ----- suggestions (PgSuggestionStore over events.suggestion_event / events.suggestion) -----

  async getSuggestion(id: string): Promise<Suggestion | null> {
    const { suggestions } = await this.#ready();
    const all = await suggestions.list();
    return all.find((s) => s.id === id) ?? null;
  }

  async listSuggestions(filter?: SuggestionFilter): Promise<Suggestion[]> {
    const { suggestions } = await this.#ready();
    return suggestions.list(filter);
  }

  async createSuggestion(s: Suggestion, actor: string): Promise<Suggestion> {
    const { suggestions } = await this.#ready();
    // The author IS the audit actor — a proposal is attributed, never 'system'.
    return suggestions.create(s, actor);
  }

  async transitionSuggestion(
    id: string,
    action: 'accept' | 'reject',
    decidedBy: string,
    decidedAt: string,
  ): Promise<Suggestion | null> {
    const { suggestions } = await this.#ready();
    // The decider IS the audit actor — a decision is attributed, never 'operator'.
    return suggestions.transition(id, action, decidedBy, decidedAt, decidedBy);
  }

  // ----- users (PgUserStore over events."user") -----

  async listUsers(): Promise<UserDoc[]> {
    const { users } = await this.#ready();
    return users.list();
  }

  async getUser(email: string): Promise<UserDoc | null> {
    const { users } = await this.#ready();
    return users.get(email);
  }

  async upsertUser(doc: UserDoc, actor: string): Promise<UserDoc> {
    const { users } = await this.#ready();
    return users.upsert(doc, actor);
  }

  async removeUser(email: string, actor: string): Promise<boolean> {
    const { users } = await this.#ready();
    return users.remove(email, actor);
  }

  // ----- attestations (PgAttestationStore over events.attestation) -----

  async listAttestations(storyId: string): Promise<StoryAttestations> {
    const { attestations } = await this.#ready();
    const orchestrator = await loadOrchestratorModule();
    const map = orchestrator.deriveAttestations(await attestations.readEvents());
    const out: StoryAttestations = {};
    for (const [testId, entry] of map) {
      if (testId.startsWith(`${storyId}#`)) out[testId] = entry;
    }
    return out;
  }

  async recordAttestation(att: Attestation, _actor: string): Promise<Attestation> {
    const { attestations } = await this.#ready();
    return attestations.record(att);
  }

  async close(): Promise<void> {
    if (this.#handle && this.#store) {
      await this.#store.closePool(this.#handle.pool, this.#handle.connector);
      this.#handle = null;
      this.#library = null;
      this.#comments = null;
      this.#users = null;
      this.#attestations = null;
      this.#work = null;
      this.#store = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Backend selection.
// ---------------------------------------------------------------------------

export type StudioStore = 'json' | 'pg';

/** The active backend kind, from STORYTREE_STUDIO_STORE ('json' → offline json; else pg — the default). */
export function selectedStore(): StudioStore {
  return process.env['STORYTREE_STUDIO_STORE'] === 'json' ? 'json' : 'pg';
}

/** Build the backend for the active store. The pg pool inside PgBackend is still created lazily. */
export function createBackend(opts: {
  assetsFile: string;
  commentsFile: string;
  usersFile: string;
  attestationsFile: string;
}): LibraryBackend {
  return selectedStore() === 'pg'
    ? new PgBackend()
    : new JsonBackend({
        assetsFile: opts.assetsFile,
        commentsFile: opts.commentsFile,
        usersFile: opts.usersFile,
        attestationsFile: opts.attestationsFile,
      });
}
