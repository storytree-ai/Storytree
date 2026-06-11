// storytreeDataApi — a Vite dev-server plugin that backs the studio foundation.
//
// It is the whole "backend": ~one file of Node middleware on Vite's own server,
// not a separate service. It does two things:
//   1. Serves the canonical docs corpus live from <repo>/docs (read-only).
//   2. Persists comments + guidance assets to apps/studio/data/*.json.
//
// This runs in `vite` (dev) only — which is exactly the foundation's scope
// (`pnpm --filter studio dev`). A production `vite build` is a static SPA with
// no /api; wiring real persistence to the orchestrator is later work.
//
// SIGNPOST — the data/*.json files are a PRE-DB stopgap, not the system of record:
//   • apps/studio/data/knowledge.json is the STRUCTURED SOURCE of the Library.
//   • apps/studio/data/assets.json and docs/glossary.md are GENERATED VIEWS, built
//     by apps/studio/data/build-corpus.mjs from knowledge.json — NEVER hand-edit
//     them. (This API's POST/PATCH to assets.json is dev-authoring only; whatever
//     it writes gets CLOBBERED on the next build-corpus run — edit knowledge.json
//     and rebuild instead.)
//   • The Library is ALSO migrated into the shared Cloud SQL Postgres store
//     (packages/store). The studio ↔ store swap is now WIRED behind a
//     LibraryBackend seam (server/libraryBackend.ts): the default reads/writes the
//     Library + comments through Postgres (oq-studio-store-default → B); set
//     STORYTREE_STUDIO_STORE='json' to keep this file-backed JSON path for offline
//     work. The /api/* request/response shapes the React client sees are the same for both.

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ResolvedConfig } from 'vite';
import type {
  AssetCategory,
  Comment,
  CommentAnchor,
  DocMeta,
  TreeCapability,
  TreePayload,
  TreeStory,
  WorkStatus,
} from '../src/types';
import {
  createBackend,
  selectedStore,
  AssetConflictError,
  type LibraryBackend,
  type AssetInput,
  type CommentPatch,
} from './libraryBackend';

const ASSET_CATEGORIES: AssetCategory[] = [
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

interface Paths {
  repoRoot: string;
  docsDir: string;
  storiesDir: string;
  dataDir: string;
  commentsFile: string;
  assetsFile: string;
}

function resolvePaths(config: ResolvedConfig): Paths {
  const studioRoot = config.root; // apps/studio
  const repoRoot = path.resolve(studioRoot, '..', '..');
  const dataDir = path.join(studioRoot, 'data');
  return {
    repoRoot,
    docsDir: path.join(repoRoot, 'docs'),
    storiesDir: path.join(repoRoot, 'stories'),
    dataDir,
    commentsFile: path.join(dataDir, 'comments.json'),
    assetsFile: path.join(dataDir, 'assets.json'),
  };
}

// ---------- small http helpers ----------

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
}

// ---------- docs (read-only, live from <repo>/docs) ----------

function deriveTitle(markdown: string, filename: string): string {
  const m = markdown.match(/^#\s+(.+?)\s*$/m);
  return m && m[1] ? m[1] : filename.replace(/\.md$/, '');
}

function deriveGroup(relId: string): string {
  return relId.startsWith('decisions/') ? 'Decisions' : 'Reference';
}

/**
 * The first prose sentence after the H1 title — the one-line description shown
 * on Library ADR cards. Skips the title, ATX headings, and short metadata values
 * (ADRs lead with Status/Date), then takes the first sentence of the first block
 * that actually reads as prose (i.e. has sentence punctuation). Empty if none.
 */
function deriveExcerpt(markdown: string): string {
  const body = markdown.replace(/^#\s+.*$/m, ''); // drop the H1 title line
  for (const block of body.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b || b.startsWith('#')) continue; // blank line or a heading
    const plain = b.replace(/\s+/g, ' ').replace(/[*_`>]/g, '').trim();
    const m = plain.match(/^(.+?[.;])(\s|$)/);
    if (!m || !m[1]) continue; // not a sentence (e.g. "accepted", a bare date)
    const s = m[1].trim();
    return s.length > 200 ? s.slice(0, 197).trimEnd() + '…' : s;
  }
  return '';
}

async function listDocs(docsDir: string): Promise<DocMeta[]> {
  const out: DocMeta[] = [];
  async function walk(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && ent.name.endsWith('.md')) {
        const relId = path.relative(docsDir, full).split(path.sep).join('/');
        const content = await fs.readFile(full, 'utf8');
        out.push({
          id: relId,
          title: deriveTitle(content, ent.name),
          group: deriveGroup(relId),
          excerpt: deriveExcerpt(content),
        });
      }
    }
  }
  await walk(docsDir);
  // Decisions first (ADR order by filename), then reference docs alphabetically.
  return out.sort((a, b) => {
    if (a.group !== b.group) return a.group === 'Decisions' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** Resolve a requested doc id to an absolute path, refusing traversal. */
function safeDocPath(docsDir: string, id: string): string | null {
  const resolved = path.resolve(docsDir, id);
  const rel = path.relative(docsDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!resolved.endsWith('.md')) return null;
  return resolved;
}

// ---------- validation ----------

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** A flat string→string record (drops non-string values); `{}` for anything that isn't an object. */
function asStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

function asNumberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Normalise an incoming comment anchor (topic / section / text-quote). */
function readAnchor(raw: Record<string, unknown>): CommentAnchor {
  const kindRaw = asString(raw.kind);
  const headingSlug = asString(raw.headingSlug).trim() || null;
  const quote = typeof raw.quote === 'string' && raw.quote.length > 0 ? raw.quote : null;
  let kind: CommentAnchor['kind'] = 'topic';
  if (kindRaw === 'text' && quote) kind = 'text';
  else if (kindRaw === 'section' && headingSlug) kind = 'section';
  return {
    kind,
    headingSlug,
    headingText: asString(raw.headingText).trim() || null,
    quote,
    prefix: typeof raw.prefix === 'string' ? raw.prefix : null,
    suffix: typeof raw.suffix === 'string' ? raw.suffix : null,
    startOffset: asNumberOrNull(raw.startOffset),
    color: asString(raw.color).trim() || null,
  };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- route handlers ----------

async function handleComments(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  backend: LibraryBackend,
): Promise<void> {
  const method = req.method ?? 'GET';

  if (method === 'GET') {
    const topicId = url.searchParams.get('topicId');
    const topicKind = url.searchParams.get('topicKind');
    const filter: { topicId?: string; topicKind?: 'doc' | 'asset' } = {};
    if (topicId) filter.topicId = topicId;
    if (topicKind === 'doc' || topicKind === 'asset') filter.topicKind = topicKind;
    return sendJson(res, 200, await backend.listComments(filter));
  }

  if (method === 'POST') {
    const input = await readJsonBody<Record<string, unknown>>(req);
    const body = asString(input.body).trim();
    const topicId = asString(input.topicId).trim();
    const topicKind = asString(input.topicKind);
    if (!body) throw new HttpError(400, 'comment body is required');
    if (!topicId) throw new HttpError(400, 'topicId is required');
    if (topicKind !== 'doc' && topicKind !== 'asset') {
      throw new HttpError(400, 'topicKind must be "doc" or "asset"');
    }
    const comment: Comment = {
      id: randomUUID(),
      topicKind,
      topicId,
      anchor: readAnchor((input.anchor ?? {}) as Record<string, unknown>),
      body,
      author: asString(input.author).trim() || 'operator',
      createdAt: new Date().toISOString(),
      resolved: false,
      resolvedAt: null,
    };
    return sendJson(res, 201, await backend.createComment(comment));
  }

  if (method === 'PATCH') {
    const id = url.searchParams.get('id') ?? '';
    const raw = await readJsonBody<Record<string, unknown>>(req);
    const patch: CommentPatch = {};
    if (typeof raw.body === 'string' && raw.body.trim()) patch.body = raw.body.trim();
    if (typeof raw.resolved === 'boolean') patch.resolved = raw.resolved;
    const next = await backend.updateComment(id, patch);
    if (!next) throw new HttpError(404, 'comment not found');
    return sendJson(res, 200, next);
  }

  if (method === 'DELETE') {
    const id = url.searchParams.get('id') ?? '';
    if (!(await backend.deleteComment(id))) throw new HttpError(404, 'comment not found');
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(405, `method ${method} not allowed`);
}

function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

function readAssetInput(input: Record<string, unknown>): AssetInput {
  const id = asString(input.id).trim();
  const category = asString(input.category) as AssetCategory;
  const title = asString(input.title).trim();
  const description = asString(input.description).trim();
  const body = asString(input.body).trim();
  const fields = asStringRecord(input.fields);
  const hasFields = Object.keys(fields).length > 0;
  if (!isValidSlug(id)) throw new HttpError(400, 'id must be a kebab-case slug (a-z, 0-9, hyphens)');
  if (!ASSET_CATEGORIES.includes(category)) throw new HttpError(400, 'invalid category');
  if (!title) throw new HttpError(400, 'title is required');
  if (!description) throw new HttpError(400, 'description is required');
  // A structured unit carries per-kind `fields` (the body is a derived render); a body-only unit
  // (template / adr) must carry a body. The per-field structural validation runs at the store's
  // zod write boundary (mapped to 400 in handleAssets).
  if (!hasFields && !body) throw new HttpError(400, 'body is required');
  const provenance = asString(input.provenance).trim();
  return {
    id,
    category,
    title,
    description,
    body,
    references: asStringArray(input.references),
    ...(provenance ? { provenance } : {}),
    ...(hasFields ? { fields } : {}),
  };
}

/** Map a store write-boundary error to an HTTP status: a zod failure is a 400, a conflict a 409. */
function assetWriteError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof AssetConflictError) return new HttpError(409, err.message);
  if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'ZodError') {
    return new HttpError(400, `structured doc failed validation: ${err instanceof Error ? err.message : String(err)}`);
  }
  return new HttpError(500, err instanceof Error ? err.message : String(err));
}

// pg error codes / syscall codes that mean "the DB isn't there", not "your request was bad":
// admin shutdown/crash (57P0x), connection-does-not-exist / can't-connect (08xxx), and the
// usual socket-level failures from a stopped Cloud SQL instance.
const PG_CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  '57P01',
  '57P02',
  '57P03',
  '08006',
  '08001',
]);

/**
 * Whether an UNRECOGNISED error (not HttpError / ZodError / AssetConflictError — those carry
 * their own status) looks like a pg connection failure. Mapped to 503 in the central catch so
 * the UI can tell "DB is down, press Start" apart from a genuine server bug (500).
 */
function isConnectionError(err: unknown): boolean {
  if (err instanceof HttpError || err instanceof AssetConflictError) return false;
  if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'ZodError') return false;
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && PG_CONNECTION_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : '';
  return /connect|terminat|timeout/i.test(message);
}

const DB_UNREACHABLE_MESSAGE =
  'live store unreachable — start the DB (pnpm db:up or the Start DB button)';

async function handleAssets(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  backend: LibraryBackend,
): Promise<void> {
  const method = req.method ?? 'GET';

  if (method === 'GET') {
    return sendJson(res, 200, await backend.listAssets());
  }

  if (method === 'POST') {
    const input = readAssetInput(await readJsonBody<Record<string, unknown>>(req));
    try {
      return sendJson(res, 201, await backend.createAsset(input));
    } catch (err) {
      throw assetWriteError(err);
    }
  }

  if (method === 'PATCH') {
    const id = url.searchParams.get('id') ?? '';
    // The id is fixed by the path; the body supplies the new category/title/description/body/fields/refs.
    const input = readAssetInput({
      ...(await readJsonBody<Record<string, unknown>>(req)),
      id,
    });
    let next;
    try {
      next = await backend.updateAsset(id, input);
    } catch (err) {
      throw assetWriteError(err);
    }
    if (!next) throw new HttpError(404, 'asset not found');
    return sendJson(res, 200, next);
  }

  if (method === 'DELETE') {
    const id = url.searchParams.get('id') ?? '';
    if (!(await backend.deleteAsset(id))) throw new HttpError(404, 'asset not found');
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(405, `method ${method} not allowed`);
}

// ---------- story tree (read-only, live from <repo>/stories) ----------
//
// Mirrors the CLI `storytree tree` discovery contract (packages/cli/src/tree.ts):
// a story is a stories/<dir> with a story.md; capabilities come from the story
// frontmatter's `capabilities` list, each at <dir>/<capId>.md. Load failures are
// tolerated per node — the view renders what it can, with the reason attached —
// because one malformed spec must not blank the whole tree.
//
// @storytree/orchestrator (loadNodeSpec) is loaded LAZILY on first /api/tree hit,
// NOT statically: this module is reached at Vite config-load / `vite build` time,
// where the loader has no tsx transform and cannot resolve the orchestrator's raw-TS
// `.js` re-export specifiers (ERR_MODULE_NOT_FOUND) — the same trap, and the same
// fix, as PgBackend's dynamic import of @storytree/store in libraryBackend.ts.

type OrchestratorModule = typeof import('@storytree/orchestrator');
type LoadNodeSpec = OrchestratorModule['loadNodeSpec'];

let orchestratorModulePromise: Promise<OrchestratorModule> | null = null;

function loadOrchestrator(): Promise<OrchestratorModule> {
  return (orchestratorModulePromise ??= import('@storytree/orchestrator'));
}

const isWorkStatus = (s: string): s is WorkStatus =>
  ['proposed', 'building', 'healthy', 'unhealthy', 'mapped', 'retired'].includes(s);

function loadTreeCapability(loadNodeSpec: LoadNodeSpec, storyDir: string, capId: string): TreeCapability {
  const node: TreeCapability = {
    id: capId,
    title: capId,
    outcome: '',
    status: null,
    proofMode: '',
    dependsOn: [],
  };
  const file = path.join(storyDir, `${capId}.md`);
  if (!existsSync(file)) return { ...node, error: 'spec file missing' };
  try {
    const spec = loadNodeSpec(file);
    return {
      ...node,
      title: spec.title,
      outcome: spec.outcome,
      status: isWorkStatus(spec.status) ? spec.status : null,
      proofMode: spec.proofMode,
      dependsOn: spec.dependsOn,
    };
  } catch (err) {
    return { ...node, error: err instanceof Error ? err.message : String(err) };
  }
}

async function readTree(storiesDir: string): Promise<TreePayload> {
  const stories: TreeStory[] = [];
  if (!existsSync(storiesDir)) return { stories };
  const { loadNodeSpec } = await loadOrchestrator();
  for (const ent of await fs.readdir(storiesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(storiesDir, ent.name);
    const storyFile = path.join(dir, 'story.md');
    if (!existsSync(storyFile)) continue;
    const story: TreeStory = {
      id: ent.name,
      title: ent.name,
      outcome: '',
      status: null,
      proofMode: '',
      dependsOn: [],
      capabilities: [],
    };
    try {
      const spec = loadNodeSpec(storyFile);
      story.title = spec.title;
      story.outcome = spec.outcome;
      story.status = isWorkStatus(spec.status) ? spec.status : null;
      story.proofMode = spec.proofMode;
      story.dependsOn = spec.dependsOn;
      story.capabilities = spec.capabilities.map((capId) =>
        loadTreeCapability(loadNodeSpec, dir, capId),
      );
    } catch (err) {
      story.error = err instanceof Error ? err.message : String(err);
    }
    stories.push(story);
  }
  return { stories };
}

async function handleDocs(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  paths: Paths,
): Promise<void> {
  if (url.pathname === '/api/docs') {
    return sendJson(res, 200, await listDocs(paths.docsDir));
  }
  if (url.pathname === '/api/docs/content') {
    const id = url.searchParams.get('id') ?? '';
    const file = safeDocPath(paths.docsDir, id);
    if (!file || !existsSync(file)) throw new HttpError(404, 'doc not found');
    const markdown = await fs.readFile(file, 'utf8');
    return sendJson(res, 200, { id, title: deriveTitle(markdown, path.basename(file)), markdown });
  }
  throw new HttpError(404, 'not found');
}

// ---------- db control (gcloud on the OPERATOR's machine) ----------
//
// /api/db/* shells out to gcloud locally. That is deliberate, not a remote-exec hole: the Vite
// dev server binds localhost-only and is the operator's own session, so these endpoints are
// just UI buttons over the same `pnpm db:up` / `gcloud sql ...` commands the operator would
// type — using the operator's ambient ADC credentials (ADR-0021).

const DB_INSTANCE = 'storytree-pg';
const DB_PROJECT = 'storytree-498613';
// On Windows gcloud is a .cmd shim, and Node refuses to spawn .cmd/.bat without a shell
// (CVE-2024-27980 hardening) — so route through the shell there; shell:false everywhere else.
// When the shell IS used, the command goes as ONE pre-joined string (args-with-shell is
// deprecated, DEP0190); every argument here is a static literal, so joining is safe.
const GCLOUD_SHELL = process.platform === 'win32';

function spawnGcloud(args: string[]): ChildProcessByStdio<null, Readable, Readable> {
  const stdio: ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe'];
  return GCLOUD_SHELL
    ? spawn(['gcloud', ...args].join(' '), { shell: true, stdio })
    : spawn('gcloud', args, { stdio });
}

/** Run gcloud to completion, resolving stdout; reject on spawn failure or non-zero exit. */
function runGcloud(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnGcloud(args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`gcloud exited ${code ?? 'null'}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

async function handleDb(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? 'GET';

  if (url.pathname === '/api/db/status') {
    if (method !== 'GET') throw new HttpError(405, `method ${method} not allowed`);
    let out: string;
    try {
      out = await runGcloud([
        'sql',
        'instances',
        'describe',
        DB_INSTANCE,
        '--project',
        DB_PROJECT,
        '--format=value(state,settings.activationPolicy)',
      ]);
    } catch (err) {
      throw new HttpError(502, err instanceof Error ? err.message : String(err));
    }
    // `value(...)` prints the two fields on one line, tab-separated.
    const [state = 'UNKNOWN', activationPolicy = 'UNKNOWN'] = out.trim().split(/\s+/);
    return sendJson(res, 200, { state, activationPolicy });
  }

  if (url.pathname === '/api/db/start') {
    if (method !== 'POST') throw new HttpError(405, `method ${method} not allowed`);
    // Fire-and-forget: the patch takes ~a minute; the UI polls /api/health / /api/db/status
    // for the outcome. Idempotent — patching an already-ALWAYS instance is harmless.
    const child = spawnGcloud([
      'sql',
      'instances',
      'patch',
      DB_INSTANCE,
      '--project',
      DB_PROJECT,
      '--activation-policy',
      'ALWAYS',
      '--quiet',
    ]);
    try {
      // Confirm the process actually launched (gcloud missing → 'error', not an exception).
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
    } catch (err) {
      throw new HttpError(502, `failed to start gcloud: ${err instanceof Error ? err.message : String(err)}`);
    }
    child.stdout.on('data', (c: Buffer) => console.log(`[db:start] ${c.toString('utf8').trimEnd()}`));
    child.stderr.on('data', (c: Buffer) => console.log(`[db:start] ${c.toString('utf8').trimEnd()}`));
    child.on('close', (code) => console.log(`[db:start] gcloud exited with code ${code ?? 'null'}`));
    return sendJson(res, 202, { ok: true });
  }

  throw new HttpError(404, 'not found');
}

export function storytreeDataApi(): Plugin {
  let paths: Paths;
  let backend: LibraryBackend;
  return {
    name: 'storytree-data-api',
    configResolved(config) {
      paths = resolvePaths(config);
      // The pg pool (if store='pg') is built lazily on first use; this just picks the impl.
      backend = createBackend({
        assetsFile: paths.assetsFile,
        commentsFile: paths.commentsFile,
      });
    },
    configureServer(server) {
      const store = selectedStore();
      const target =
        store === 'pg'
          ? 'Cloud SQL Postgres (STORYTREE_STUDIO_STORE=pg)'
          : 'apps/studio/data/';
      server.config.logger.info(
        `  storytree data api: docs ← ${path.relative(paths.repoRoot, paths.docsDir)}/  ·  library/comments → ${target}`,
      );
      // Tear the pg pool down with the dev server (no-op for the JSON backend).
      server.httpServer?.on('close', () => {
        void backend.close();
      });
      // Registered directly (not in a returned post-hook) so /api/* is handled
      // BEFORE Vite's SPA fallback would rewrite it to index.html.
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        void (async () => {
          try {
            if (url.pathname === '/api/health') {
              // Health must NEVER throw or 500 — it is what the UI leans on when the DB is
              // down. backend.health() is contractually non-throwing ({db:'n/a'} for json);
              // for pg it also carries the schema-skew pair (code vs DB schemaVersion).
              sendJson(res, 200, { store: selectedStore(), ...(await backend.health()) });
            } else if (url.pathname.startsWith('/api/db/')) {
              await handleDb(req, res, url);
            } else if (url.pathname.startsWith('/api/docs')) {
              await handleDocs(req, res, url, paths);
            } else if (url.pathname === '/api/tree') {
              if ((req.method ?? 'GET') !== 'GET') throw new HttpError(405, 'method not allowed');
              sendJson(res, 200, await readTree(paths.storiesDir));
            } else if (url.pathname === '/api/comments') {
              await handleComments(req, res, url, backend);
            } else if (url.pathname === '/api/assets') {
              await handleAssets(req, res, url, backend);
            } else {
              throw new HttpError(404, 'unknown endpoint');
            }
          } catch (err) {
            if (err instanceof HttpError) {
              sendJson(res, err.status, { error: err.message });
            } else if (isConnectionError(err)) {
              // A pg connection failure surfacing here means the live store is down, not a
              // bug — answer 503 with the remedy so the UI can offer the Start DB button.
              sendJson(res, 503, { error: DB_UNREACHABLE_MESSAGE });
            } else {
              sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
            }
          }
        })();
      });
    },
  };
}
