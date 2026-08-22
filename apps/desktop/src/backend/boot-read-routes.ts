// Boot-read-routes factory — composes the studio's BOOT READ routes into an async dispatcher
// that returns true when it handled the path and false otherwise (fall-through for the Electron
// main's chained dispatch). No `electron` and no `dom` import — headlessly provable by node:test.
//
// THE BOUNDARY CALL: does NOT import apps/studio/server. Re-composes the SAME algorithm the
// studio's listDocs() implements over node:fs, exactly as local-backend.ts reproduces the studio's
// HTTP helpers rather than importing them. The `me` route is a constant (the operator is a local
// member with a narrow UAT-attestation permission, not a hosted admin). The `comments` route reads
// through an INJECTED seam.

import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

// ---------- local-only type definitions (do NOT import from apps/studio) ----------

/**
 * The local-member identity. UAT signing is a narrow permission rather than an admin role.
 */
export interface MeInfo {
  email: null;
  role: "admin" | "builder" | "member" | null;
  status: "invited" | "active" | null;
  member: boolean;
  canAttestUat: boolean;
  canWakeDb: boolean;
}

/**
 * A doc metadata entry from the docs/ walk. Mirrors the studio's DocMeta shape —
 * defined locally so this module has no studio import.
 */
export interface DocMeta {
  id: string;
  title: string;
  group: string;
  excerpt: string;
  status?: "proposed" | "accepted" | "superseded";
  decided?: string;
  /**
   * The ADR's frontmatter `load_bearing` tag (ADR-0086) — present ONLY for Decisions docs, and
   * true only when the tag is explicitly `load_bearing: true`. The studio SPA this backend serves
   * reads it through `resolveSelectionDetail` to render the Library selection card's load-bearing
   * badge, so a desktop that omits it silently renders a different card (ADR-0187 dec 3).
   */
  loadBearing?: boolean;
  /**
   * The ADR's outbound decision-lineage edges (`supersedes` / `supersedes_in_part` / `amends`)
   * resolved to `doc:decisions/NNNN-slug.md` pointers — present ONLY for Decisions docs carrying
   * at least one edge that names an ADR on disk (ADR-0187 dec 3).
   */
  references?: string[];
}

/**
 * The filter passed to the injected listComments seam — mirrors PgCommentStore.list's
 * filter shape without importing the library.
 */
export interface CommentsFilter {
  topicId?: string;
  topicKind?: "doc" | "asset";
}

// ---------- LOCAL_ME constant (the open-dev posture; no hosted identity on the desktop) ----------

/**
 * Constant local-member identity. Exported so the Electron main's operator-attested wiring test
 * can assert the /api/me response exactly matches this object.
 *
 * The operator is a full MEMBER on their own machine — NOT an admin. The desktop backend mounts a
 * brokered UAT-signing route but no hosted admin surfaces (/api/users or db-control), so
 * `canAttestUat` reveals only the human-UAT action without making Members/admin UI appear. `member`
 * unlocks read, comment, chat, and build, while the studio's
 * `me.role === 'admin'` gates hide the rest; a direct visit to #/members lands on MembersPanel's
 * honest "Admins only" state rather than a hung "Loading members…".
 */
export const LOCAL_ME: MeInfo = {
  email: null,
  role: "member",
  status: "active",
  member: true,
  canAttestUat: true,
  canWakeDb: false,
};

// ---------- deps interface ----------

/**
 * Dependencies injected into {@link createBootReadRoutes}. The factory is a plain function over
 * this injected port set so the test passes doubles and no live SDK/DB is touched in CI.
 */
export interface BootReadRoutesDeps {
  /** Absolute path to the repo's `docs/` dir — walked for /api/docs. */
  docsDir: string;
  /** Injected comments seam — production wires PgCommentStore.list; CI passes a stub. */
  listComments: (filter: CommentsFilter) => Promise<unknown[]>;
}

// ---------- docs walk (reproduce apiRouter.ts listDocs — do NOT import from studio) ----------

/** Drop a leading YAML frontmatter block so title/excerpt extraction sees prose. */
function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\s*\n/, "");
}

/** Extract the first H1 title from prose markdown (after stripping frontmatter). */
function deriveTitle(markdown: string, filename: string): string {
  const m = markdown.match(/^#\s+(.+?)\s*$/m);
  return m !== null && m[1] !== undefined ? m[1] : filename.replace(/\.md$/, "");
}

/** Map a relId to its display group. */
function deriveGroup(relId: string): "Decisions" | "Reference" {
  return relId.startsWith("decisions/") ? "Decisions" : "Reference";
}

type AdrDocStatus = "proposed" | "accepted" | "superseded";
const ADR_STATUSES = new Set<AdrDocStatus>(["proposed", "accepted", "superseded"]);

/**
 * Parse ADR frontmatter status and optional decided date from a raw markdown string.
 * Returns null when the file is not a recognized ADR (4-digit prefix) or has no valid status.
 * Tolerant — a malformed or missing block yields null, never throws.
 */
function parseDocStatus(
  filename: string,
  raw: string,
): { status: AdrDocStatus; decided?: string } | null {
  if (!/^\d{4}-.*\.md$/.test(filename)) return null;
  if (!raw.startsWith("---\n")) return null;
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return null;
  const block = raw.slice(4, end);
  const statusMatch = block.match(
    /^status:[ \t]*["']?(proposed|accepted|superseded)["']?[ \t]*$/m,
  );
  const status = statusMatch?.[1] as AdrDocStatus | undefined;
  if (status === undefined || !ADR_STATUSES.has(status)) return null;
  const decidedMatch = block.match(/^decided:[ \t]*["']?(\d{4}-\d{2}-\d{2})["']?/m);
  return decidedMatch?.[1] !== undefined
    ? { status, decided: decidedMatch[1] }
    : { status };
}

/** Pull the ADR numbers out of a `field: [n, m, ...]` frontmatter array line; `[]` if absent/empty. */
function extractEdgeNumbers(block: string, field: string): number[] {
  const re = new RegExp(`^${field}:[ \\t]*\\[([^\\]]*)\\]`, "m");
  const list = block.match(re)?.[1];
  if (list === undefined || list === "") return [];
  return list
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/**
 * The studio-wire ADR signals: `loadBearing` reads the frontmatter's `load_bearing: true` tag
 * (a missing tag or an explicit `false` both read as `false`), and `edges` is the deduped UNION of
 * the ADR NUMBERS listed in `supersedes` / `supersedes_in_part` / `amends`. TOLERANT: a non-ADR
 * filename, a missing or unterminated frontmatter block, or absent fields all yield the empty
 * result, and this never throws.
 *
 * Reproduces apps/studio/server/adrWireSignals.ts `parseAdrWireSignals` verbatim — do NOT import
 * from studio (ADR-0176's one-wired-backend rule). The two copies are held equal by
 * `pnpm check:mirror-conformance`, which diffs this backend's `/api/docs` payload against the
 * studio's over the same tree; that gate exists because this exact fold landed studio-side
 * (commit 71f68d2b) and never reached here, dropping `loadBearing` from 88 ADRs and `references`
 * from 168 with nothing anywhere going red.
 */
function parseAdrWireSignals(
  filename: string,
  raw: string,
) {
  const empty = { loadBearing: false, edges: [] };
  if (!/^\d{4}-.*\.md$/.test(filename)) return empty;
  if (!raw.startsWith("---\n")) return empty;
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return empty;
  const block = raw.slice(4, end);

  const loadBearing = block.match(/^load_bearing:[ \t]*["']?(true|false)["']?[ \t]*$/m)?.[1] === "true";

  const edgeSet = new Set<number>();
  for (const field of ["supersedes", "supersedes_in_part", "amends"]) {
    for (const n of extractEdgeNumbers(block, field)) edgeSet.add(n);
  }
  return { loadBearing, edges: [...edgeSet] };
}

/**
 * The first prose sentence after the H1 title — the one-line description shown on docs cards.
 * Reproduces apiRouter.ts deriveExcerpt verbatim. Empty if no sentence found.
 */
function deriveExcerpt(markdown: string): string {
  const body = markdown.replace(/^#\s+.*$/m, ""); // drop the H1 title line
  for (const block of body.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b || b.startsWith("#")) continue; // blank or a heading
    const plain = b.replace(/\s+/g, " ").replace(/[*_`>]/g, "").trim();
    const m = plain.match(/^(.+?[.;])(\s|$)/);
    if (m === null || m[1] === undefined) continue; // not a sentence
    const s = m[1].trim();
    return s.length > 200 ? s.slice(0, 197).trimEnd() + "…" : s;
  }
  return "";
}

/**
 * Recursively walk `docsDir` and return a `DocMeta[]`. Returns `[]` gracefully when the dir
 * does not exist — the studio boots fine with an empty docs list.
 */
export async function listDocs(docsDir: string): Promise<DocMeta[]> {
  const out: DocMeta[] = [];
  // ADR number → its doc id (`decisions/NNNN-slug.md`), built during the walk so the wire-signal
  // fold below can resolve each ADR's lineage-edge NUMBERS to `doc:` pointers (ADR-0187 dec 3).
  const adrNumToId = new Map<number, string>();
  // Per-Decisions-doc outbound edge NUMBERS, stashed during the walk and resolved after it — the
  // number→id map is only complete once every ADR on disk has been walked.
  const edgeNumbersById = new Map<string, number[]>();
  async function walk(dir: string): Promise<void> {
    if (!existsSync(dir)) return;
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        const relId = path
          .relative(docsDir, full)
          .split(path.sep)
          .join("/");
        const raw = await fs.readFile(full, "utf8");
        const content = stripFrontmatter(raw);
        const group = deriveGroup(relId);
        const meta: DocMeta = {
          id: relId,
          title: deriveTitle(content, ent.name),
          group,
          excerpt: deriveExcerpt(content),
        };
        // Only Decisions docs carry frontmatter signals (ADR-0037).
        if (group === "Decisions") {
          const fm = parseDocStatus(ent.name, raw);
          if (fm !== null) {
            meta.status = fm.status;
            if (fm.decided !== undefined) meta.decided = fm.decided;
          }
          // The overview's load-bearing + lineage-edge wire signals (ADR-0187 dec 3).
          // `loadBearing` folds in now; the edge NUMBERS are stashed and resolved to `doc:`
          // pointers after the walk (once every ADR number is known).
          const wire = parseAdrWireSignals(ent.name, raw);
          if (wire.loadBearing) meta.loadBearing = true;
          if (wire.edges.length > 0) edgeNumbersById.set(relId, wire.edges);
          const num = Number.parseInt(ent.name.slice(0, 4), 10);
          if (Number.isFinite(num)) adrNumToId.set(num, relId);
        }
        out.push(meta);
      }
    }
  }
  await walk(docsDir);
  // Resolve each ADR's outbound lineage-edge NUMBERS to `doc:decisions/NNNN-slug.md` pointers now
  // that the full number→id map is known; drop any number that names no ADR on disk (tolerant).
  for (const meta of out) {
    const nums = edgeNumbersById.get(meta.id);
    if (nums === undefined) continue;
    const refs = nums
      .map((n) => adrNumToId.get(n))
      .filter((id): id is string => id !== undefined)
      .map((id) => `doc:${id}`);
    if (refs.length > 0) meta.references = refs;
  }
  // Decisions first (ADR order by filename), then reference docs alphabetically.
  return out.sort((a, b) => {
    if (a.group !== b.group) return a.group === "Decisions" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Resolve a doc `id` (a POSIX relpath under `docsDir`) to an absolute path, or `null` when it escapes
 * `docsDir` or is not a `.md` file. Reproduces the studio's `safeDocPath` (apiRouter.ts) verbatim — the
 * read-only doc-serving guard that refuses path traversal and non-markdown ids. Do NOT import from studio.
 */
function safeDocPath(docsDir: string, id: string): string | null {
  const resolved = path.resolve(docsDir, id);
  const rel = path.relative(docsDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (!resolved.endsWith(".md")) return null;
  return resolved;
}

// ---------- minimal HTTP helper ----------

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

// ---------- factory ----------

/**
 * Create the boot read routes dispatcher.
 *
 * ROUTE TABLE:
 * - GET /api/me           → LOCAL_ME as a bare JSON object
 * - GET /api/docs         → bare DocMeta[] from a real recursive FS walk of `docsDir`
 * - GET /api/docs/content → one doc's `{ id, title, markdown }` (traversal + non-.md guarded)
 * - GET /api/comments     → bare array from the injected `listComments` seam
 * - *   (anything else)   → returns `false` (fall-through to the next dispatcher)
 *
 * Returns an async handler `(req, res, pathname) => Promise<boolean>` that returns `true`
 * when it handled the path and `false` otherwise — so the Electron main can mount it BEFORE
 * the local-backend-boot handler and let unhandled paths fall through.
 */
export function createBootReadRoutes(
  deps: BootReadRoutesDeps,
): (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean> {
  return async (
    _req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<boolean> => {
    if (pathname === "/api/me") {
      sendJson(res, 200, LOCAL_ME);
      return true;
    }

    if (pathname === "/api/docs") {
      const docs = await listDocs(deps.docsDir);
      sendJson(res, 200, docs);
      return true;
    }

    if (pathname === "/api/docs/content") {
      // One doc's markdown body, read ON DEMAND — the endpoint DocView calls (via api.docContent) to
      // render an ADR body in the library tech-tree overlay dive. Reproduces the studio's handleDocs
      // content branch (path-traversal + non-.md guarded), re-composed here so the desktop backend OWNS
      // it rather than letting the request fall through to the local-backend 404 'unknown endpoint'.
      const url = new URL(_req.url ?? "/", "http://localhost");
      const id = url.searchParams.get("id") ?? "";
      const file = safeDocPath(deps.docsDir, id);
      if (file === null || !existsSync(file)) {
        sendJson(res, 404, { error: "doc not found" });
        return true;
      }
      const markdown = stripFrontmatter(await fs.readFile(file, "utf8"));
      sendJson(res, 200, { id, title: deriveTitle(markdown, path.basename(file)), markdown });
      return true;
    }

    if (pathname === "/api/comments") {
      // Parse optional query-string filters from the raw URL on the request.
      const url = new URL(_req.url ?? "/", "http://localhost");
      const topicId = url.searchParams.get("topicId") ?? undefined;
      const topicKindRaw = url.searchParams.get("topicKind");
      const topicKind =
        topicKindRaw === "doc" || topicKindRaw === "asset" ? topicKindRaw : undefined;
      const filter: CommentsFilter = {};
      if (topicId !== undefined) filter.topicId = topicId;
      if (topicKind !== undefined) filter.topicKind = topicKind;
      const comments = await deps.listComments(filter);
      sendJson(res, 200, comments);
      return true;
    }

    // Fall through — the caller's 404 fires.
    return false;
  };
}
