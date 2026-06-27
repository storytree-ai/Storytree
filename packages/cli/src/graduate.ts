/**
 * `storytree library graduate` — the agent-memory → Library graduation worklist (ADR-0095).
 *
 * The node SEAM around the pure engine (`@storytree/library` `graduation/`): the engine classifies,
 * resolves references, and flags duplicates but never touches the filesystem (browser-safe, no clock);
 * this module reads the harness agent-memory files off disk, builds an offline {@link LibrarySnapshot}
 * from the seed corpus, runs the engine, and renders the worklist.
 *
 * READ-ONLY by design (ADR-0095 Decision 3 — prove-the-mechanism / curate-the-judgment): it prints a
 * worklist of CANDIDATES for the librarian-curator to finalise; it does NOT author Library docs. And
 * it surfaces everything it suppresses — duplicates, the deferred `user` tier, unparseable files — so
 * nothing is silently dropped (ADR-0095: no silent caps).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import {
  classifyMemory,
  graduationCandidates,
  novelCandidates,
  type GraduationCandidate,
  type LibrarySnapshot,
  type MemoryFile,
  type SnapshotDoc,
} from "@storytree/library";

import type { Envelope } from "./envelope.js";

// ---- pure: the memory-file frontmatter parser -----------------------------------------------

/**
 * The agent-memory frontmatter shape (the harness store format): `name`, `description`, and a
 * `metadata.type` tier. `.passthrough()` tolerates extra keys a memory may grow, but a missing
 * `name` / `metadata.type` (or an unknown tier) fails loudly — the caller catches it per-file and
 * surfaces it as unparseable rather than silently dropping the memory.
 */
const MemoryFrontmatter = z
  .object({
    name: z.string().min(1),
    description: z.string().default(""),
    metadata: z.object({
      type: z.enum(["user", "feedback", "project", "reference"]),
    }),
  })
  .passthrough();

/**
 * Parse one agent-memory `*.md` file into a {@link MemoryFile}: YAML frontmatter (`name` /
 * `description` / `metadata.type`) plus the markdown body after the closing `---`. Throws (loud) on a
 * missing/unterminated frontmatter block or frontmatter that fails {@link MemoryFrontmatter} — the
 * same fail-loud posture as `@storytree/drive`'s `parseAdrFrontmatter` (the ADR-frontmatter parser
 * carved out of the CLI by ADR-0112).
 */
export function parseMemoryFile(file: string, content: string): MemoryFile {
  if (!content.startsWith("---\n")) {
    throw new Error(`${file}: no frontmatter block (the file must start with '---')`);
  }
  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`${file}: unterminated frontmatter block (no closing '---')`);
  }
  const fm = MemoryFrontmatter.parse(parseYaml(content.slice(4, end + 1)));
  // The body is everything after the closing `---` line (skip the fence line's own newline).
  const afterFence = content.slice(end + 1); // "---...\n<body>"
  const nl = afterFence.indexOf("\n");
  const body = (nl === -1 ? "" : afterFence.slice(nl + 1)).trim();
  return { name: fm.name, description: fm.description, type: fm.metadata.type, body };
}

// ---- pure: the snapshot builder -------------------------------------------------------------

/** The fields {@link buildSnapshot} reads off a raw knowledge.json / assets.json doc. */
interface RawDoc {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly category?: unknown;
  readonly title?: unknown;
}

/**
 * Build a {@link LibrarySnapshot} from raw seed docs: each doc → `{ id, kind-or-category, title }`.
 * Structured units carry `kind`; rendered assets carry `category` — read either (ADR-0023 store shape).
 * A doc with no string `id` is skipped (it can't be referenced or deduped against); a missing title
 * becomes `""`. Pure + deterministic.
 */
export function buildSnapshot(docs: readonly unknown[]): LibrarySnapshot {
  const out: SnapshotDoc[] = [];
  for (const raw of docs) {
    if (typeof raw !== "object" || raw === null) continue;
    const d = raw as RawDoc;
    if (typeof d.id !== "string" || d.id === "") continue;
    const kind =
      typeof d.kind === "string" ? d.kind : typeof d.category === "string" ? d.category : "";
    const title = typeof d.title === "string" ? d.title : "";
    out.push({ id: d.id, kind, title });
  }
  return { docs: out };
}

// ---- pure: the default harness-store memory dir ---------------------------------------------

/**
 * The Claude Code project-store slug: the absolute working-directory path with every NON-alphanumeric
 * character replaced by `-` (so `C:\code\storytree` → `C--code-storytree`, the `:\` becoming `--`).
 * This is how the harness keys `~/.claude/projects/<slug>/`.
 */
export function projectSlug(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9]/g, "-");
}

/** The default harness agent-memory dir for a project: `<home>/.claude/projects/<slug>/memory`. */
export function harnessMemoryDir(homeDir: string, projectPath: string): string {
  return path.join(homeDir, ".claude", "projects", projectSlug(projectPath), "memory");
}

// ---- node: read the memory dir + the snapshot -----------------------------------------------

/** A memory file that could not be parsed — surfaced, never silently dropped (ADR-0095). */
export interface Unparseable {
  readonly file: string;
  readonly reason: string;
}

export interface MemoryReadResult {
  readonly memories: MemoryFile[];
  /** every `*.md` considered (MEMORY.md excluded) — so the tally can show what was seen vs parsed */
  readonly fileCount: number;
  readonly unparseable: Unparseable[];
}

/**
 * Read every `*.md` in `dir` EXCEPT the `MEMORY.md` index, parsing each into a {@link MemoryFile}. A
 * file that fails to parse is collected into `unparseable` (surfaced) rather than aborting the read.
 * Throws only when the dir itself can't be read (missing / not a dir) — the caller turns that into a
 * "point me at the store" envelope.
 */
export function readMemoryDir(dir: string): MemoryReadResult {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e) {
    throw new Error(`could not read memory dir ${dir}: ${(e as Error).message}`);
  }
  const files = entries
    .filter((f) => f.toLowerCase().endsWith(".md") && f !== "MEMORY.md")
    .sort();
  const memories: MemoryFile[] = [];
  const unparseable: Unparseable[] = [];
  for (const f of files) {
    try {
      memories.push(parseMemoryFile(f, readFileSync(path.join(dir, f), "utf8")));
    } catch (e) {
      unparseable.push({ file: f, reason: (e as Error).message });
    }
  }
  return { memories, fileCount: files.length, unparseable };
}

/** Read + JSON-parse the seed corpus and build the offline {@link LibrarySnapshot}. Throws on a bad file. */
export function readSnapshot(snapshotPath: string): LibrarySnapshot {
  const parsed = JSON.parse(readFileSync(snapshotPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${snapshotPath}: expected a JSON array of docs`);
  }
  return buildSnapshot(parsed);
}

// ---- the command ----------------------------------------------------------------------------

export interface GraduateDeps {
  /** The resolved memory dir to read (the dispatcher computes the default; tests inject a temp dir). */
  readonly memoryDir: string;
  /** The seed corpus the offline snapshot is built from (apps/studio/data/knowledge.json). */
  readonly snapshotPath: string;
  /** The ISO date stamped into each candidate's provenance — injected so the command is deterministic. */
  readonly now: string;
}

/** `refs` summary for one candidate: the resolved `asset:` ids, or an em dash when none resolved. */
function refsLabel(c: GraduationCandidate): string {
  return c.references.length > 0 ? c.references.join(", ") : "—";
}

/** Indent a (possibly multi-line) block under a label, for the --review body dump. */
function indentBlock(text: string, pad = "      "): string {
  return text
    .split("\n")
    .map((l) => `${pad}${l}`)
    .join("\n");
}

interface Worklist {
  readonly novel: GraduationCandidate[];
  readonly duplicates: GraduationCandidate[];
  readonly userTier: MemoryFile[];
  readonly unparseable: Unparseable[];
  readonly titleOf: (id: string) => string;
}

function header(deps: GraduateDeps, read: MemoryReadResult, snapshot: LibrarySnapshot): string[] {
  return [
    "Agent-memory → Library graduation worklist (ADR-0095)",
    "",
    `memory:   ${deps.memoryDir}  (${read.fileCount} file${read.fileCount === 1 ? "" : "s"}, ${read.memories.length} parsed)`,
    `snapshot: ${deps.snapshotPath}  (${snapshot.docs.length} Library docs)`,
    `stamp:    ${deps.now}`,
  ];
}

/** The always-visible tally so a zero-count section is honest, not silently absent (ADR-0095). */
function tally(w: Worklist): string {
  return [
    `tally: ${w.novel.length} novel`,
    `${w.duplicates.length} duplicate${w.duplicates.length === 1 ? "" : "s"} suppressed`,
    `${w.userTier.length} user-tier deferred`,
    `${w.unparseable.length} unparseable.`,
  ].join(", ");
}

function suppressedSections(w: Worklist): string[] {
  const lines: string[] = [];
  if (w.duplicates.length > 0) {
    lines.push(
      "",
      `SUPPRESSED as duplicates (${w.duplicates.length}) — already covered, surfaced not dropped:`,
    );
    for (const c of w.duplicates) {
      const id = c.duplicateOf ?? "";
      lines.push(`  ${c.source}  → covered by ${id}  "${w.titleOf(id)}"`);
    }
  }
  if (w.userTier.length > 0) {
    lines.push(
      "",
      `DEFERRED user-tier (${w.userTier.length}) — the per-user tier never graduates (ADR-0095 Open call 1):`,
    );
    for (const m of w.userTier) lines.push(`  ${m.name}`);
  }
  if (w.unparseable.length > 0) {
    lines.push("", `UNPARSEABLE (${w.unparseable.length}) — surfaced, not silently dropped:`);
    for (const u of w.unparseable) lines.push(`  ${u.file}: ${u.reason}`);
  }
  return lines;
}

function formatSummary(deps: GraduateDeps, read: MemoryReadResult, snapshot: LibrarySnapshot, w: Worklist): string {
  const lines = [...header(deps, read, snapshot), "", tally(w), ""];
  lines.push(
    `NOVEL candidates (${w.novel.length}) — the librarian-curator's worklist (this command does NOT write):`,
  );
  if (w.novel.length === 0) lines.push("  (none)");
  else for (const c of w.novel) lines.push(`  ${c.source}  → ${c.target}   refs: ${refsLabel(c)}`);
  lines.push(...suppressedSections(w));
  return lines.join("\n");
}

function formatReview(deps: GraduateDeps, read: MemoryReadResult, snapshot: LibrarySnapshot, w: Worklist): string {
  const lines = [...header(deps, read, snapshot), "", tally(w), ""];
  lines.push(`NOVEL candidates (${w.novel.length}) — the librarian-curator authors the final fields from these:`);
  if (w.novel.length === 0) lines.push("  (none)");
  w.novel.forEach((c, i) => {
    lines.push(
      "",
      `[${i + 1}] ${c.source}`,
      `    target:     ${c.target}`,
      `    rationale:  ${c.rationale}`,
      `    provenance: ${c.provenance}`,
      `    references: ${refsLabel(c)}`,
      "    body:",
      indentBlock(c.body),
    );
  });
  lines.push(...suppressedSections(w));
  return lines.join("\n");
}

/**
 * `storytree library graduate [--review]` — read the harness agent-memory, run the pure graduation
 * engine against the offline seed snapshot, and print the worklist. Never writes (the librarian-curator
 * finalises candidates in a separate unit). Returns `ok: false` only when the memory dir or the seed
 * snapshot can't be read — both with `next` guidance.
 */
export function graduateCommand(opts: { review: boolean }, deps: GraduateDeps): Envelope {
  let read: MemoryReadResult;
  try {
    read = readMemoryDir(deps.memoryDir);
  } catch (e) {
    return {
      ok: false,
      body: `${(e as Error).message}\n\nNo agent-memory to graduate. Point --memory-dir at the harness store (~/.claude/projects/<project>/memory).`,
      next: ["storytree library graduate --memory-dir <path>", "storytree library"],
    };
  }

  let snapshot: LibrarySnapshot;
  try {
    snapshot = readSnapshot(deps.snapshotPath);
  } catch (e) {
    return {
      ok: false,
      body: `Could not load the Library seed snapshot (${deps.snapshotPath}): ${(e as Error).message}`,
      next: ["npx tsx apps/studio/data/build-corpus.mjs   (rebuild the seed corpus)"],
    };
  }

  const candidates = graduationCandidates(read.memories, snapshot, { now: deps.now });
  const titleById = new Map(snapshot.docs.map((d) => [d.id, d.title] as const));
  const w: Worklist = {
    novel: novelCandidates(candidates),
    duplicates: candidates.filter((c) => c.duplicateOf !== undefined),
    // The engine drops the `user` tier silently (it never graduates) — recover it from the parsed
    // memories so the worklist can SURFACE the deferral rather than hide it (ADR-0095: no silent caps).
    userTier: read.memories.filter((m) => classifyMemory(m.type) === null),
    unparseable: read.unparseable,
    titleOf: (id) => titleById.get(id) ?? "(missing target)",
  };

  const body = opts.review
    ? formatReview(deps, read, snapshot, w)
    : formatSummary(deps, read, snapshot, w);

  return {
    ok: true,
    body,
    next: [
      opts.review
        ? "storytree library graduate   (summary view)"
        : "storytree library graduate --review   (full per-candidate detail)",
      "storytree library artifact list principle   (where feedback memory graduates)",
      "storytree library artifact list process     (where project memory graduates)",
    ],
  };
}
