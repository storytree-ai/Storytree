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
import type { UatTest } from '@storytree/library';
import type { Attestation, Verdict } from '@storytree/proof-protocol';
// Type-only (fully erased under verbatimModuleSyntax — no runtime import, so it never hits the
// vite config-load trap the lazy `loadOrchestrator()` below avoids): the sign-time trust guard's
// shapes, so `buildUatVerdict` can take the real `checkUatProof` as a precisely-typed injection.
import type { UatProofCheck, UatProofResult } from '@storytree/orchestrator';
import type {
  AdrDocStatus,
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
import type { BuildRegistry } from './buildRegistry';
import { runBuildJob, type BuildRunner } from './buildWorker';

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

const ADR_STATUSES = new Set<AdrDocStatus>(['proposed', 'accepted', 'superseded']);

/**
 * The ADR frontmatter `status` (+ optional `decided`) surfaced on the Library/docs cards (ADR-0037
 * §1) — the observability "catch" a green flip leans on (ADR-0084). A tiny, dependency-free read of
 * the leading YAML block (the studio is browser-bundled and must not import the CLI's
 * `parseAdrFrontmatter`, which pulls in `yaml`/`zod`); the frontmatter format is CI-validated
 * (`adr-health`), so a flat line scan is sufficient. TOLERANT, unlike the CLI parser: a non-ADR
 * filename, a missing/unterminated block, or an unknown status yields `null` (the card shows no chip)
 * — a malformed record must never blank the whole docs list. Pure, exported for the wiring test.
 */
export function parseDocStatus(
  filename: string,
  raw: string,
): { status: AdrDocStatus; decided?: string } | null {
  if (!/^\d{4}-.*\.md$/.test(filename)) return null;
  if (!raw.startsWith('---\n')) return null;
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return null;
  const block = raw.slice(4, end);
  const statusMatch = block.match(/^status:[ \t]*["']?(proposed|accepted|superseded)["']?[ \t]*$/m);
  const status = statusMatch?.[1] as AdrDocStatus | undefined;
  if (!status || !ADR_STATUSES.has(status)) return null;
  const decidedMatch = block.match(/^decided:[ \t]*["']?(\d{4}-\d{2}-\d{2})["']?/m);
  return decidedMatch?.[1] ? { status, decided: decidedMatch[1] } : { status };
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

export async function listDocs(docsDir: string): Promise<DocMeta[]> {
  const out: DocMeta[] = [];
  async function walk(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && ent.name.endsWith('.md')) {
        const relId = path.relative(docsDir, full).split(path.sep).join('/');
        const raw = await fs.readFile(full, 'utf8');
        const content = stripFrontmatter(raw);
        const group = deriveGroup(relId);
        const meta: DocMeta = {
          id: relId,
          title: deriveTitle(content, ent.name),
          group,
          excerpt: deriveExcerpt(content),
        };
        // Only Decisions docs carry a frontmatter status (ADR-0037); surface it for the card chip.
        const fm = group === 'Decisions' ? parseDocStatus(ent.name, raw) : null;
        if (fm) {
          meta.status = fm.status;
          if (fm.decided) meta.decided = fm.decided;
        }
        out.push(meta);
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
  ctx: {
    paths: Paths;
    backend: Pick<LibraryBackend, 'listAttestations' | 'recordAttestation' | 'verdictEvents'>;
  },
  caller: string | null,
): Promise<void> {
  const method = req.method ?? 'GET';

  if (method === 'GET') {
    const storyId = (url.searchParams.get('storyId') ?? '').trim();
    if (!storyId) throw new HttpError(400, 'storyId query param is required');
    const [tests, marks, events] = await Promise.all([
      uatTestsForStory(ctx.paths.storiesDir, storyId),
      ctx.backend.listAttestations(storyId),
      // The per-test SIGNED-verdict stream (ADR-0082) for the PROVEN state — advisory, same contract
      // as /api/tree's: `null` for the json backend / a down DB (the proven column then silently
      // absent), absent on a partial mock (the `?.()`).
      ctx.backend.verdictEvents?.() ?? Promise.resolve(null),
    ]);
    // The PROVEN state (ADR-0082) is the latest SIGNED verdict in events.verdict — a REAL gate
    // verdict, DELIBERATELY DISTINCT from the vouch marks (`human`/`machine`). It greens the story
    // crown via the AND-roll-up; the vouch never does. Derived through the SAME `rollupStatus` /
    // `rollupStoryUat` compute the CLI tree + the crown roll-up use, so the studio can't drift from it.
    let provenOf: ((id: string) => 'pass' | 'fail' | undefined) | null = null;
    let storyUat: 'healthy' | 'unhealthy' | null | undefined;
    if (events) {
      const { rollupStatus, rollupStoryUat } = await loadOrchestrator();
      provenOf = (id) => {
        const status = rollupStatus(id, events);
        return status === 'healthy' ? 'pass' : status === 'unhealthy' ? 'fail' : undefined;
      };
      storyUat = storyUatRollup(rollupStoryUat(tests, events));
    }
    const rows = tests.map((t) => {
      const proven = provenOf?.(t.id);
      return { ...t, ...(marks[t.id] ?? {}), ...(proven ? { proven } : {}) };
    });
    return sendJson(res, 200, { storyId, tests: rows, ...(storyUat !== undefined ? { storyUat } : {}) });
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

// ---------- per-UAT-test operator-attested VERDICT (ADR-0082 — the studio "I saw it work" button) ----------
//
// POST /api/uat/attest signs a REAL `operator-attested` verdict into events.verdict — the studio
// admin's in-UI signature (ADR-0044 §4 deferred, generalized by ADR-0082 to a real green path). This
// is NOT the lower-rigor events.attestation vouch that POST /api/attestations writes: it is the same
// signed gate verdict the CLI `uat attest` and a build produce, so it greens the story crown via
// `rollupStoryUat`. Three honesty walls, all enforced here BEFORE the write, none bypassable:
//  - the signer is the VERIFIED caller (the IAP identity), never a client-supplied field — a verdict's
//    signer cannot be forged;
//  - the sign-time trust guard `checkUatProof` (ADR-0082 d.2) refuses a machine-witness test (a click
//    cannot stand in for a machine proof) and any agent/`sandbox:` self-attestation;
//  - the verdict pins the commit the studio is SERVING and must PERSIST — a verdict that does not
//    land in the live store greens nothing (the json backend refuses, like the CLI's `--pg`).
// Admin-only by the dispatch gate's method rule (POST, not /api/comments).

/** The story id a `<story>#uat-<n>` test belongs to (the `uat.ts` `storyOf` rule). */
function uatStoryOf(testId: string): string {
  const hash = testId.indexOf('#');
  return hash > 0 ? testId.slice(0, hash) : testId;
}

/**
 * Narrow `rollupStoryUat`'s broad `Status` return to the wire's 3-state story-UAT roll-up. The
 * compute only ever yields healthy/unhealthy/null at runtime (ADR-0082 d.3), but its declared type is
 * the full status enum; mapping anything-not-green-or-withered to `null` also IS the under-claim
 * default — the world never over-claims a crown the per-test verdicts don't support.
 */
function storyUatRollup(rolled: string | null): 'healthy' | 'unhealthy' | null {
  return rolled === 'healthy' || rolled === 'unhealthy' ? rolled : null;
}

/** The fields the verdict builder needs about the test + the observation being signed. */
export interface UatVerdictInput {
  test: { id: string; witness: UatTest['witness'] };
  outcome: 'pass' | 'fail';
  /** The resolved (verified) operator identity — never client-supplied. */
  signer: string;
  /** The commit the studio is serving (what the operator observed) — pins the verdict. */
  commitSha: string;
  note?: string;
  /** ISO sign time (injected so the builder is a pure unit). */
  at: string;
}

/**
 * PURE (ADR-0082): run the sign-time trust guard, then build the `operator-attested` {@link Verdict}
 * for a UAT test. `check` is injected (the real `checkUatProof`, fed by the test so the studio is held
 * to the SAME honesty compute as the CLI / the spine) — a `machine`-witness test or an agent/`sandbox:`
 * signer is REFUSED here, before any verdict exists. Returns the verdict to persist, or the refusal
 * reason. No I/O, no clock, no store — the HTTP handler wraps it with those.
 */
export function buildUatVerdict(
  input: UatVerdictInput,
  check: (c: UatProofCheck) => UatProofResult,
): { ok: true; verdict: Verdict } | { ok: false; reason: string } {
  const signer = input.signer.trim();
  const guard = check({ witness: input.test.witness, verdict: { proofMode: 'operator-attested', signer } });
  if (!guard.ok) return { ok: false, reason: guard.reason };
  const note = input.note?.trim();
  const verdict: Verdict = {
    unitId: input.test.id,
    proofMode: 'operator-attested',
    outcome: input.outcome,
    commitSha: input.commitSha,
    signer,
    runId: `studio-uat-attest:${input.at}`,
    outputVersion: 'v1',
    evidence: [{ kind: 'operator-attested', ref: signer, ...(note ? { note } : {}) }],
    at: input.at,
  };
  return { ok: true, verdict };
}

/**
 * POST /api/uat/attest — sign an operator-attested UAT verdict (see the section header for the three
 * honesty walls). `caller` is the verified IAP identity (the signer; the open dev posture has none →
 * the conventional `operator`); `commitSha` is the studio's serving commit (refused if unresolvable).
 */
export async function handleUatAttest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { paths: Paths; backend: Pick<LibraryBackend, 'signUatVerdict' | 'verdictEvents'> },
  caller: string | null,
  commitSha: string | null,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'POST') throw new HttpError(405, 'method not allowed');
  const input = await readJsonBody<Record<string, unknown>>(req);
  const testId = asString(input.testId).trim();
  if (!testId) throw new HttpError(400, 'testId is required');
  const outcome = input.outcome === 'fail' ? 'fail' : 'pass';
  const note = asString(input.note).trim();

  // The test must be a real DECLARED unit — its witness drives the trust guard. A typo'd id never
  // signs a verdict against nothing (the CLI `uat attest` posture).
  const storyId = uatStoryOf(testId);
  const tests = await uatTestsForStory(ctx.paths.storiesDir, storyId);
  const test = tests.find((t) => t.id === testId);
  if (!test) {
    throw new HttpError(
      400,
      tests.length === 0
        ? `no UAT test "${testId}" — story "${storyId}" declares no UAT tests (or its spec did not load)`
        : `no UAT test "${testId}" in story "${storyId}"; declared: ${tests.map((t) => t.id).join(', ')}`,
    );
  }

  // HONESTY WALL: the signer is the VERIFIED caller — NEVER `input.signer` (a verdict's signer is not
  // forgeable). The open dev posture (no policy → no caller) stamps the conventional local operator,
  // exactly like handleComments / handleAttestations.
  const signer = caller ?? 'operator';

  // HONESTY WALL: the verdict pins the commit the studio is serving. Unresolvable (no git HEAD and no
  // deploy stamp) → refuse — a verdict must pin a real commit (fail-closed).
  if (!commitSha) {
    throw new HttpError(
      422,
      "could not resolve the studio's serving commit to pin the verdict (no git HEAD / STORYTREE_STUDIO_COMMIT)",
    );
  }

  // HONESTY WALL: the sign-time trust guard (checkUatProof) — refuse a machine-witness test / an
  // agent self-attestation BEFORE any write. The compute is the orchestrator's single source.
  const { checkUatProof, rollupStoryUat } = await loadOrchestrator();
  const built = buildUatVerdict(
    { test, outcome, signer, commitSha, ...(note ? { note } : {}), at: new Date().toISOString() },
    checkUatProof,
  );
  if (!built.ok) throw new HttpError(422, `refused — ${built.reason}`);

  // HONESTY WALL: the write must persist (a verdict that evaporates greens nothing). The json backend
  // has no events.verdict — refuse, mirroring the CLI's `--pg`-only `uat attest`.
  if (!ctx.backend.signUatVerdict) {
    throw new HttpError(503, 'signing a UAT verdict needs the live store (pg) — bring the DB up (pnpm db:up)');
  }
  const saved = await ctx.backend.signUatVerdict(built.verdict, signer);

  // Echo the story's fresh UAT roll-up so the UI can confirm whether this signature greened the crown
  // (ADR-0082 d.3 — the AND over every declared per-test verdict). Best-effort: absent if the backend
  // has no verdict-event read.
  const events = (await ctx.backend.verdictEvents?.()) ?? null;
  const storyUat = events ? storyUatRollup(rollupStoryUat(tests, events)) : undefined;
  sendJson(res, 201, {
    verdict: { unitId: saved.unitId, outcome: saved.outcome, signer: saved.signer, at: saved.at },
    ...(storyUat !== undefined ? { storyUat } : {}),
  });
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
// fix, as PgBackend's dynamic import of the store `./store` subpaths in libraryBackend.ts.

type OrchestratorModule = typeof import('@storytree/orchestrator');
type LoadNodeSpec = OrchestratorModule['loadNodeSpec'];
type ResolveBuildConfig = OrchestratorModule['resolveBuildConfig'];
/** The loader's spec shape — used for the story-level build predicate without a value import. */
type NodeSpecLike = ReturnType<LoadNodeSpec>;

let orchestratorModulePromise: Promise<OrchestratorModule> | null = null;

function loadOrchestrator(): Promise<OrchestratorModule> {
  return (orchestratorModulePromise ??= import('@storytree/orchestrator'));
}

const isWorkStatus = (s: string): s is WorkStatus =>
  ['proposed', 'building', 'healthy', 'unhealthy', 'mapped', 'retired'].includes(s);

// Returns the view node AND the loaded spec (null on a missing/malformed file): the spec is needed
// for the story-level build predicate (isStoryBuildable reads the cap specs), so loading it once
// here avoids a second read in readTree.
function loadTreeCapability(
  loadNodeSpec: LoadNodeSpec,
  resolveBuildConfig: ResolveBuildConfig,
  storyDir: string,
  capId: string,
): { node: TreeCapability; spec: NodeSpecLike | null } {
  const node: TreeCapability = {
    id: capId,
    title: capId,
    outcome: '',
    status: null,
    proofMode: '',
    dependsOn: [],
  };
  const file = path.join(storyDir, `${capId}.md`);
  if (!existsSync(file)) return { node: { ...node, error: 'spec file missing' }, spec: null };
  try {
    const spec = loadNodeSpec(file);
    return {
      node: {
        ...node,
        title: spec.title,
        outcome: spec.outcome,
        status: isWorkStatus(spec.status) ? spec.status : null,
        proofMode: spec.proofMode,
        dependsOn: spec.dependsOn,
        // ADR-0090 Phase 1: a node is buildable when it carries a proof config (spec-borne or
        // registry) — the SAME determination `node build`/`node resolve` make.
        buildable: resolveBuildConfig(spec) != null,
      },
      spec,
    };
  } catch (err) {
    return { node: { ...node, error: err instanceof Error ? err.message : String(err) }, spec: null };
  }
}

export async function readTree(
  storiesDir: string,
): Promise<{
  payload: TreePayload;
  uatTestsByStory: Map<string, { id: string }[]>;
  coverageByStory: Map<string, { id: string; covers?: readonly string[] }[]>;
}> {
  const stories: TreeStory[] = [];
  // The per-story OWN-PROOF obligations — the UNION of the WITNESSABLE per-test UAT tests (ADR-0082;
  // would-be legs filtered out per ADR-0097) AND the `## Reliability Gates` (ADR-0085, the brownfield
  // obligation set) — collected as the specs load so the /api/tree handler can roll each story's
  // per-obligation verdicts up into its crown without re-reading every spec. Keyed by `{ id }` only.
  const uatTestsByStory = new Map<string, { id: string }[]>();
  // ADR-0097: per-story capability COVERAGE — the reliability gates (with their `(covers:)` lists), so
  // a brownfield cap with no driven verdict greens via an adopted gate that declares it covered.
  const coverageByStory = new Map<string, { id: string; covers?: readonly string[] }[]>();
  if (!existsSync(storiesDir)) return { payload: { stories }, uatTestsByStory, coverageByStory };
  const { loadNodeSpec, effectiveUatWitness, resolveBuildConfig, isStoryBuildable, storyGoGreen } =
    await loadOrchestrator();
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
      consumedBy: [],
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
      story.consumedBy = spec.consumedBy;
      // Studio render hint (ADR-0076): `render: building` ⇒ drawn as a de-connected building.
      story.building = spec.render === 'building';
      // ADR-0090 Phase 1: gate-buildability for the UI-driven Build control (same discovery as the CLI).
      story.buildable = resolveBuildConfig(spec) != null;
      const capSpecs: NodeSpecLike[] = [];
      story.capabilities = spec.capabilities.map((capId) => {
        const loaded = loadTreeCapability(loadNodeSpec, resolveBuildConfig, dir, capId);
        if (loaded.spec !== null) capSpecs.push(loaded.spec);
        return loaded.node;
      });
      // ADR-0090 Phase 2 increment: whether pressing Build on the STORY runs a whole-story
      // `story build <id> --real` — the SAME fail-closed predicate the CLI prechecks with, so the
      // affordance never offers a chain the gate would refuse (e.g. capless `agent`, all-live-only
      // `library`). The studio's story-level Build mode is `--real` (the honest "really build this").
      // This stays the build MECHANISM precheck (the build POST validates against it); the go-green
      // AFFORDANCE the panel renders is status-aware (`goGreen` below, ADR-0094).
      story.storyBuildable = isStoryBuildable(spec, capSpecs, 'real');
      // ADR-0094: the go-green affordance is a function of the story's STATUS, not a status-blind
      // Build. `proposed → healthy` lights Build (a real drive); `mapped → healthy` lights Adopt (its
      // `## Reliability Gates`, observe-and-signed to an `adopted` verdict, ADR-0085) — NEVER a
      // fail-closed Build over a mature brownfield artifact; `healthy`/etc. light nothing. Same
      // `storyGoGreen` predicate the orchestrator owns, so the panel can never over-promise.
      story.goGreen = storyGoGreen(spec, capSpecs);
      if (story.goGreen === 'adopt') {
        // The reliability gates the operator Adopts — id + kind + (for `observe`) the command the
        // spine observe-and-signs via `storytree gate run <id> --pg` (a live DB action, surfaced).
        story.adoptGates = spec.reliabilityGates.map((g) => ({
          id: g.id,
          kind: g.kind,
          ...(g.proofCommand !== undefined ? { command: g.proofCommand } : {}),
        }));
      }
      // ADR-0085 + ADR-0097: the crown rolls up the UNION of the WITNESSABLE UAT tests (would-be legs
      // filtered out — aspirational, not green-blocking) + reliability gates (a pure port greens from
      // its reliability gates alone). Both are addressable `{ id }` obligation units.
      const ownObligations = [
        ...spec.uatTests.filter((t) => !t.wouldBe),
        ...spec.reliabilityGates,
      ];
      if (ownObligations.length > 0) uatTestsByStory.set(ent.name, ownObligations);
      // The reliability gates double as per-cap coverage (ADR-0097): id + the caps each `(covers:)`.
      if (spec.reliabilityGates.length > 0) {
        coverageByStory.set(
          ent.name,
          spec.reliabilityGates.map((g) => ({ id: g.id, covers: g.covers })),
        );
      }
    } catch (err) {
      story.error = err instanceof Error ? err.message : String(err);
    }
    stories.push(story);
  }
  return { payload: { stories }, uatTestsByStory, coverageByStory };
}

/**
 * Apply the story-green crown roll-up (ADR-0083 Fork A, refining ADR-0082) to the tree payload. A
 * story that declares per-test UAT tests has its crown set from `rollupStoryGreen` — the AND of TWO
 * necessary clauses: (a) EVERY declared capability is proven `healthy`, and (b) the per-test UAT
 * AND-roll-up is green. Capabilities-green is now a NECESSARY condition (the glossary dependency rule),
 * so the crown is NEVER its own unit-id verdict and NEVER a green while any capability is red/unproven:
 * healthy ⇒ a pass crown, unhealthy ⇒ a fail crown (a red plant or a UAT regression), unproven ⇒ NO
 * verdict (the crown under-claims to `mapped`, never a stale green). A story with zero capabilities
 * (the foundational ports) satisfies the capability clause vacuously — its crown is its UAT alone. A
 * story with no per-test tests is left untouched (its own-unit verdict stands). `rollup` is injected so
 * this stays unit-testable without the lazy orchestrator. Mutates `stories` in place.
 */
export function applyUatCrowns(
  stories: TreeStory[],
  uatTestsByStory: ReadonlyMap<string, readonly { id: string }[]>,
  coverageByStory: ReadonlyMap<string, readonly { id: string; covers?: readonly string[] }[]>,
  events: ReadonlyArray<{ kind: string; seq: number; doc: unknown }>,
  rollup: (
    capabilityIds: readonly string[],
    tests: readonly { id: string }[],
    events: ReadonlyArray<{ kind: string; seq: number; doc: unknown }>,
    coverage?: readonly { id: string; covers?: readonly string[] }[],
  ) => string | null,
): void {
  for (const story of stories) {
    const tests = uatTestsByStory.get(story.id);
    if (!tests || tests.length === 0) continue;
    const capabilityIds = story.capabilities.map((c) => c.id);
    // ADR-0097: a brownfield cap with no driven verdict greens via an adopted gate that `(covers:)` it.
    const coverage = coverageByStory.get(story.id) ?? [];
    const rolled = rollup(capabilityIds, tests, events, coverage);
    if (rolled === 'healthy' || rolled === 'unhealthy') {
      // The crown's timestamp spans BOTH clauses — a cap-driven wither shows the capability's verdict
      // time, not just the UAT's (the union of the per-test ids and the capability ids).
      const at = latestVerdictAt(events, new Set([...tests.map((t) => t.id), ...capabilityIds]));
      story.verdict = { outcome: rolled === 'healthy' ? 'pass' : 'fail', at: at ?? '' };
    } else {
      // unproven: drop any own-unit verdict so the world never paints a crown the proof doesn't
      // support (provenStatus then under-claims an authored `healthy` to `mapped`).
      delete story.verdict;
    }
  }
}

/** The latest `at` among the verdict events for a story's per-test ids (ISO strings sort lexically). */
function latestVerdictAt(
  events: ReadonlyArray<{ doc: unknown }>,
  testIds: ReadonlySet<string>,
): string | undefined {
  let latest: string | undefined;
  for (const e of events) {
    const doc = e.doc as { unitId?: unknown; at?: unknown } | null;
    if (
      doc !== null &&
      typeof doc.unitId === 'string' &&
      testIds.has(doc.unitId) &&
      typeof doc.at === 'string' &&
      (latest === undefined || doc.at > latest)
    ) {
      latest = doc.at;
    }
  }
  return latest;
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

// ---------- UI-driven build (intent + status, ADR-0090 Phase 1 "the local loop") ----------
//
// POST /api/build { unitId } writes a build INTENT — a SAFE write that asks the server-process
// worker to run the existing `--live` build path; it never accepts or persists a verdict (the gate
// inside the worker signs; ADR-0090 d.2 / ADR-0091). There is deliberately NO endpoint that takes a
// verdict as input — that is the forge pathway ADR-0091 forbids. GET /api/build?runId reads the
// run's coarse transcript + status. Both hang off the SINGLE route table; the worker (registry +
// runner + discovery) is injected via {@link ApiContext.build}, like dbWake/invites — absent (the
// hosted server in Phase 1) → 404.

/** The build seam injected into the route table: the run registry, the build runner, and discovery. */
export interface BuildContext {
  registry: BuildRegistry;
  /** Drives one build (the worker); wired over the real `nodeBuild --live` in the dev front. */
  runner: BuildRunner;
  /** Whether `unitId` is a real buildable node — validated against the SAME discovery `node build` uses. */
  isBuildable(unitId: string): Promise<boolean>;
}

/**
 * POST /api/build — dispatch a build intent (202 + runId; fire-and-forget worker, the client polls);
 * GET /api/build?runId — read a run's status + coarse transcript (+ the terminal envelope/reason).
 * Every known outcome is a typed HTTP answer (400 bad body, 404 unknown id/run, 409 a build already
 * running, 405 wrong method) — never a 500 (the central catch maps HttpError → its status).
 */
export async function handleBuild(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  build: BuildContext,
): Promise<void> {
  const method = req.method ?? 'GET';

  if (method === 'POST') {
    const input = await readJsonBody<Record<string, unknown>>(req);
    const unitId = asString(input.unitId).trim();
    if (!unitId) throw new HttpError(400, 'unitId is required');
    // Validate against real discovery — a typo'd / non-buildable id is a clean 404, never a worker
    // that spawns against nothing.
    if (!(await build.isBuildable(unitId))) {
      throw new HttpError(404, `no buildable node "${unitId}"`);
    }
    const created = build.registry.createRun(unitId);
    // The single-build-at-a-time guard surfaces as 409 (a typed refusal, not a thrown 500).
    if (!created.ok) throw new HttpError(409, created.reason);
    const { runId } = created.run;
    // Fire-and-forget: the build runs after the 202; the client polls GET for progress. runBuildJob
    // never throws (it records a failed terminal state), so the floating promise can't reject.
    void runBuildJob(build.registry, runId, unitId, build.runner);
    return sendJson(res, 202, { runId });
  }

  if (method === 'GET') {
    const runId = url.searchParams.get('runId') ?? '';
    const run = build.registry.getRun(runId);
    if (!run) throw new HttpError(404, 'build run not found');
    return sendJson(res, 200, {
      runId: run.runId,
      unitId: run.unitId,
      status: run.status,
      transcript: run.transcript,
      ...(run.envelope !== undefined ? { envelope: run.envelope } : {}),
      ...(run.reason !== undefined ? { reason: run.reason } : {}),
    });
  }

  throw new HttpError(405, `method ${method} not allowed`);
}

// ---------- UI-driven ADOPT (ADR-0097 — brownfield go-green is a proving process) ----------
//
// POST /api/adopt { storyId } enters the ADOPTION proving process for a brownfield (`mapped`) story:
// it asks the server-process worker to run the EXISTING `adoptStory` entry — observe-and-sign the
// story's `observe` reliability gates (ADR-0085) to `adopted` verdicts (machine-witnessed by the spine
// principal, human-approved via `approvedBy`) and flip the story `mapped → proposed`. Like /api/build
// it is a SAFE write (it never accepts or persists a verdict from the client — the gate inside the
// worker signs; ADR-0091). It REUSES the build run registry: the adoption run is tracked exactly like
// a build, so the client polls its coarse transcript + status via the SAME GET /api/build?runId.
// Adopt GREENS NOTHING on its own (ADR-0097): it greens the capabilities its gates `(covers:)`, but an
// uncovered `build-tests` pocket holds the crown at `proposed`.

/** The adopt seam injected into the route table: the (shared) run registry, the runner, and discovery. */
export interface AdoptContext {
  /** The run registry — SHARED with the build seam so polling rides GET /api/build?runId and the
   *  single-in-flight guard spans build + adopt (you can't adopt and build at once). */
  registry: BuildRegistry;
  /** Drives one adoption (the worker); wired over the real `adoptStory` in the dev front. */
  runner: BuildRunner;
  /** Whether `storyId` is an adoptable brownfield story (mapped + observe gates), validated against
   *  the SAME discovery the CLI/`storyGoGreen` uses; a reason on refusal (a typed 409, never a 500). */
  isAdoptable(storyId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
}

/**
 * POST /api/adopt — dispatch an adoption intent (202 + runId; fire-and-forget worker, the client polls
 * GET /api/build?runId). Every known outcome is a typed HTTP answer (400 bad body, 409 not adoptable /
 * a run already in flight, 405 wrong method) — never a 500 (the central catch maps HttpError).
 */
export async function handleAdopt(
  req: IncomingMessage,
  res: ServerResponse,
  adopt: AdoptContext,
): Promise<void> {
  const method = req.method ?? 'GET';
  if (method !== 'POST') throw new HttpError(405, `method ${method} not allowed`);
  const input = await readJsonBody<Record<string, unknown>>(req);
  const storyId = asString(input.storyId).trim();
  if (!storyId) throw new HttpError(400, 'storyId is required');
  // Validate against real discovery — a non-brownfield / gateless / typo'd id is a clean 409, never a
  // worker that adopts nothing.
  const adoptable = await adopt.isAdoptable(storyId);
  if (!adoptable.ok) throw new HttpError(409, adoptable.reason);
  const created = adopt.registry.createRun(storyId);
  // The single-run-at-a-time guard surfaces as 409 (a typed refusal, not a thrown 500).
  if (!created.ok) throw new HttpError(409, created.reason);
  const { runId } = created.run;
  // Fire-and-forget (runBuildJob never throws — a failed adoption is a `failed` terminal state); the
  // client polls GET /api/build?runId for progress, the SAME registry run a build uses.
  void runBuildJob(adopt.registry, runId, storyId, adopt.runner);
  sendJson(res, 202, { runId });
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
  /**
   * UI-driven build seam (ADR-0090 Phase 1): the run registry + worker + discovery behind
   * /api/build. Wired by the dev front (the local loop); absent on the hosted server (Phase 1) →
   * /api/build answers 404.
   */
  build?: BuildContext | undefined;
  /**
   * UI-driven ADOPT seam (ADR-0097): the run registry (SHARED with `build`) + worker + discovery
   * behind /api/adopt. Wired by the dev front; absent on the hosted server → /api/adopt answers 404.
   */
  adopt?: AdoptContext | undefined;
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
      const { payload, uatTestsByStory, coverageByStory } = await readTree(ctx.paths.storiesDir);
      // Advisory enrichments (ADR-0033 / ADR-0048): no call ever throws — null
      // (json store / DB down) just means the tree renders without that layer.
      // Run in parallel so a down DB costs one 4s budget, not four. `builds`
      // seeds the in-flight wisp layer so the world paints it on first load
      // (the poll then keeps it fresh) — parity with `sessions`. `verdictEvents`
      // feeds the per-test UAT crown roll-up (ADR-0082); absent on a backend that
      // doesn't implement it (the json store / a partial mock).
      const [verdicts, verdictEvents, sessions, builds] = await Promise.all([
        ctx.backend.latestVerdicts(),
        ctx.backend.verdictEvents?.() ?? Promise.resolve(null),
        ctx.backend.activeSessions(),
        ctx.backend.inFlightBuilds(),
      ]);
      if (verdicts) {
        for (const story of payload.stories) {
          const sv = verdicts[story.id];
          if (sv) story.verdict = sv; // a capability/legacy story's OWN unit verdict, never a roll-up
          for (const cap of story.capabilities) {
            const cv = verdicts[cap.id];
            if (cv) cap.verdict = cv;
          }
        }
      }
      // ADR-0083 Fork A (refining ADR-0082): a story that declares per-test UAT tests greens from the
      // AND of (all capabilities proven healthy) AND (the per-test UAT roll-up) — overriding any
      // own-unit verdict set above. Skipped when the backend has no verdict events (json / down DB)
      // or no story declares per-test tests.
      if (verdictEvents && uatTestsByStory.size > 0) {
        const { rollupStoryGreen } = await loadOrchestrator();
        applyUatCrowns(payload.stories, uatTestsByStory, coverageByStory, verdictEvents, rollupStoryGreen);
      }
      if (sessions && sessions.length > 0) payload.sessions = sessions;
      if (builds && builds.length > 0) payload.builds = builds;
      sendJson(res, 200, payload);
    } else if (url.pathname === '/api/presence') {
      await handlePresence(req, res, ctx.backend);
    } else if (url.pathname === '/api/activity') {
      await handleActivity(req, res, ctx.backend);
    } else if (url.pathname === '/api/build') {
      // UI-driven build (ADR-0090 Phase 1): dispatch an intent / read a run's status. The worker
      // seam is wired by the dev front only; absent (hosted, Phase 1) → 404.
      if (ctx.build === undefined) throw new HttpError(404, 'build is not enabled');
      await handleBuild(req, res, url, ctx.build);
    } else if (url.pathname === '/api/adopt') {
      // UI-driven adopt (ADR-0097): enter the brownfield proving process. Wired by the dev front only;
      // absent (hosted) → 404. The run rides the shared build registry, so progress polls GET /api/build.
      if (ctx.adopt === undefined) throw new HttpError(404, 'adopt is not enabled');
      await handleAdopt(req, res, ctx.adopt);
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
    } else if (url.pathname === '/api/uat/attest') {
      // The studio "I saw it work" in-UI signature (ADR-0082): mints a REAL operator-attested verdict
      // in events.verdict (NOT the events.attestation vouch). Admin-only by the gate's method rule
      // (POST, not /api/comments). The signer is the verified caller; the commit is the one the studio
      // is serving (codeStamp's start HEAD) or a deploy-time STORYTREE_STUDIO_COMMIT — refused if neither.
      const stamp = await ctx.codeStamp();
      const commitSha = process.env['STORYTREE_STUDIO_COMMIT'] ?? stamp?.startedAt ?? null;
      await handleUatAttest(req, res, ctx, ctx.policy?.me.email ?? null, commitSha);
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
