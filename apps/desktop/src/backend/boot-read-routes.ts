// Boot-read-routes factory — composes the studio's BOOT READ routes into an async dispatcher
// that returns true when it handled the path and false otherwise (fall-through for the Electron
// main's chained dispatch). No `electron` and no `dom` import — headlessly provable by node:test.
//
// THE BOUNDARY CALL: does NOT import apps/studio/server. Re-composes the SAME algorithm the
// studio's listDocs() implements over node:fs, exactly as local-backend.ts reproduces the studio's
// HTTP helpers rather than importing them. The `me` route is a constant (the operator IS
// member+admin on their own machine). The `comments` route reads through an INJECTED seam.

import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

// ---------- local-only type definitions (do NOT import from apps/studio) ----------

/**
 * The local-member identity. The operator IS member+admin on their own machine —
 * the open-dev posture the studio's DEV_ME already uses.
 */
export interface MeInfo {
  email: null;
  role: "admin" | "builder" | "member" | null;
  status: "invited" | "active" | null;
  member: boolean;
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
 */
export const LOCAL_ME: MeInfo = {
  email: null,
  role: "admin",
  status: "active",
  member: true,
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
async function listDocs(docsDir: string): Promise<DocMeta[]> {
  const out: DocMeta[] = [];
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
        // Only Decisions docs carry a frontmatter status (ADR-0037).
        const fm = group === "Decisions" ? parseDocStatus(ent.name, raw) : null;
        if (fm !== null) {
          meta.status = fm.status;
          if (fm.decided !== undefined) meta.decided = fm.decided;
        }
        out.push(meta);
      }
    }
  }
  await walk(docsDir);
  // Decisions first (ADR order by filename), then reference docs alphabetically.
  return out.sort((a, b) => {
    if (a.group !== b.group) return a.group === "Decisions" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
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
 * - GET /api/me       → LOCAL_ME as a bare JSON object
 * - GET /api/docs     → bare DocMeta[] from a real recursive FS walk of `docsDir`
 * - GET /api/comments → bare array from the injected `listComments` seam
 * - *   (anything else) → returns `false` (fall-through to the next dispatcher)
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
