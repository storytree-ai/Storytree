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
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import {
  classifyMemory,
  classifyWorklist,
  emptyParkLedger,
  graduationCandidates,
  leaseExpiresOn,
  makeParkRecord,
  novelCandidates,
  parseParkLedger,
  type GraduationCandidate,
  type LibrarySnapshot,
  type MemoryFile,
  type ParkLedger,
  type ParkWorklist,
  type ParkWorklistCounts,
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

/** The fields {@link buildSnapshot} reads off a raw knowledge.json seed doc. */
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

/** This package's repo root, resolved from this file's location (packages/cli/src -> three up). */
export function cliRepoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

/**
 * The MAIN checkout's directory: the harness keys its agent-memory store by the PRIMARY working
 * directory, never a worktree, so `git worktree list --porcelain` (whose first entry is always the
 * main worktree) resolves it from inside a `.claude/worktrees/<name>` checkout. Falls back to `dir`
 * when git can't answer — the resulting default dir is always overridable with `--memory-dir`.
 */
export function mainCheckoutDir(dir: string): string {
  try {
    const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split("\n")) {
      if (line.startsWith("worktree ")) return path.resolve(line.slice("worktree ".length).trim());
    }
  } catch {
    // git missing / not a repo — fall back to the given dir.
  }
  return dir;
}

/**
 * The default harness agent-memory dir for the graduation worklist — keyed to the MAIN checkout
 * (works from inside a worktree). The single resolver shared by the `library graduate` CLI dispatch
 * and the `check:graduation-worklist` gate nudge, so the two never drift on where memory lives.
 */
export function defaultMemoryDir(homeDir: string): string {
  return harnessMemoryDir(homeDir, mainCheckoutDir(cliRepoRoot()));
}

/** The seed corpus the offline worklist snapshot is built from (apps/studio/data/knowledge.json). */
export function defaultSnapshotPath(): string {
  return path.join(cliRepoRoot(), "apps", "studio", "data", "knowledge.json");
}

// ---- ADR-0202: the park-ledger node seam ------------------------------------------------------

/**
 * The park ledger's default location: `graduation-park.json` BESIDE the memory dir (the project
 * store dir, `~/.claude/projects/<slug>/graduation-park.json`). Machine-local state alongside the
 * agent memory it describes (ADR-0202 — agent memory is per-machine, so its review ledger is too);
 * derived from the memory dir so a `--memory-dir` override carries the ledger with it.
 */
export function defaultLedgerPath(memoryDir: string): string {
  return path.join(path.dirname(memoryDir), "graduation-park.json");
}

export interface LedgerReadResult {
  readonly ledger: ParkLedger;
  /** why an existing ledger file was ignored (surfaced, never silently dropped — ADR-0095) */
  readonly problem?: string;
}

/**
 * Read the park ledger. A MISSING file is the normal pre-backfill state (empty ledger — every
 * candidate classifies `new`); an EXISTING-but-invalid file is surfaced as `problem` and treated as
 * empty for READ paths (the check stays advisory), while {@link parkCommand} fails closed on it
 * (a write must never silently clobber recorded verdicts).
 */
export function readParkLedger(ledgerPath: string): LedgerReadResult {
  let raw: string;
  try {
    raw = readFileSync(ledgerPath, "utf8");
  } catch {
    return { ledger: emptyParkLedger() };
  }
  try {
    return { ledger: parseParkLedger(JSON.parse(raw)) };
  } catch (e) {
    return { ledger: emptyParkLedger(), problem: `${ledgerPath}: ${(e as Error).message}` };
  }
}

/** Write the park ledger (pretty-printed — the owner may read/diff it by hand). */
export function writeParkLedger(ledgerPath: string, ledger: ParkLedger): void {
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
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
  /** The park ledger beside the memory dir (ADR-0202) — see {@link defaultLedgerPath}. */
  readonly ledgerPath: string;
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

/** A live (non-parked) candidate with its park classification (`new` / `changed` / `expired`). */
interface LiveCandidate {
  readonly candidate: GraduationCandidate;
  readonly status: "new" | "changed" | "expired";
}

/** A parked candidate with the recorded verdict that silences it (ADR-0202). */
interface ParkedCandidate {
  readonly candidate: GraduationCandidate;
  readonly reason: string;
  readonly expiresOn: string;
}

interface Worklist {
  /** the engine-novel candidates that are LIVE under the park ledger (ADR-0202 D4) */
  readonly live: LiveCandidate[];
  /** the engine-novel candidates silenced by a held park lease */
  readonly parked: ParkedCandidate[];
  readonly counts: ParkWorklistCounts;
  readonly duplicates: GraduationCandidate[];
  readonly userTier: MemoryFile[];
  readonly unparseable: Unparseable[];
  /** an existing-but-invalid ledger file, surfaced (treated as empty on this read path) */
  readonly ledgerProblem?: string;
  readonly titleOf: (id: string) => string;
}

/**
 * Fold the park ledger over the engine-novel candidates (ADR-0202): classify each candidate's
 * source memory against its (possibly absent) park record, split live from parked, and carry the
 * parked verdict's reason + lease expiry for the suppressed section.
 */
function foldParkLedger(
  novel: readonly GraduationCandidate[],
  memories: readonly MemoryFile[],
  ledger: ParkLedger,
  now: string,
): { live: LiveCandidate[]; parked: ParkedCandidate[]; counts: ParkWorklistCounts } {
  const byName = new Map(memories.map((m) => [m.name, m] as const));
  const novelMemories = novel
    .map((c) => byName.get(c.source))
    .filter((m): m is MemoryFile => m !== undefined);
  const w: ParkWorklist = classifyWorklist(novelMemories, ledger, { now });
  const statusOf = new Map(w.entries.map((e) => [e.memory.name, e.status] as const));
  const live: LiveCandidate[] = [];
  const parked: ParkedCandidate[] = [];
  for (const candidate of novel) {
    const status = statusOf.get(candidate.source) ?? "new";
    if (status === "parked") {
      const record = ledger.parks[candidate.source];
      parked.push({
        candidate,
        reason: record?.reason ?? "",
        expiresOn: record === undefined ? "" : leaseExpiresOn(record),
      });
    } else {
      live.push({ candidate, status });
    }
  }
  return { live, parked, counts: w.counts };
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
    `tally: ${w.live.length} live (${w.counts.new} new, ${w.counts.changed} changed, ${w.counts.expired} lease-expired)`,
    `${w.parked.length} parked`,
    `${w.duplicates.length} duplicate${w.duplicates.length === 1 ? "" : "s"} suppressed`,
    `${w.userTier.length} user-tier deferred`,
    `${w.unparseable.length} unparseable.`,
  ].join(", ");
}

/** The `[new]` / `[changed]` / `[lease-expired]` label a live candidate carries in the worklist. */
function liveLabel(status: LiveCandidate["status"]): string {
  return status === "expired" ? "[lease-expired]" : `[${status}]`;
}

function suppressedSections(w: Worklist): string[] {
  const lines: string[] = [];
  if (w.parked.length > 0) {
    lines.push(
      "",
      `PARKED (${w.parked.length}) — reviewed wont-graduate, silenced while the lease holds (ADR-0202; an edit or lease expiry re-enters them):`,
    );
    for (const p of w.parked) {
      lines.push(`  ${p.candidate.source}  — ${p.reason}  (lease expires ${p.expiresOn})`);
    }
  }
  if (w.ledgerProblem !== undefined) {
    lines.push(
      "",
      `PARK LEDGER unreadable — treated as EMPTY on this read (every novel candidate shows live): ${w.ledgerProblem}`,
    );
  }
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
    `LIVE candidates (${w.live.length}) — new / changed / lease-expired (ADR-0202); the librarian-curator's worklist (this command does NOT write):`,
  );
  if (w.live.length === 0) lines.push("  (none)");
  else
    for (const { candidate: c, status } of w.live)
      lines.push(`  ${c.source}  → ${c.target}   refs: ${refsLabel(c)}   ${liveLabel(status)}`);
  lines.push(...suppressedSections(w));
  return lines.join("\n");
}

function formatReview(deps: GraduateDeps, read: MemoryReadResult, snapshot: LibrarySnapshot, w: Worklist): string {
  const lines = [...header(deps, read, snapshot), "", tally(w), ""];
  lines.push(
    `LIVE candidates (${w.live.length}) — the librarian-curator authors the final fields from these (or parks: \`storytree library graduate park <name> --reason "…"\`):`,
  );
  if (w.live.length === 0) lines.push("  (none)");
  w.live.forEach(({ candidate: c, status }, i) => {
    lines.push(
      "",
      `[${i + 1}] ${c.source}   ${liveLabel(status)}`,
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
      next: ["ensure the Library seed exists and is valid JSON: apps/studio/data/knowledge.json"],
    };
  }

  const candidates = graduationCandidates(read.memories, snapshot, { now: deps.now });
  const titleById = new Map(snapshot.docs.map((d) => [d.id, d.title] as const));
  const { ledger, problem } = readParkLedger(deps.ledgerPath);
  const fold = foldParkLedger(novelCandidates(candidates), read.memories, ledger, deps.now);
  const w: Worklist = {
    live: fold.live,
    parked: fold.parked,
    counts: fold.counts,
    duplicates: candidates.filter((c) => c.duplicateOf !== undefined),
    // The engine drops the `user` tier silently (it never graduates) — recover it from the parsed
    // memories so the worklist can SURFACE the deferral rather than hide it (ADR-0095: no silent caps).
    userTier: read.memories.filter((m) => classifyMemory(m.type) === null),
    unparseable: read.unparseable,
    ...(problem !== undefined ? { ledgerProblem: problem } : {}),
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

// ---- the pre-merge nudge (the `check:graduation-worklist` gate surface) ----------------------

/** The gate-line tag, kept here so the pure nudge and the check script agree on it. */
export const GRADUATION_NUDGE_TAG = "[check:graduation-worklist]";

export type NudgeLevel = "OK" | "WARN";

export interface GraduationNudge {
  readonly level: NudgeLevel;
  readonly lines: string[];
}

/**
 * The pre-merge graduation NUDGE (ADR-0095 Decision 7, park-lease-filtered per ADR-0202 D4): given
 * the park classification of the NOVEL agent-memory candidates, decide whether a librarian
 * graduation pass is due before the merge ceremony. Pure + deterministic — the
 * {@link import("./check-graduation-worklist.js")} gate script does the I/O and prints these lines.
 *
 * This is the missing PROMPT, not a graduation decision: it surfaces that LIVE candidates EXIST so
 * the orchestrator runs the pass; the genuine-durability judgment (and the park verdict) stays the
 * librarian-curator's. Advisory-only — never an error level, exit 0 always. Only `new` + `changed`
 * + `expired` count (ADR-0202: the WARN is normally zero and meaningful when it isn't); `parked`
 * candidates are silenced while their lease holds, and their count rides the OK line so the
 * suppression is visible, never silent (ADR-0095: no silent caps).
 */
export function graduationNudge(counts: ParkWorklistCounts): GraduationNudge {
  const live = Math.max(0, counts.new) + Math.max(0, counts.changed) + Math.max(0, counts.expired);
  const parked = Math.max(0, counts.parked);
  if (live <= 0) {
    const parkedNote = parked > 0 ? ` (${parked} parked under lease, ADR-0202)` : "";
    return {
      level: "OK",
      lines: [
        `${GRADUATION_NUDGE_TAG} OK — no live agent-memory candidates await graduation${parkedNote}.`,
      ],
    };
  }
  const breakdown = [
    counts.new > 0 ? `${counts.new} new` : undefined,
    counts.changed > 0 ? `${counts.changed} changed since review` : undefined,
    counts.expired > 0 ? `${counts.expired} lease-expired` : undefined,
  ]
    .filter((p): p is string => p !== undefined)
    .join(", ");
  const lines = [
    `${GRADUATION_NUDGE_TAG} WARN — ${live} live agent-memory candidate(s) await a librarian pass before merge (ADR-0095 D7 / ADR-0202): ${breakdown}.`,
    `${GRADUATION_NUDGE_TAG}   Review with \`pnpm storytree library graduate --review\`, then spawn the librarian-curator: graduate the genuinely durable, PARK the keepers with a reason (\`storytree library graduate park <name> --reason "…"\`).`,
  ];
  if (counts.expired > 0) {
    lines.push(
      `${GRADUATION_NUDGE_TAG}   Lease-expired items invert the question — "is this still alive?": re-park / delete / graduate-then-delete (ADR-0202 D3).`,
    );
  }
  return { level: "WARN", lines };
}

// ---- `storytree library graduate park` (ADR-0202 — the librarian's park verdict write) ---------

/** One park verdict: the memory's `name`, the recorded reason, an optional lease override (days). */
export const ParkItemSchema = z.object({
  name: z.string().min(1),
  reason: z.string().min(1),
  leaseDays: z.number().int().positive().optional(),
});
export type ParkItem = z.infer<typeof ParkItemSchema>;

/** Parse a `--file` batch: a JSON array of {@link ParkItem}s. Throws (loud) on any shape violation. */
export function parseParkFile(content: string): ParkItem[] {
  return z.array(ParkItemSchema).min(1).parse(JSON.parse(content));
}

export interface ParkDeps {
  readonly memoryDir: string;
  readonly ledgerPath: string;
  /** ISO `yyyy-mm-dd` — stamped as each record's `reviewedAt`. */
  readonly now: string;
}

/**
 * `storytree library graduate park` — record a librarian park verdict (ADR-0202): per memory, the
 * `wont-graduate` verdict + reason + the CURRENT content hash + review date + lease (default
 * 60 days, `DEFAULT_LEASE_DAYS`). All-or-nothing: every item is validated against the parsed
 * memory store before ANY write (an unknown or unparseable memory refuses the whole batch), and an
 * existing-but-invalid ledger fails CLOSED (recorded verdicts are never silently clobbered).
 * Re-parking an already-parked memory refreshes its record (hash + date + lease) — that IS the
 * re-park outcome of the expiry re-review. Ledger entries whose memory no longer exists on disk are
 * pruned on write, surfaced by name (the memory died; its park record follows it).
 */
export function parkCommand(items: readonly ParkItem[], deps: ParkDeps): Envelope {
  let read: MemoryReadResult;
  try {
    read = readMemoryDir(deps.memoryDir);
  } catch (e) {
    return {
      ok: false,
      body: `${(e as Error).message}\n\nNothing to park. Point --memory-dir at the harness store (~/.claude/projects/<project>/memory).`,
      next: ["storytree library graduate --memory-dir <path>", "storytree library graduate"],
    };
  }

  const byName = new Map(read.memories.map((m) => [m.name, m] as const));
  const problems: string[] = [];
  for (const item of items) {
    if (!byName.has(item.name)) {
      const unparsed = read.unparseable.find((u) => u.file === `${item.name}.md`);
      problems.push(
        unparsed !== undefined
          ? `${item.name}: its memory file exists but does not parse (${unparsed.reason}) — fix the file first; a park record hashes the parsed content`
          : `${item.name}: no such memory in ${deps.memoryDir}`,
      );
    }
  }
  if (problems.length > 0) {
    return {
      ok: false,
      body: [
        `park refused — ${problems.length} of ${items.length} item(s) failed validation (all-or-nothing, nothing written):`,
        ...problems.map((p) => `  ${p}`),
      ].join("\n"),
      next: ["storytree library graduate   (the current worklist)"],
    };
  }

  const { ledger, problem } = readParkLedger(deps.ledgerPath);
  if (problem !== undefined) {
    return {
      ok: false,
      body: [
        "park refused — the existing ledger file does not parse, and overwriting it would silently drop recorded verdicts:",
        `  ${problem}`,
        "Fix or delete the ledger file, then re-run.",
      ].join("\n"),
      next: ["storytree library graduate"],
    };
  }

  const parks = { ...ledger.parks };
  const lines: string[] = [];
  for (const item of items) {
    const memory = byName.get(item.name);
    if (memory === undefined) continue; // unreachable — validated above
    const record = makeParkRecord(memory, {
      reason: item.reason,
      now: deps.now,
      ...(item.leaseDays !== undefined ? { leaseDays: item.leaseDays } : {}),
    });
    const refreshed = parks[item.name] !== undefined;
    parks[item.name] = record;
    lines.push(
      `  ${item.name}  parked${refreshed ? " (refreshed)" : ""} — lease expires ${leaseExpiresOn(record)} (${record.leaseDays}d, hash ${record.contentHash})`,
    );
  }

  // Prune orphans: a park record whose memory no longer exists on disk (neither parsed nor sitting
  // unparseable) — the memory died, its record follows. Surfaced by name, never silent.
  const unparseableNames = new Set(read.unparseable.map((u) => u.file.replace(/\.md$/i, "")));
  const pruned: string[] = [];
  for (const name of Object.keys(parks)) {
    if (!byName.has(name) && !unparseableNames.has(name)) {
      delete parks[name];
      pruned.push(name);
    }
  }

  writeParkLedger(deps.ledgerPath, { version: 1, parks });

  const body = [
    `parked ${items.length} memor${items.length === 1 ? "y" : "ies"} (ADR-0202) → ${deps.ledgerPath}`,
    ...lines,
    ...(pruned.length > 0
      ? ["", `pruned ${pruned.length} orphaned record(s) (memory deleted): ${pruned.join(", ")}`]
      : []),
  ].join("\n");
  return {
    ok: true,
    body,
    next: [
      "storytree library graduate   (the worklist — parked items now silenced)",
      "pnpm check:graduation-worklist   (the gate nudge)",
    ],
  };
}
