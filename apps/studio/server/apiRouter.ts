// The studio's ONE /api/* route table (ADR-0042 / studio-cloud `serve-mode`):
// every handler and the central dispatch+error mapping live here, consumed by
// BOTH fronts — the Vite dev plugin (devApi.ts, the open localhost posture) and
// the standalone hosted server (serve.ts, the guarded posture). No endpoint is
// ever defined twice; hosted behaviour differs only by the injected ApiPolicy.
//
//   1. Serves the canonical docs corpus live from <repo>/docs (read-only).
//   2. Persists comments + guidance assets through the LibraryBackend seam
//      (libraryBackend.ts): Cloud SQL Postgres by default, json files offline.
//   3. Reads the story tree live from <repo>/stories, enriched with verdicts +
//      presence when the live store answers (advisory, ADR-0033).
//
// SIGNPOST — the data/*.json files are a PRE-DB stopgap, not the system of record:
//   • apps/studio/data/knowledge.json is the STRUCTURED SOURCE of the Library.
//   • apps/studio/data/assets.json and docs/glossary.md are GENERATED VIEWS, built
//     by apps/studio/data/build-corpus.mjs from knowledge.json — NEVER hand-edit
//     them. (This API's POST/PATCH to assets.json is dev-authoring only; whatever
//     it writes gets CLOBBERED on the next build-corpus run — edit knowledge.json
//     and rebuild instead.)
//   • The Library is ALSO migrated into the shared Cloud SQL Postgres store
//     (packages/store) — the pg backend is the default (oq-studio-store-default → B).

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UatTest } from '@storytree/core';
import type { Attestation } from '@storytree/verdict-contract';
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
  AssetConflictError,
  type LibraryBackend,
  type AssetInput,
  type CommentPatch,
  type HealthProbe,
  type StudioStore,
} from './libraryBackend';
import { HttpError, sendJson } from './httpUtil';
import { handleDb } from './dbControl';
import { handleDbWake, type DbWaker } from './dbWake';
import type { CodeStamp } from './codeStamp';
import type { InviteMailer } from './inviteMailer';

const ASSET_CATEGORIES: AssetCategory[] = [
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
];

export interface Paths {
  repoRoot: string;
  docsDir: string;
  storiesDir: string;
  dataDir: string;
  commentsFile: string;
  assetsFile: string;
  usersFile: string;
  attestationsFile: string;
}

/** Resolve every repo path the API serves from, given the studio app root. */
export function resolveStudioPaths(studioRoot: string): Paths {
  const repoRoot = path.resolve(studioRoot, '..', '..');
  const dataDir = path.join(studioRoot, 'data');
  return {
    repoRoot,
    docsDir: path.join(repoRoot, 'docs'),
    storiesDir: path.join(repoRoot, 'stories'),
    dataDir,
    commentsFile: path.join(dataDir, 'comments.json'),
    assetsFile: path.join(dataDir, 'assets.json'),
    usersFile: path.join(dataDir, 'users.json'),
    attestationsFile: path.join(dataDir, 'attestations.json'),
  };
}

// ---------- small http helpers ----------

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

/** Drop a leading YAML frontmatter block (ADR-0037 structured status) — readers get prose. */
function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) return markdown;
  const end = markdown.indexOf('\n---', 4);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\s*\n/, '');
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
        const content = stripFrontmatter(await fs.readFile(full, 'utf8'));
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

// ---------- guarded-mode policy seam (ADR-0042) ----------

/**
 * Comment write scoping for hosted mode (studio-cloud `guest-scope`): the
 * author is STAMPED from the verified identity (the client field is ignored —
 * authorship cannot be forged), and `ownOnly` callers may only PATCH/DELETE
 * comments they authored. `null` scope = the open dev posture (client-supplied
 * author, no ownership wall).
 */
export interface CommentScope {
  author: string;
  ownOnly: boolean;
}

/**
 * The caller's membership, as `GET /api/me` reports it to the SPA (ADR-0043):
 * who they are, their role, and whether they're a member at all (so the client can
 * render the app or the request-access wall). `storeUnreachable` is the degraded
 * signal when membership couldn't be resolved because the live store was down.
 */
export interface MeInfo {
  email: string | null;
  role: 'admin' | 'member' | null;
  status: 'invited' | 'active' | null;
  member: boolean;
  storeUnreachable?: boolean;
  /**
   * Whether this caller may wake the idle-stopped DB from the hosted studio (studio-cloud
   * `hosted-db-wake`, ADR-0049) — drives the StoreBanner's "Wake the database" button. Seed admins
   * (degraded mode) or resolved admins (normal mode); false for the open dev posture (local uses
   * the gcloud Start DB button instead).
   */
  canWakeDb?: boolean;
}

/** The open dev posture's `/api/me` — no policy means full local access (the studio works offline). */
export const DEV_ME: MeInfo = { email: null, role: 'admin', status: 'active', member: true, canWakeDb: false };

/**
 * What the hosted server injects per request. `gate` runs before dispatch and
 * refuses by throwing HttpError (401 identity-less, 403 non-member / out-of-scope
 * write, 503 store-down); `me` answers `GET /api/me`; absent policy = the open dev
 * posture.
 */
export interface ApiPolicy {
  gate(method: string, pathname: string): void;
  commentScope: CommentScope | null;
  me: MeInfo;
}

// ---------- route handlers ----------

export async function handleComments(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  backend: LibraryBackend,
  scope: CommentScope | null = null,
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
      // Hosted mode stamps the verified identity; dev keeps the client field.
      author: scope ? scope.author : asString(input.author).trim() || 'operator',
      createdAt: new Date().toISOString(),
      resolved: false,
      resolvedAt: null,
    };
    return sendJson(res, 201, await backend.createComment(comment));
  }

  if (method === 'PATCH') {
    const id = url.searchParams.get('id') ?? '';
    await ensureCommentOwnership(backend, id, scope);
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
    await ensureCommentOwnership(backend, id, scope);
    if (!(await backend.deleteComment(id))) throw new HttpError(404, 'comment not found');
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(405, `method ${method} not allowed`);
}

/**
 * The own-comments-only wall: an `ownOnly` caller may not move another author's
 * comment. A missing comment falls through (the backend call answers the 404),
 * so ownership never leaks existence.
 */
async function ensureCommentOwnership(
  backend: LibraryBackend,
  id: string,
  scope: CommentScope | null,
): Promise<void> {
  if (!scope?.ownOnly || !id) return;
  const target = (await backend.listComments({})).find((c) => c.id === id);
  if (target && target.author !== scope.author) {
    throw new HttpError(403, 'read + comment scope — you can only edit your own comments');
  }
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
export function isConnectionError(err: unknown): boolean {
  if (err instanceof HttpError || err instanceof AssetConflictError) return false;
  if (isLastAdminError(err)) return false;
  if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'ZodError') return false;
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && PG_CONNECTION_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : '';
  return /connect|terminat|timeout/i.test(message);
}

/**
 * A last-admin guard violation, identified by `name` alone (`LastAdminError`) so neither
 * the route layer nor the JSON backend needs to import the store's class — the pg store
 * throws the real class, the JSON backend throws a tagged Error, both read the same here.
 */
function isLastAdminError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'LastAdminError';
}

const DB_UNREACHABLE_MESSAGE =
  'live store unreachable — start the DB (pnpm db:up or the Start DB button)';

export async function handleAssets(
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

// ---------- users (admin-only, ADR-0043 invite-ui) ----------
//
// The gate (createMembersPolicy) restricts /api/users to admins; these handlers carry the CRUD.
// invitedBy + the audit actor come from the verified caller (ctx.policy.me.email). The last-admin
// guard lives at the store's write boundary — a violation throws a name-tagged LastAdminError that
// the central catch maps to 409. Email is normalised locally (trim + lowercase) for lookups; the
// store re-validates through @storytree/core's zod schema on every write.

function normalizeEmailInput(raw: string): string {
  return raw.trim().toLowerCase();
}

function asRole(v: unknown): 'admin' | 'member' | null {
  return v === 'admin' || v === 'member' ? v : null;
}

export async function handleUsers(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  backend: Pick<LibraryBackend, 'listUsers' | 'getUser' | 'upsertUser' | 'removeUser'>,
  caller: string | null,
  mailer: InviteMailer | null = null,
): Promise<void> {
  const method = req.method ?? 'GET';

  if (method === 'GET') {
    return sendJson(res, 200, await backend.listUsers());
  }

  if (method === 'POST') {
    // Invite: write an `invited` row, then email the invitee the studio link (best-effort — the row
    // is already authoritative; a mail failure is reported, not a 500). Activation still happens on
    // the invitee's first request (resolveMembersAccess). A duplicate email is a 409, not a silent
    // overwrite. The `notify` field tells the admin whether the email actually went out.
    const input = await readJsonBody<Record<string, unknown>>(req);
    const email = normalizeEmailInput(asString(input.email));
    const role = asRole(input.role);
    if (!email || !email.includes('@')) throw new HttpError(400, 'a valid email is required');
    if (!role) throw new HttpError(400, 'role must be "admin" or "member"');
    if (await backend.getUser(email)) throw new HttpError(409, `${email} is already in the directory`);
    const now = new Date().toISOString();
    const created = await backend.upsertUser(
      { email, role, status: 'invited', invitedBy: caller, createdAt: now, lastSeenAt: now },
      caller ?? 'admin',
    );
    const notify = mailer
      ? await mailer.send(email, role, caller)
      : { status: 'skipped' as const, detail: 'email notifications are not configured' };
    return sendJson(res, 201, { ...created, notify });
  }

  if (method === 'PATCH') {
    // Re-role. Spread the existing row so status/invitedBy/createdAt survive; the guard refuses a
    // downgrade of the last admin (→ 409).
    const input = await readJsonBody<Record<string, unknown>>(req);
    const email = normalizeEmailInput(asString(input.email));
    const role = asRole(input.role);
    if (!email) throw new HttpError(400, 'a valid email is required');
    if (!role) throw new HttpError(400, 'role must be "admin" or "member"');
    const existing = await backend.getUser(email);
    if (!existing) throw new HttpError(404, 'user not found');
    const updated = await backend.upsertUser({ ...existing, role }, caller ?? 'admin');
    return sendJson(res, 200, updated);
  }

  if (method === 'DELETE') {
    // Remove. History is retained (comment authorship stays attributed); the last admin can't go.
    const email = normalizeEmailInput(url.searchParams.get('email') ?? '');
    if (!email) throw new HttpError(400, 'email query param is required');
    if (!(await backend.removeUser(email, caller ?? 'admin'))) throw new HttpError(404, 'user not found');
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(405, `method ${method} not allowed`);
}

// ---------- per-UAT-test attestations (ADR-0044 attestation-surface) ----------
//
// GET /api/attestations?storyId=<id> — the story's UAT tests (parsed from its `## Story UAT`
// prose via the orchestrator's loadNodeSpec, the SAME source as the CLI tree column) joined with
// their latest human/machine marks. Member-readable. POST /api/attestations — an admin records a
// DIRECT human attestation (signer stamped from the verified caller, no agent relay — the higher-
// rigor in-UI signature, ADR-0044 d.4); admin-only by the gate's method rule. A vouch, never a
// gate verdict (d.2): this writes events.attestation only and the world island hue is untouched.

/** A story's UAT test units via loadNodeSpec (lazy orchestrator); `[]` for a missing/odd spec. */
async function uatTestsForStory(storiesDir: string, storyId: string): Promise<UatTest[]> {
  const file = path.join(storiesDir, storyId, 'story.md');
  if (!existsSync(file)) return [];
  const { loadNodeSpec } = await loadOrchestrator();
  try {
    return loadNodeSpec(file).uatTests;
  } catch {
    return [];
  }
}

export async function handleAttestations(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: { paths: Paths; backend: Pick<LibraryBackend, 'listAttestations' | 'recordAttestation'> },
  caller: string | null,
): Promise<void> {
  const method = req.method ?? 'GET';

  if (method === 'GET') {
    const storyId = (url.searchParams.get('storyId') ?? '').trim();
    if (!storyId) throw new HttpError(400, 'storyId query param is required');
    const [tests, marks] = await Promise.all([
      uatTestsForStory(ctx.paths.storiesDir, storyId),
      ctx.backend.listAttestations(storyId),
    ]);
    const rows = tests.map((t) => ({ ...t, ...(marks[t.id] ?? {}) }));
    return sendJson(res, 200, { storyId, tests: rows });
  }

  if (method === 'POST') {
    const input = await readJsonBody<Record<string, unknown>>(req);
    const testId = asString(input.testId).trim();
    if (!testId) throw new HttpError(400, 'testId is required');
    const outcome = input.outcome === 'fail' ? 'fail' : 'pass';
    const note = asString(input.note).trim();
    // Hosted mode stamps the verified admin as the signer (can't be forged); dev keeps the client
    // field (open localhost posture). An in-UI signature is a DIRECT human vouch — no relayedBy.
    const signer = caller ?? (asString(input.signer).trim() || 'operator');
    const doc: Attestation = {
      testId,
      outcome,
      witness: 'human',
      signer,
      at: new Date().toISOString(),
      ...(note ? { note } : {}),
    };
    try {
      return sendJson(res, 201, await ctx.backend.recordAttestation(doc, signer));
    } catch (err) {
      if (err && typeof err === 'object' && (err as { name?: unknown }).name === 'ZodError') {
        throw new HttpError(400, `attestation failed validation: ${err instanceof Error ? err.message : String(err)}`);
      }
      throw err;
    }
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
  const { loadNodeSpec, effectiveUatWitness } = await loadOrchestrator();
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
      // The fail-closed witness default (ADR-0040) — holds even when the spec fails to load.
      uatWitness: 'human',
      dependsOn: [],
      capabilities: [],
    };
    try {
      const spec = loadNodeSpec(storyFile);
      story.title = spec.title;
      story.outcome = spec.outcome;
      story.status = isWorkStatus(spec.status) ? spec.status : null;
      story.proofMode = spec.proofMode;
      story.uatWitness = effectiveUatWitness(spec.uatWitness);
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

/** Everything GET /api/health needs, injectable so the integration test can stub each leg. */
export interface HealthDeps {
  store: StudioStore;
  /** backend.health() — contractually non-throwing ({db:'n/a'} for json). */
  health: () => Promise<HealthProbe>;
  /** The code-stamp probe (codeStamp.ts) — contractually non-throwing, null = no stamp. */
  codeStamp: () => Promise<CodeStamp | null>;
}

/**
 * GET /api/health — must NEVER 500: it is what the UI leans on when the DB is down. Beyond
 * the store probe (+ the pg schema-skew pair) it carries the code stamp: server-start HEAD
 * vs the checkout's HEAD now, so the UI can say "the checkout moved under this server —
 * restart it" instead of letting new endpoints 404 silently (the /api/presence incident).
 * The stamp is omitted (not an error) when git can't answer; a probe rejection is belt-and-
 * braces flattened to the same absence. Exported for the integration test (the dbControl.ts
 * pattern).
 */
export async function handleHealth(
  req: IncomingMessage,
  res: ServerResponse,
  deps: HealthDeps,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') throw new HttpError(405, 'method not allowed');
  const [health, code] = await Promise.all([
    deps.health(),
    deps.codeStamp().catch(() => null),
  ]);
  sendJson(res, 200, { store: deps.store, ...health, ...(code ? { code } : {}) });
}

/**
 * GET /api/presence — the active-session layer ALONE, so the client can poll it
 * cheaply (StoreBanner's slow cadence) without re-walking stories/ the way
 * /api/tree does. activeSessions() is contractually non-throwing: a down DB or
 * the json backend answers 200 `{sessions: null}` (ADR-0033 advisory — absence,
 * never an error), so the only error path here is the 405 method guard.
 * Exported for the integration test (the dbControl.ts pattern).
 */
export async function handlePresence(
  req: IncomingMessage,
  res: ServerResponse,
  backend: Pick<LibraryBackend, 'activeSessions'>,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') throw new HttpError(405, 'method not allowed');
  sendJson(res, 200, { sessions: await backend.activeSessions() });
}

/**
 * GET /api/activity — the in-flight-build layer ALONE (ADR-0048), polled cheaply
 * by the world (sibling to /api/presence). inFlightBuilds() is contractually
 * non-throwing: a down DB / json backend answers 200 `{builds: null}` (advisory
 * absence, never a 503), so the only error path is the 405 method guard.
 * Exported for the integration test (the handlePresence pattern).
 */
export async function handleActivity(
  req: IncomingMessage,
  res: ServerResponse,
  backend: Pick<LibraryBackend, 'inFlightBuilds'>,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') throw new HttpError(405, 'method not allowed');
  sendJson(res, 200, { builds: await backend.inFlightBuilds() });
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
    const markdown = stripFrontmatter(await fs.readFile(file, 'utf8'));
    return sendJson(res, 200, { id, title: deriveTitle(markdown, path.basename(file)), markdown });
  }
  throw new HttpError(404, 'not found');
}

// ---------- the dispatch ----------

/** Everything one front (dev plugin / hosted server) wires into the route table. */
export interface ApiContext {
  paths: Paths;
  backend: LibraryBackend;
  store: StudioStore;
  codeStamp: () => Promise<CodeStamp | null>;
  /**
   * /api/db/* shells out to gcloud with the OPERATOR's ambient ADC — sound only
   * on the operator's own localhost dev server (dbControl.ts). The hosted server
   * sets false and the endpoints answer 403 (ADR-0042 d.3).
   */
  allowDbControl: boolean;
  /**
   * Hosted-native DB wake (studio-cloud `hosted-db-wake`, ADR-0049): the keyless Cloud SQL Admin
   * REST waker (dbWake.ts). Unlike `/api/db/*` (gcloud, operator's machine), this works IN the
   * container, so it is served regardless of `allowDbControl`. Absent (the dev plugin) → 404.
   */
  dbWake?: DbWaker | undefined;
  /** Hosted-mode policy (gate + comment scoping); absent = the open dev posture. */
  policy?: ApiPolicy | undefined;
  /** Invite-email sender for POST /api/users; absent = no email (the invite still writes its row). */
  invites?: InviteMailer | undefined;
}

/**
 * The one /api/* dispatch: routes, policy gate, and the central error mapping
 * (HttpError → its status; pg-connection failure → 503 with the Start-DB remedy;
 * anything else → 500). Never throws — every outcome is an HTTP answer.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: ApiContext,
): Promise<void> {
  try {
    ctx.policy?.gate(req.method ?? 'GET', url.pathname);
    if (url.pathname === '/api/me') {
      // The caller's membership/role (ADR-0043) — the one endpoint a non-member
      // may reach, so the SPA can render the request-access wall. Open dev posture (no
      // policy) reports full local access.
      if ((req.method ?? 'GET') !== 'GET') throw new HttpError(405, 'method not allowed');
      sendJson(res, 200, ctx.policy ? ctx.policy.me : DEV_ME);
    } else if (url.pathname === '/api/health') {
      await handleHealth(req, res, {
        store: ctx.store,
        health: () => ctx.backend.health(),
        codeStamp: ctx.codeStamp,
      });
    } else if (url.pathname === '/api/db/wake') {
      // Hosted-native wake (ADR-0049): keyless Cloud SQL Admin REST, so it works in the container
      // — served REGARDLESS of allowDbControl (the gcloud `/api/db/*` premise below doesn't hold
      // hosted). The policy gate already authorized it (seed admin in degraded mode / admin in
      // normal mode); absent waker (dev plugin) → 404 inside the handler.
      await handleDbWake(req, res, ctx.dbWake ?? null);
    } else if (url.pathname.startsWith('/api/db/')) {
      if (!ctx.allowDbControl) {
        throw new HttpError(403, 'db control is not served in hosted mode (ADR-0042)');
      }
      await handleDb(req, res, url);
    } else if (url.pathname.startsWith('/api/docs')) {
      await handleDocs(req, res, url, ctx.paths);
    } else if (url.pathname === '/api/tree') {
      if ((req.method ?? 'GET') !== 'GET') throw new HttpError(405, 'method not allowed');
      const payload = await readTree(ctx.paths.storiesDir);
      // Advisory enrichments (ADR-0033 / ADR-0048): no call ever throws — null
      // (json store / DB down) just means the tree renders without that layer.
      // Run in parallel so a down DB costs one 4s budget, not three. `builds`
      // seeds the in-flight wisp layer so the world paints it on first load
      // (the poll then keeps it fresh) — parity with `sessions`.
      const [verdicts, sessions, builds] = await Promise.all([
        ctx.backend.latestVerdicts(),
        ctx.backend.activeSessions(),
        ctx.backend.inFlightBuilds(),
      ]);
      if (verdicts) {
        for (const story of payload.stories) {
          const sv = verdicts[story.id];
          if (sv) story.verdict = sv; // the story's OWN UAT node, never a roll-up
          for (const cap of story.capabilities) {
            const cv = verdicts[cap.id];
            if (cv) cap.verdict = cv;
          }
        }
      }
      if (sessions && sessions.length > 0) payload.sessions = sessions;
      if (builds && builds.length > 0) payload.builds = builds;
      sendJson(res, 200, payload);
    } else if (url.pathname === '/api/presence') {
      await handlePresence(req, res, ctx.backend);
    } else if (url.pathname === '/api/activity') {
      await handleActivity(req, res, ctx.backend);
    } else if (url.pathname === '/api/comments') {
      await handleComments(req, res, url, ctx.backend, ctx.policy?.commentScope ?? null);
    } else if (url.pathname === '/api/assets') {
      await handleAssets(req, res, url, ctx.backend);
    } else if (url.pathname === '/api/users') {
      // Admin-gated by the policy; the caller (invitedBy + audit actor) is the verified identity.
      // The invite mailer (when configured) emails the invitee on POST — see handleUsers.
      await handleUsers(req, res, url, ctx.backend, ctx.policy?.me.email ?? null, ctx.invites ?? null);
    } else if (url.pathname === '/api/attestations') {
      // GET is member-readable; POST is admin-only by the gate's method rule. The signer is the
      // verified caller (stamped, can't be forged); the open dev posture has no caller (null).
      await handleAttestations(req, res, url, ctx, ctx.policy?.me.email ?? null);
    } else {
      throw new HttpError(404, 'unknown endpoint');
    }
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message, ...(err.details ?? {}) });
    } else if (isLastAdminError(err)) {
      // A last-admin guard violation from either backend (its `name` is the only tag) → 409.
      sendJson(res, 409, { error: err instanceof Error ? err.message : String(err) });
    } else if (isConnectionError(err)) {
      // A pg connection failure surfacing here means the live store is down, not a
      // bug — answer 503 with the remedy so the UI can offer the Start DB button.
      sendJson(res, 503, { error: DB_UNREACHABLE_MESSAGE });
    } else {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
