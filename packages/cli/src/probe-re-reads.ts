/**
 * `pnpm probe:re-reads` — measure what re-reading a Library document actually costs, and whether it
 * looks like drift-resistance or like ordinary working traffic (`linked-session-context-arc-inc-27`).
 *
 * **A REPORT, NOT A GATE RUNG, and deliberately so.** Like its sibling `probe:decision-reads` it is
 * named `probe:` because it reads THIS MACHINE's `~/.claude/projects` transcripts: every figure is a
 * property of one laptop's history, so no repo invariant could be held to it and wiring it into
 * `pnpm gate` would turn "this box has a short history" into a red.
 *
 * ## WHY IT READS TRANSCRIPTS RATHER THAN THE TRAVERSAL TRACE
 *
 * The traversal trace cannot answer this question, for two independent reasons, and both inflate the
 * answer in the same direction:
 *
 * 1. **Its `sessionId` is the WORKTREE SLOT, and slots are pooled and reused.** Every context window
 *    that ever ran in a slot — the parent session, each of its subagents, and every later session the
 *    pool hands the same slot to — shares one id. Pooling turns N windows each reading a document
 *    once into one "session" that read it N times.
 * 2. **The observer only records the bare three-token form.** `observeCliInvocation` returns nothing
 *    when `argv.length !== 3`, so every `--pg`, `--raw` and `--out` read is invisible to it.
 *
 * A host transcript, by contrast, IS one context window by construction, and it records the command
 * and its result together — so a read can be counted where it landed and priced by what it actually
 * returned. This probe reports both views and prints the gap between them, because that gap is the
 * measurement's largest single correction.
 *
 * ## READ THE OUTPUT AS A FLOOR
 *
 * It counts `storytree library artifact <id>` invocations found in Bash tool inputs. Reads performed
 * any other way — the studio, the desktop chat mount, a script that calls the store directly — are
 * not visible here and are not counted. Cost is measured from the joined `tool_result`, so it is what
 * entered the window, not what the document weighs on disk.
 *
 * Usage: `pnpm probe:re-reads [--json]`. Exit 0 on a completed sweep, 1 when the transcript root
 * could not be walked at all.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";

const TAG = "probe:re-reads";
const CHARS_PER_TOKEN = 4;

/**
 * Sub-verbs of `library artifact`. They occupy the same argv position as an id, so a scraper that
 * does not exclude them counts `library artifact edit <id>` as a read of a document called "edit".
 */
const SUB_VERBS = new Set(["list", "edit", "new", "retire", "history", "show", "graduate"]);

/** `storytree library artifact <id> [args…]`, however the invocation was prefixed. */
const INVOCATION =
  /(?:^|[|;&(]|\s)(?:pnpm\s+|npx\s+tsx\s+\S+\s+|node\s+\S+\s+)?storytree\s+library\s+artifact\s+([^\s|;&>]+)([^|;&\n]*)/g;

/**
 * Documents an agent must keep OBEYING while it works, as opposed to the subject matter of one task.
 * The split exists to test the drift-resistance hypothesis: if re-reading holds instructions steady,
 * these are the documents where long-gap refreshes should show up.
 */
const OPERATING_DOCS = new Set([
  "arc",
  "corpus-investigator",
  "explorer",
  "friction-adjudication",
  "friction-justification-bar",
  "frontend-builder",
  "glue-worker",
  "graduation-synthesist",
  "librarian-curator",
  "library-edit-ceremony",
  "merge-ceremony",
  "orchestrate-route-supplement",
  "parallel-build-lane-fan-out",
  "plan",
  "planner",
  "prove-and-promote-ceremony",
  "session-cutting",
  "session-orchestrator",
  "story-author",
  "template-friction",
]);

/** Ids that name one task's subject matter rather than a standing instruction. */
const WORK_DOC = /(-arc$|-arc-inc-|^oq-|^adr-|-inc-\d|^doc:decisions\/|^uat-)/;

/** What a single invocation put into the model's context. Only `body` renders a whole document. */
type ReadKind = "body" | "field" | "to-file" | "write";

interface Read {
  readonly id: string;
  readonly at: string | null;
  readonly kind: ReadKind;
  /** Characters the tool_result carried back — what actually entered the window. */
  resultChars: number | null;
}

interface Window {
  readonly file: string;
  /**
   * The window's unique key. A session id can appear under two project directories (a subagent run
   * from a different cwd gets its own), so the basename is NOT unique — keying on it would pool
   * separate windows and manufacture the very repeats this probe exists to disentangle.
   */
  readonly key: string;
  /** The worktree slot the window ran in — the identity the traversal trace uses as its session. */
  readonly slot: string;
  /** True when this window is a spawned subagent rather than the session's own conversation. */
  readonly subagent: boolean;
  readonly reads: Read[];
}

function classify(args: string): ReadKind {
  if (/--set\b/.test(args)) return "write";
  if (/--out\b/.test(args)) return "to-file";
  const raw = /--raw[= ]([A-Za-z_]+)/.exec(args);
  if (raw !== null) return raw[1] === "body" ? "body" : "field";
  return "body";
}

function bucketOf(id: string): "operating" | "work" | "other" {
  if (OPERATING_DOCS.has(id)) return "operating";
  return WORK_DOC.test(id) ? "work" : "other";
}

function transcriptFiles(root: string): { file: string; subagent: boolean }[] {
  const out: { file: string; subagent: boolean }[] = [];
  const walk = (dir: string, subagent: boolean): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, subagent || entry.name === "subagents");
        continue;
      }
      if (entry.name.endsWith(".jsonl")) out.push({ file: full, subagent });
    }
  };
  for (const project of fs.readdirSync(root)) {
    if (!project.includes("storytree")) continue;
    const dir = path.join(root, project);
    if (!fs.statSync(dir).isDirectory()) continue;
    walk(dir, false);
  }
  return out;
}

function slotOf(root: string, file: string): string {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const project = rel.split("/")[0] ?? "";
  return project
    .replace("C--code-storytree--claude-worktrees-", "")
    .replace("C--code-storytree", "(primary checkout)");
}

function resultChars(block: { content?: unknown }): number | null {
  const content = block.content;
  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) {
    return content.reduce<number>(
      (n, part) => n + (typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text.length : 0),
      0,
    );
  }
  return null;
}

async function scanWindow(root: string, file: string, subagent: boolean): Promise<Window | null> {
  const reads: Read[] = [];
  /** tool_use id -> the reads on that command, awaiting the result that prices them. */
  const awaitingResult = new Map<string, Read[]>();
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.includes("library artifact") && !line.includes("tool_result")) continue;
    let record: {
      timestamp?: string;
      message?: { content?: unknown };
    };
    try {
      record = JSON.parse(line) as typeof record;
    } catch {
      continue; // a truncated tail line is a line we cannot price, not a reason to abandon the file
    }
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      const block = raw as { type?: string; name?: string; id?: string; tool_use_id?: string; input?: { command?: unknown } };
      if (block.type === "tool_use") {
        if (block.name !== "Bash" && block.name !== "PowerShell") continue;
        const command = block.input?.command;
        if (typeof command !== "string" || !command.includes("library artifact")) continue;
        const found: Read[] = [];
        INVOCATION.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = INVOCATION.exec(command)) !== null) {
          const id = match[1] ?? "";
          // Shell-variable ids come from scripted loops over many artifacts; they cannot be resolved
          // to a document, so counting them as repeats of "$id" would invent re-reads that never were.
          if (SUB_VERBS.has(id) || id.startsWith("--") || /^["']?\$/.test(id)) continue;
          found.push({ id, at: record.timestamp ?? null, kind: classify(match[2] ?? ""), resultChars: null });
        }
        if (found.length > 0) {
          reads.push(...found);
          if (typeof block.id === "string") awaitingResult.set(block.id, found);
        }
      } else if (block.type === "tool_result") {
        const target = typeof block.tool_use_id === "string" ? awaitingResult.get(block.tool_use_id) : undefined;
        if (target === undefined) continue;
        const chars = resultChars(block as { content?: unknown });
        // One command can carry several reads; split its result evenly rather than charging each the whole.
        if (chars !== null) for (const read of target) read.resultChars = Math.round(chars / target.length);
        if (typeof block.tool_use_id === "string") awaitingResult.delete(block.tool_use_id);
      }
    }
  }
  if (reads.length === 0) return null;
  return {
    file: path.basename(file, ".jsonl"),
    key: path.relative(root, file).split(path.sep).join("/"),
    slot: slotOf(root, file),
    subagent,
    reads,
  };
}

const quantile = (values: readonly number[], p: number): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(p * (sorted.length - 1))] ?? Number.NaN;
};
const pct = (part: number, whole: number): string => (whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(1)}%`);

interface RereadStats {
  readonly reads: number;
  readonly rereads: number;
  readonly totalChars: number;
  readonly rereadChars: number;
  readonly perWindow: number[];
  readonly gapMinutes: number[];
  readonly worst: { count: number; id: string; where: string };
}

/** Counts a repeat when a window renders the same document's body a second time. */
function rereadStats(windows: readonly Window[], groupBy: (w: Window) => string): RereadStats {
  const groups = new Map<string, { reads: Read[]; where: string }>();
  for (const w of windows) {
    const key = groupBy(w);
    const existing = groups.get(key);
    const bodies = w.reads.filter((r) => r.kind === "body");
    if (existing === undefined) groups.set(key, { reads: [...bodies], where: `${w.slot}/${w.file.slice(0, 8)}` });
    else existing.reads.push(...bodies);
  }
  let reads = 0;
  let rereads = 0;
  let totalChars = 0;
  let rereadChars = 0;
  const perWindow: number[] = [];
  const gapMinutes: number[] = [];
  let worst = { count: 0, id: "", where: "" };
  for (const group of groups.values()) {
    const seen = new Map<string, string | null>();
    const counts = new Map<string, number>();
    for (const read of group.reads) {
      reads++;
      totalChars += read.resultChars ?? 0;
      const n = (counts.get(read.id) ?? 0) + 1;
      counts.set(read.id, n);
      if (n > worst.count) worst = { count: n, id: read.id, where: group.where };
      const previous = seen.get(read.id);
      if (previous !== undefined) {
        rereads++;
        rereadChars += read.resultChars ?? 0;
        if (previous !== null && read.at !== null) gapMinutes.push((Date.parse(read.at) - Date.parse(previous)) / 60000);
      }
      seen.set(read.id, read.at);
    }
    if (group.reads.length > 0) perWindow.push(group.reads.length);
  }
  return { reads, rereads, totalChars, rereadChars, perWindow, gapMinutes, worst };
}

function renderStats(label: string, s: RereadStats, unit = "window"): string[] {
  const lines = [`  ${label}`];
  lines.push(
    `    reads ${s.reads}  re-reads ${s.rereads} (${pct(s.rereads, s.reads)})  ` +
      `cost ${(s.totalChars / 1e6).toFixed(2)}M chars (~${Math.round(s.totalChars / CHARS_PER_TOKEN / 1000)}k tok)`,
  );
  lines.push(
    `    re-reads cost ${(s.rereadChars / 1e6).toFixed(3)}M chars (~${Math.round(s.rereadChars / CHARS_PER_TOKEN / 1000)}k tok) = ` +
      `${pct(s.rereadChars, s.totalChars)} of what reading cost`,
  );
  lines.push(
    `    reads per ${unit}: median ${quantile(s.perWindow, 0.5)}  p90 ${quantile(s.perWindow, 0.9)}  max ${quantile(s.perWindow, 1)}`,
  );
  lines.push(`    worst repeat of ONE document in ONE group: ${s.worst.count} (${s.worst.id} @ ${s.worst.where})`);
  return lines;
}

export async function runProbe(root: string): Promise<{ ok: boolean; report: string; json: unknown }> {
  let files: { file: string; subagent: boolean }[];
  try {
    files = transcriptFiles(root);
  } catch (error) {
    return { ok: false, report: `could not walk ${root}: ${String(error)}`, json: null };
  }
  if (files.length === 0) return { ok: false, report: `no transcripts under ${root}`, json: null };

  const windows: Window[] = [];
  for (const { file, subagent } of files) {
    const w = await scanWindow(root, file, subagent);
    if (w !== null) windows.push(w);
  }

  const parents = windows.filter((w) => !w.subagent);
  const subagents = windows.filter((w) => w.subagent);
  const all = windows.flatMap((w) => w.reads);
  const kindTally = new Map<ReadKind, number>();
  for (const r of all) kindTally.set(r.kind, (kindTally.get(r.kind) ?? 0) + 1);

  const byWindow = rereadStats(windows, (w) => w.key);
  const bySlot = rereadStats(windows, (w) => w.slot);
  const parentStats = rereadStats(parents, (w) => w.key);
  const subStats = rereadStats(subagents, (w) => w.key);

  const lines: string[] = [];
  lines.push(`${TAG} — transcripts: ${root}`);
  lines.push(`${TAG} — ${files.length} transcript(s) swept; ${windows.length} carried at least one Library read`);
  lines.push(`             ${parents.length} parent window(s), ${subagents.length} subagent window(s)`);
  lines.push("");
  lines.push("WHAT THE INVOCATIONS WERE");
  for (const kind of ["body", "field", "to-file", "write"] as const) {
    const n = kindTally.get(kind) ?? 0;
    if (n === 0) continue;
    lines.push(`  ${kind.padEnd(8)} ${String(n).padStart(5)}  ${pct(n, all.length)}`);
  }
  lines.push(
    "  only `body` renders a whole document into the window; `field` pulls one field, `to-file` writes to disk",
  );
  lines.push("");
  lines.push("RE-READS, COUNTED IN THE ONLY PLACE THE WORD MEANS ANYTHING — one context window");
  lines.push(...renderStats("all windows", byWindow));
  lines.push(...renderStats("parent windows", parentStats));
  lines.push(...renderStats("subagent windows", subStats));
  lines.push("");
  lines.push("THE SAME READS, POOLED BY WORKTREE SLOT — what the traversal trace's sessionId does");
  lines.push(...renderStats("by slot", bySlot, "slot"));
  const windowShare = byWindow.reads === 0 ? 0 : byWindow.rereads / byWindow.reads;
  const slotShare = bySlot.reads === 0 ? 0 : bySlot.rereads / bySlot.reads;
  lines.push(
    `  INFLATION FROM POOLING: re-read share ${(100 * windowShare).toFixed(1)}% -> ${(100 * slotShare).toFixed(1)}%` +
      (windowShare > 0 ? ` (x${(slotShare / windowShare).toFixed(2)})` : ""),
  );
  lines.push("");
  lines.push("IS IT DRIFT-RESISTANCE? — if it were, OPERATING documents would show the LONGEST gaps");
  lines.push("  bucket       reads  re-reads   share   gap>60min   median gap");
  const jsonBuckets: Record<string, unknown> = {};
  for (const bucket of ["operating", "work", "other"] as const) {
    let reads = 0;
    let rereads = 0;
    const gaps: number[] = [];
    for (const w of windows) {
      const seen = new Map<string, string | null>();
      for (const read of w.reads) {
        if (read.kind !== "body" || bucketOf(read.id) !== bucket) continue;
        reads++;
        const previous = seen.get(read.id);
        if (previous !== undefined) {
          rereads++;
          if (previous !== null && read.at !== null) gaps.push((Date.parse(read.at) - Date.parse(previous)) / 60000);
        }
        seen.set(read.id, read.at);
      }
    }
    const long = gaps.filter((g) => g > 60).length;
    lines.push(
      `  ${bucket.padEnd(11)} ${String(reads).padStart(6)}  ${String(rereads).padStart(8)}  ${pct(rereads, reads).padStart(6)}  ` +
        `${pct(long, gaps.length).padStart(9)}  ${gaps.length > 0 ? `${quantile(gaps, 0.5).toFixed(1)}m` : "n/a"}`,
    );
    jsonBuckets[bucket] = { reads, rereads, longGaps: long, medianGapMinutes: gaps.length > 0 ? quantile(gaps, 0.5) : null };
  }
  lines.push("");
  lines.push("READ THIS AS A FLOOR — it counts `storytree library artifact <id>` in Bash tool inputs only.");
  lines.push("Reads through the studio, the desktop chat mount, or a direct store call are not visible here.");

  return {
    ok: true,
    report: lines.join("\n"),
    json: {
      transcriptsSwept: files.length,
      windows: { total: windows.length, parent: parents.length, subagent: subagents.length },
      invocations: Object.fromEntries(kindTally),
      byWindow: { reads: byWindow.reads, rereads: byWindow.rereads, totalChars: byWindow.totalChars, rereadChars: byWindow.rereadChars },
      bySlot: { reads: bySlot.reads, rereads: bySlot.rereads },
      buckets: jsonBuckets,
    },
  };
}

async function main(): Promise<void> {
  const asJson = process.argv.slice(2).includes("--json");
  const root = resolveTranscriptDir();
  const result = await runProbe(root);
  if (!result.ok) {
    console.error(`${TAG} FAIL — ${result.report}`);
    process.exitCode = 1;
    return;
  }
  console.log(asJson ? JSON.stringify(result.json, null, 2) : result.report);
}

await main();
