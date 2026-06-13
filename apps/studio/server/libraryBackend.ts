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
// existing stored doc so write-only metadata (glossary*, doc-level createdAt, schemaVersion) survives
// the edit. Reads render each stored Library doc back into the GuidanceAsset wire shape via
// renderStoredDoc (a structured unit → renderBody(doc) for `body` PLUS its per-kind `fields`; a doc
// that already has a string body — template / adr — → served as-is). A non-structured category, or a
// write without `fields`, still persists a rendered body-bearing asset.

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import type { UserDoc } from '@storytree/core';
import type {
  AssetCategory,
  Comment,
  GuidanceAsset,
  TreeSession,
  TreeVerdict,
} from '../src/types';

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
   * Active notice-board sessions (events.session projection, ADR-0033) with the
   * staleness band derived at read time. NEVER throws — `null` for the json backend
   * or when the DB doesn't answer; presence is advisory and silently absent.
   */
  activeSessions(): Promise<TreeSession[] | null>;

  listComments(filter: CommentFilter): Promise<Comment[]>;
  createComment(comment: Comment): Promise<Comment>;
  /** Returns the merged comment, or `null` if `id` does not exist. */
  updateComment(id: string, patch: CommentPatch): Promise<Comment | null>;
  /** Returns `true` if a row was removed, `false` if `id` did not exist. */
  deleteComment(id: string): Promise<boolean>;

  // ----- trusted-circle users (ADR-0043) -----
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

  constructor(opts: { assetsFile: string; commentsFile: string; usersFile: string }) {
    this.#assetsFile = opts.assetsFile;
    this.#commentsFile = opts.commentsFile;
    this.#usersFile = opts.usersFile;
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

  async activeSessions(): Promise<TreeSession[] | null> {
    return null; // no events.session behind the JSON files — presence silently absent
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
  // last-admin guard run through @storytree/core (lazily loaded, the config-load trap). -----

  async listUsers(): Promise<UserDoc[]> {
    return readStore<UserDoc[]>(this.#usersFile, []);
  }

  async getUser(email: string): Promise<UserDoc | null> {
    const core = await loadCoreModule();
    const target = core.normalizeEmail(email);
    return (await this.listUsers()).find((u) => u.email === target) ?? null;
  }

  async upsertUser(doc: UserDoc, _actor: string): Promise<UserDoc> {
    const core = await loadCoreModule();
    const validated = core.User.parse(doc); // role-status-validated at the boundary
    const users = await this.listUsers();
    const idx = users.findIndex((u) => u.email === validated.email);
    let persisted: UserDoc;
    if (idx !== -1) {
      const existing = users[idx] as UserDoc;
      const { email: _e, createdAt: _c, ...patch } = validated;
      persisted = core.mergeUser(existing, patch);
      if (core.wouldOrphanAdminsOnRole(users, validated.email, persisted.role)) {
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
    const core = await loadCoreModule();
    const target = core.normalizeEmail(email);
    const users = await this.listUsers();
    if (!users.some((u) => u.email === target)) return false;
    if (core.wouldOrphanAdminsOnRemove(users, target)) {
      throw lastAdminError(`refusing to remove ${target}: at least one admin must remain`);
    }
    await writeStore(this.#usersFile, users.filter((u) => u.email !== target));
    return true;
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
// renderStoredDoc) are loaded LAZILY via a dynamic import the first time PgBackend is used — NOT a
// static top-level import. That matters: this module is reached at Vite config-load / `vite build`
// time (vite.config.ts → devApi.ts → here), where the loader has no tsx transform and cannot resolve
// @storytree/store's `.js` re-export specifiers (ERR_MODULE_NOT_FOUND on src/connection.js). It is
// also Node-only (pg / cloud-sql-connector) and has no place in a browser build. Keeping the import
// dynamic means the store is only touched when STORYTREE_STUDIO_STORE='pg' actually runs the dev API.
// Types are `import type` only (fully erased under verbatimModuleSyntax), so they add no runtime import.
import type { PoolHandle, PgLibraryStore, PgCommentStore, PgUserStore } from '@storytree/store';

type StoreModule = typeof import('@storytree/store');

let storeModulePromise: Promise<StoreModule> | null = null;

/** Load @storytree/store once, on first PgBackend use (never at config-load / build time). */
function loadStoreModule(): Promise<StoreModule> {
  return (storeModulePromise ??= import('@storytree/store'));
}

// @storytree/core's ROOT export is Node-only too (signer → node:crypto) and its raw-TS
// `.js` specifiers hit the same config-load trap — so classifyPresence is loaded just as
// lazily, on the first presence read.
type CoreModule = typeof import('@storytree/core');

let coreModulePromise: Promise<CoreModule> | null = null;

function loadCoreModule(): Promise<CoreModule> {
  return (coreModulePromise ??= import('@storytree/core'));
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
  #users: PgUserStore | null = null;

  /** Build the pool + stores on first use (the JSON default must never touch pg). */
  async #ready(): Promise<{
    store: StoreModule;
    library: PgLibraryStore;
    comments: PgCommentStore;
    users: PgUserStore;
  }> {
    if (
      this.#store === null ||
      this.#library === null ||
      this.#comments === null ||
      this.#users === null
    ) {
      const store = await loadStoreModule();
      const handle = await store.createPool();
      this.#store = store;
      this.#handle = handle;
      this.#library = new store.PgLibraryStore(handle.pool);
      this.#comments = new store.PgCommentStore(handle.pool);
      this.#users = new store.PgUserStore(handle.pool);
    }
    return { store: this.#store, library: this.#library, comments: this.#comments, users: this.#users };
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
    // Merge over the existing stored doc so write-only metadata (glossary*, doc createdAt,
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
      const core = await loadCoreModule();
      const now = new Date();
      return docs.map((d) => ({
        sessionId: d.sessionId,
        branch: d.branch,
        workingOn: d.workingOn,
        nodes: d.nodes,
        band: core.classifyPresence(d.lastSeenAt, now),
        lastSeenAt: d.lastSeenAt,
      }));
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
    const { comments } = await this.#ready();
    const created = await comments.create(comment, DEFAULT_ACTOR);
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

  async close(): Promise<void> {
    if (this.#handle && this.#store) {
      await this.#store.closePool(this.#handle.pool, this.#handle.connector);
      this.#handle = null;
      this.#library = null;
      this.#comments = null;
      this.#users = null;
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
}): LibraryBackend {
  return selectedStore() === 'pg'
    ? new PgBackend()
    : new JsonBackend({
        assetsFile: opts.assetsFile,
        commentsFile: opts.commentsFile,
        usersFile: opts.usersFile,
      });
}
