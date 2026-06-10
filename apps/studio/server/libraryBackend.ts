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
import type {
  AssetCategory,
  Comment,
  GuidanceAsset,
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

  listComments(filter: CommentFilter): Promise<Comment[]>;
  createComment(comment: Comment): Promise<Comment>;
  /** Returns the merged comment, or `null` if `id` does not exist. */
  updateComment(id: string, patch: CommentPatch): Promise<Comment | null>;
  /** Returns `true` if a row was removed, `false` if `id` did not exist. */
  deleteComment(id: string): Promise<boolean>;

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

  constructor(opts: { assetsFile: string; commentsFile: string }) {
    this.#assetsFile = opts.assetsFile;
    this.#commentsFile = opts.commentsFile;
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

  async close(): Promise<void> {
    /* no resources to release */
  }
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
import type { PoolHandle, PgLibraryStore, PgCommentStore } from '@storytree/store';

type StoreModule = typeof import('@storytree/store');

let storeModulePromise: Promise<StoreModule> | null = null;

/** Load @storytree/store once, on first PgBackend use (never at config-load / build time). */
function loadStoreModule(): Promise<StoreModule> {
  return (storeModulePromise ??= import('@storytree/store'));
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
    createdAt: rendered.createdAt,
    updatedAt: rendered.updatedAt,
  };
}

export class PgBackend implements LibraryBackend {
  #store: StoreModule | null = null;
  #handle: PoolHandle | null = null;
  #library: PgLibraryStore | null = null;
  #comments: PgCommentStore | null = null;

  /** Build the pool + stores on first use (the JSON default must never touch pg). */
  async #ready(): Promise<{
    store: StoreModule;
    library: PgLibraryStore;
    comments: PgCommentStore;
  }> {
    if (this.#store === null || this.#library === null || this.#comments === null) {
      const store = await loadStoreModule();
      const handle = await store.createPool();
      this.#store = store;
      this.#handle = handle;
      this.#library = new store.PgLibraryStore(handle.pool);
      this.#comments = new store.PgCommentStore(handle.pool);
    }
    return { store: this.#store, library: this.#library, comments: this.#comments };
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

  async close(): Promise<void> {
    if (this.#handle && this.#store) {
      await this.#store.closePool(this.#handle.pool, this.#handle.connector);
      this.#handle = null;
      this.#library = null;
      this.#comments = null;
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
}): LibraryBackend {
  return selectedStore() === 'pg'
    ? new PgBackend()
    : new JsonBackend({ assetsFile: opts.assetsFile, commentsFile: opts.commentsFile });
}
