import fs from "node:fs";
import path from "node:path";

import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";

import type { Envelope } from "./envelope.js";

/**
 * `storytree session-cost` — the repeatable session-cost measurement instrument
 * (ADR-0323 D4, `session-cost-arc` increment 2, enacting
 * `process:measure-session-cost-from-transcripts`).
 *
 * WHAT IT IS. It prices a window of past sessions from the harness's own JSONL transcripts under
 * `~/.claude/projects/**`, per assistant turn, from the recorded `message.usage` and
 * `message.model`. ADR-0323 D4 makes that ADR explicitly falsifiable — "the measurement is the
 * check, not this prose" — and the arc's end-state item 5 requires the analysis to be re-runnable
 * over any window. Increment 1 shipped only the METHOD; the analyzers lived in a session scratchpad
 * and are gone, so none of the arc's claims could be falsified by a later session. This is that
 * gap closed.
 *
 * WHY IT LIVES IN `cli` AND NOT `drive`. `factory health` (ADR-0316) splits compute into
 * `@storytree/drive` so the studio can serve the same figures without importing the CLI. That
 * reason is absent here: the input is `~/.claude`, a per-user per-machine directory OUTSIDE the
 * repo that the hosted studio cannot read at all. There is no second consumer, so a `drive`
 * extraction would buy an arrow and no caller.
 *
 * NOT A GATE RUNG, DELIBERATELY (ADR-0323 Unresolved). Making it a `check:*` is tempting and
 * wrong: ADR-0168 D1 found that a compliance gate prices a ceremony toward theater, and a cost
 * gate carries the sharper objection that it would be GAMED BY SPLITTING SESSIONS — improving the
 * metric while making the system worse. It is a diagnostic a session or the owner runs on purpose.
 *
 * THE DOLLARS ARE A WEIGHT PROXY, NEVER A BILL. This factory's leaves are subscription-funded
 * (ADR-0030 / ADR-0232). The token RATIOS below are measured and exact; the dollar figures exist
 * only so four differently-priced components can be compared against each other. The report says
 * so on every run, and so does {@link MODEL_PRICES}.
 *
 * REPORT-ONLY. It reads. It writes nothing, adjudicates nothing, and blocks no merge.
 */

// ---------------------------------------------------------------------------
// The price table — ONE place, because these change
// ---------------------------------------------------------------------------

/**
 * List rates in USD per MILLION tokens, as published on 2026-08-08.
 *
 * ⚠️ THESE ARE A WEIGHT PROXY, NOT A BILL (ADR-0030 / ADR-0232 — the leaves are subscription-
 * funded). They exist so cache-read, cache-write, input and output tokens can be weighed against
 * each other; nobody is charged these amounts. Never present output derived from them as a cost
 * anyone owes.
 *
 * Every row is `base input/output` plus the API's published cache multipliers — cache write is
 * 1.25× input for the 5-minute TTL and 2× input for the 1-hour TTL, cache read is 0.1× input — so
 * the five columns are internally consistent and a rate change means editing two numbers, not five.
 * The columns are written out anyway rather than computed, because a rate table you can read at a
 * glance is the point of having one place.
 *
 * `sonnet` carries the $3/$15 list rate, not the $2/$10 introductory rate running through
 * 2026-08-31: an introductory discount would make two measurement windows incomparable, which is
 * the one property ADR-0323 D4 needs this instrument to have.
 */
export interface ModelPrice {
  /** Fresh, uncached input tokens. */
  readonly input: number;
  /** Generated tokens (text + thinking). */
  readonly output: number;
  /** Writing a 5-minute-TTL cache entry (1.25× input). */
  readonly cacheWrite5m: number;
  /** Writing a 1-hour-TTL cache entry (2× input). */
  readonly cacheWrite1h: number;
  /** Reading any cache entry (0.1× input). */
  readonly cacheRead: number;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  // in / out / cw-5m / cw-1h / cache-read
  opus: { input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
  sonnet: { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
  // Not in ADR-0323's original window, but present in this machine's transcripts today — an
  // unpriced tier would silently understate the bill, which is exactly the class of error the ADR
  // warns about. Same multipliers as every other row.
  fable: { input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1 },
};

/** Substring → tier. Ordered longest-first so a future `claude-opus-fable-x` cannot mis-resolve. */
const TIER_MATCHERS: ReadonlyArray<readonly [needle: string, tier: string]> = [
  ["sonnet", "sonnet"],
  ["haiku", "haiku"],
  ["fable", "fable"],
  ["mythos", "fable"],
  ["opus", "opus"],
];

/**
 * The tier a recorded `message.model` prices at, or `undefined` when this table has no rate for it.
 *
 * Substring matching, not an exact-id map, because the ids carry versions (`claude-opus-4-8`,
 * `claude-opus-5`) and a version bump must not silently drop a model into the unpriced bucket. An
 * unknown model is REPORTED rather than zeroed — see {@link SessionCostReport.unpriced}.
 */
export function resolveTier(modelId: string): string | undefined {
  const id = modelId.toLowerCase();
  for (const [needle, tier] of TIER_MATCHERS) {
    if (id.includes(needle)) return tier;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Token axes
// ---------------------------------------------------------------------------

/**
 * The four separately-priced token axes. Summing only `input` reports ~0% input-side cost while
 * the truth is 89% — the single most likely way to get a confidently wrong answer here
 * (`process:measure-session-cost-from-transcripts`, Failure modes). The type keeps them apart so
 * no reduction can collapse them by accident.
 */
export interface TokenAxes {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite5m: number;
  readonly cacheWrite1h: number;
  readonly output: number;
}

const ZERO_AXES: TokenAxes = { input: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, output: 0 };

function addAxes(a: TokenAxes, b: TokenAxes): TokenAxes {
  return {
    input: a.input + b.input,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
    output: a.output + b.output,
  };
}

/** Tokens RESIDENT in the window for one turn: everything the model re-read to exist. */
export function contextTokens(axes: TokenAxes): number {
  return axes.input + axes.cacheRead + axes.cacheWrite5m + axes.cacheWrite1h;
}

/** Weighs one turn's axes at one tier's rates. Returns 0 for an unpriced model. */
export function priceAxes(axes: TokenAxes, tier: string | undefined): number {
  const price = tier === undefined ? undefined : MODEL_PRICES[tier];
  if (price === undefined) return 0;
  return (
    (axes.input * price.input +
      axes.cacheRead * price.cacheRead +
      axes.cacheWrite5m * price.cacheWrite5m +
      axes.cacheWrite1h * price.cacheWrite1h +
      axes.output * price.output) /
    1_000_000
  );
}

// ---------------------------------------------------------------------------
// Parsing one transcript file
// ---------------------------------------------------------------------------

/** One priced model request, after streaming partials have been folded together. */
export interface Turn {
  /** `requestId` — the identity a streaming partial repeats, and therefore the dedupe key. */
  readonly requestId: string;
  readonly at: string;
  readonly model: string;
  readonly tier: string | undefined;
  readonly axes: TokenAxes;
  /** Unique `tool_use.id`s emitted anywhere across this request's lines. */
  readonly toolUseIds: readonly string[];
  /** Tool names in emission order, for phase-marker detection. */
  readonly toolNames: readonly string[];
  /** Bash `command` inputs seen on this turn, for phase-marker detection. */
  readonly commands: readonly string[];
}

export interface TranscriptRead {
  readonly turns: readonly Turn[];
  /** Assistant-shaped lines that could not be used (unparseable, no usage, no identity). */
  readonly skipped: number;
  /** `<synthetic>` lines — harness-generated, zero usage, never a billed request. */
  readonly synthetic: number;
}

const EMPTY_READ: TranscriptRead = { turns: [], skipped: 0, synthetic: 0 };

/** A crash-truncated line still textually declares its type; that is the only way to tell it apart. */
const ASSISTANT_SHAPE = /"type"\s*:\s*"assistant"/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Splits `cache_creation_input_tokens` into its 5-minute and 1-hour halves.
 *
 * The TOTAL is authoritative: when the nested `cache_creation` breakdown is absent, or disagrees
 * with it, the remainder is attributed to the 5-minute rate rather than invented or dropped. The
 * two TTLs price differently (1.25× vs 2× input), so folding them together would misweigh a
 * long-lived cache — and this repo's own sessions use the 1-hour TTL.
 */
function splitCacheWrite(usage: Record<string, unknown>): { w5m: number; w1h: number } {
  const total = nonNegative(usage["cache_creation_input_tokens"]);
  const breakdown = usage["cache_creation"];
  if (!isRecord(breakdown)) return { w5m: total, w1h: 0 };
  const w1h = Math.min(nonNegative(breakdown["ephemeral_1h_input_tokens"]), total);
  return { w5m: Math.max(0, total - w1h), w1h };
}

/**
 * Reduces one JSONL transcript to its priced turns.
 *
 * THE DEDUPE, AND THE TRAP INSIDE IT. A single logical turn is written as SEVERAL lines — one per
 * content block (thinking, then text, then each `tool_use`) — and every one of them repeats the
 * SAME `message.usage`. Counting lines quadruple-bills a four-block turn, so usage is taken from
 * the first line of each `requestId` only. But the blocks differ per line, so that same dedupe
 * DROPS every `tool_use` after the first line. Tool calls are therefore collected from ALL lines
 * and counted by unique `tool_use.id`, independently of the usage fold.
 *
 * Never throws: a missing file, an empty one, or an unusable line degrades to an honest partial
 * read, because a diagnostic that dies on one malformed line reports nothing about the other 1,481.
 */
export function readTranscript(filePath: string): TranscriptRead {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return EMPTY_READ;
  }
  return parseTranscript(raw);
}

/** {@link readTranscript}'s pure half — the same reduction over already-read bytes. */
export function parseTranscript(raw: string): TranscriptRead {
  let skipped = 0;
  let synthetic = 0;
  const order: string[] = [];
  const byRequest = new Map<
    string,
    { turn: Turn; toolIds: Set<string>; toolNames: string[]; commands: string[] }
  >();

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (ASSISTANT_SHAPE.test(line)) skipped++;
      continue;
    }
    if (!isRecord(parsed) || parsed["type"] !== "assistant") continue;

    const message = isRecord(parsed["message"]) ? parsed["message"] : undefined;
    const model = message !== undefined && typeof message["model"] === "string" ? message["model"] : "";

    // `<synthetic>` is a harness-authored placeholder with all-zero usage and no request identity.
    // It is a KNOWN benign case, so counting it as a skip would make that number meaningless.
    if (model === "<synthetic>") {
      synthetic++;
      continue;
    }

    const requestId =
      typeof parsed["requestId"] === "string"
        ? parsed["requestId"]
        : message !== undefined && typeof message["id"] === "string"
          ? message["id"]
          : undefined;
    if (requestId === undefined) {
      skipped++;
      continue;
    }

    // Tool calls first, and for EVERY line — this is the half the usage dedupe below would drop.
    const existing = byRequest.get(requestId);
    const toolIds = existing?.toolIds ?? new Set<string>();
    const toolNames = existing?.toolNames ?? [];
    const commands = existing?.commands ?? [];
    const content = message !== undefined ? message["content"] : undefined;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!isRecord(block) || block["type"] !== "tool_use") continue;
        const id = typeof block["id"] === "string" ? block["id"] : undefined;
        if (id === undefined || toolIds.has(id)) continue;
        toolIds.add(id);
        if (typeof block["name"] === "string") toolNames.push(block["name"]);
        const input = block["input"];
        if (isRecord(input) && typeof input["command"] === "string") commands.push(input["command"]);
      }
    }

    if (existing !== undefined) {
      // A later line for an already-priced request: its tool calls were just folded in above, and
      // its usage is a duplicate of the first line's. Neither a turn nor a skip.
      continue;
    }

    const usage = message !== undefined ? message["usage"] : undefined;
    const timestamp = parsed["timestamp"];
    if (!isRecord(usage) || typeof timestamp !== "string") {
      skipped++;
      continue;
    }

    const { w5m, w1h } = splitCacheWrite(usage);
    const axes: TokenAxes = {
      input: nonNegative(usage["input_tokens"]),
      cacheRead: nonNegative(usage["cache_read_input_tokens"]),
      cacheWrite5m: w5m,
      cacheWrite1h: w1h,
      output: nonNegative(usage["output_tokens"]),
    };

    order.push(requestId);
    byRequest.set(requestId, {
      turn: {
        requestId,
        at: timestamp,
        model,
        tier: resolveTier(model),
        axes,
        toolUseIds: [],
        toolNames: [],
        commands: [],
      },
      toolIds,
      toolNames,
      commands,
    });
  }

  const turns: Turn[] = [];
  for (const requestId of order) {
    const entry = byRequest.get(requestId);
    if (entry === undefined) continue;
    turns.push({
      ...entry.turn,
      toolUseIds: [...entry.toolIds],
      toolNames: entry.toolNames,
      commands: entry.commands,
    });
  }
  return { turns, skipped, synthetic };
}

// ---------------------------------------------------------------------------
// Command classification — the two BEHAVIOURAL lines ADR-0323 measured
// ---------------------------------------------------------------------------

/**
 * What a shell command was FOR, as far as a transcript can tell.
 *
 * ADR-0323 §3 and §4 each rest on a count this instrument could not previously produce: 133 polling
 * turns (10% of spend) and 246-of-1,033 ad-hoc inspection bash calls (24%). Those numbers came from
 * throwaway scratchpad analyzers that no longer exist, so their exact classifier is UNRECOVERABLE.
 * That is precisely why the rule lives here now: a later window is compared against an earlier one
 * by re-running THIS classifier over both, never by trusting a remembered percentage.
 */
export type CommandClass = "polling" | "inspection" | "other";

/**
 * Commands that mean "wait for a machine and look again" — ADR-0323 D2's retired pattern, now
 * `asset:mechanical-waiting-never-pays-context-rent`.
 *
 * `gh pr checks` / `gh run watch` are counted by SHAPE, not by proven repetition: a transcript
 * cannot distinguish one deliberate status read from the second tick of a loop without guessing at
 * intent. The basket is therefore slightly GENEROUS in both directions equally, which is the
 * property a before/after comparison actually needs.
 */
const POLLING_PHRASE = /\bgh\s+(?:pr\s+checks|run\s+watch)\b/;

/**
 * Read-only inspection verbs — ADR-0323 §4's `grep`/`cat`/`head`/`ls` basket, widened to the rest of
 * the family a session actually reaches for. Deliberately NOT including `git`, `pnpm` or `node`:
 * those do work, and folding them in would inflate the line this measures.
 */
const INSPECTION_VERBS = new Set([
  "grep",
  "rg",
  "cat",
  "head",
  "tail",
  "ls",
  "find",
  "wc",
  "sed",
  "awk",
  "stat",
  "du",
  "tree",
  "cut",
  "sort",
  "uniq",
]);

/**
 * Segments that change where a command runs without doing anything themselves. Dropped before
 * classification, because `cd packages/cli && grep -rn foo src` is a LOOK: counting the `cd` as a
 * non-inspection segment would push the overwhelmingly common prefixed form into `other` and
 * under-report the very line ADR-0323 §4 measures.
 */
const NEUTRAL_VERBS = new Set(["cd", "pushd", "popd", "true", "set"]);

/** Split a compound command into the pieces that each have their own head verb. */
function splitSegments(command: string): string[] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== "" && !NEUTRAL_VERBS.has(headVerb(s)));
}

/** The verb a segment actually runs: leading `VAR=x` assignments dropped, path stripped. */
function headVerb(segment: string): string {
  for (const token of segment.split(/\s+/)) {
    if (token === "") continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue; // `FOO=bar cmd`
    const bare = token.replace(/^.*[/\\]/, "").replace(/^["']|["']$/g, "");
    return bare.toLowerCase();
  }
  return "";
}

/**
 * Classify one shell command.
 *
 * POLLING WINS over inspection, and that ordering is the whole point: `sleep 300; tail -4 gate.log`
 * is the exact command ADR-0323 §3 measured, and reading it as "inspection" because it ends in
 * `tail` would move the finding from one line to the other. Inspection requires EVERY segment to be
 * a read verb, so `pnpm gate | tail -5` stays `other` — it is a build, not a look.
 */
export function classifyCommand(command: string): CommandClass {
  const segments = splitSegments(command);
  if (segments.length === 0) return "other";
  if (POLLING_PHRASE.test(command)) return "polling";
  if (segments.some((s) => headVerb(s) === "sleep")) return "polling";
  return segments.every((s) => INSPECTION_VERBS.has(headVerb(s))) ? "inspection" : "other";
}

/** How a population of commands split three ways. */
export interface CommandMix {
  readonly calls: number;
  readonly polling: number;
  readonly inspection: number;
  readonly other: number;
}

const ZERO_MIX: CommandMix = { calls: 0, polling: 0, inspection: 0, other: 0 };

/**
 * A turn that did NOTHING BUT poll — ADR-0323 §3's "133 turns were pure polling".
 *
 * Purity is the load-bearing word. A turn that polls AND edits a file is doing work and paying its
 * context rent for a reason; the waste this counts is a full-context round-trip whose entire yield
 * is four lines of a log. So every tool call on the turn must be a Bash call, and every one of them
 * must classify as polling.
 */
export function isPollingTurn(turn: Turn): boolean {
  if (turn.toolNames.length === 0) return false;
  if (!turn.toolNames.every((name) => name === "Bash")) return false;
  if (turn.commands.length !== turn.toolNames.length) return false;
  return turn.commands.every((command) => classifyCommand(command) === "polling");
}

// ---------------------------------------------------------------------------
// Phase attribution
// ---------------------------------------------------------------------------

export const PHASES = ["orientation", "build", "landing"] as const;
export type Phase = (typeof PHASES)[number];

/** Tools whose use means authoring has started. */
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const BUILD_COMMAND = /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?gate\b|storytree\s+(?:node|story)\s+build\b/;
const LANDING_COMMAND = /\bgh\s+pr\s+create\b|\bgit\s+push\b/;

/**
 * Which phase each main-thread turn belongs to, by TRANSCRIPT POSITION rather than wall-clock time
 * — a session idles, and idle time is free
 * (`process:measure-session-cost-from-transcripts`, step 6).
 *
 * The markers are the ones the process names: authoring begins at the first edit or the first
 * build/gate command, and landing begins at `gh pr create` / `git push`. Landing is terminal, so a
 * post-merge follow-up commit does not read the session back into `build`.
 */
export function attributePhases(turns: readonly Turn[]): readonly Phase[] {
  let phase: Phase = "orientation";
  return turns.map((turn) => {
    if (phase !== "landing" && turn.commands.some((c) => LANDING_COMMAND.test(c))) {
      phase = "landing";
    } else if (
      phase === "orientation" &&
      (turn.toolNames.some((n) => EDIT_TOOLS.has(n)) || turn.commands.some((c) => BUILD_COMMAND.test(c)))
    ) {
      phase = "build";
    }
    return phase;
  });
}

// ---------------------------------------------------------------------------
// Discovering sessions on disk
// ---------------------------------------------------------------------------

/** `C:\code\storytree` → `C--code-storytree`; the harness flattens every separator to a dash. */
export function slugifyRepoPath(repoPath: string): string {
  return repoPath.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * The MAIN checkout a worktree belongs to, so a session run from
 * `.claude/worktrees/<name>` still measures the whole repo's history rather than its own slot.
 */
export function mainCheckoutRoot(cwd: string): string {
  const normalized = cwd.replace(/\\/g, "/");
  const at = normalized.indexOf("/.claude/worktrees/");
  return at === -1 ? normalized : normalized.slice(0, at);
}

export interface SessionFiles {
  readonly project: string;
  readonly sessionId: string;
  readonly mainFile: string;
  readonly subagentFiles: ReadonlyArray<{ readonly file: string; readonly metaFile: string }>;
  readonly mtimeMs: number;
}

/**
 * Every session under `root` whose project directory starts with `projectPrefix` (or all of them
 * when the prefix is empty). A session is a `<sessionId>.jsonl` beside an optional
 * `<sessionId>/subagents/` directory — that directory membership is the ONLY reliable
 * main-thread-vs-subagent split; content never tells you.
 */
export function discoverSessions(root: string, projectPrefix: string): SessionFiles[] {
  let projects: string[];
  try {
    projects = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(projectPrefix))
      .map((e) => e.name);
  } catch {
    return [];
  }

  const found: SessionFiles[] = [];
  for (const project of projects) {
    const dir = path.join(root, project);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const mainFile = path.join(dir, name);
      let mtimeMs: number;
      try {
        const stat = fs.statSync(mainFile);
        if (!stat.isFile()) continue;
        mtimeMs = stat.mtimeMs;
      } catch {
        continue;
      }
      const sessionId = name.slice(0, -".jsonl".length);
      const subagentDir = path.join(dir, sessionId, "subagents");
      const subagentFiles: Array<{ file: string; metaFile: string }> = [];
      try {
        for (const agentName of fs.readdirSync(subagentDir)) {
          if (!agentName.endsWith(".jsonl")) continue;
          subagentFiles.push({
            file: path.join(subagentDir, agentName),
            metaFile: path.join(subagentDir, `${agentName.slice(0, -".jsonl".length)}.meta.json`),
          });
        }
      } catch {
        // No subagents directory is the common case, not an error.
      }
      found.push({ project, sessionId, mainFile, subagentFiles, mtimeMs });
    }
  }
  return found;
}

/** `agentType` from a subagent's sidecar. Absent/unreadable is reported, never guessed. */
export function readAgentType(metaFile: string): string {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    if (isRecord(parsed) && typeof parsed["agentType"] === "string" && parsed["agentType"] !== "") {
      return parsed["agentType"];
    }
  } catch {
    // fall through
  }
  return "(unknown)";
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface PhaseRow {
  readonly phase: Phase;
  readonly turns: number;
  readonly cost: number;
}

export interface AgentTypeRow {
  readonly agentType: string;
  readonly spawns: number;
  /**
   * Measured sessions that spawned this type at least once — the ADOPTION figure, which a spawn
   * count alone hides. "13 spawns" is one session spawning thirteen or thirteen sessions spawning
   * one, and only the second is a habit. ADR-0323 §4's own finding was shaped this way: 7 spawns
   * across 10 sessions with 4 sessions using none.
   */
  readonly sessions: number;
  readonly turns: number;
  readonly cost: number;
  /** Every distinct model this agent type ran on — the figure a tiering decision turns on. */
  readonly models: readonly string[];
}

export interface SessionRow {
  readonly project: string;
  readonly sessionId: string;
  readonly turns: number;
  readonly cost: number;
  readonly first: string;
  readonly last: string;
  /** Subagent transcripts with at least one priced turn in the window. */
  readonly subagentSpawns: number;
  /** Main-thread turns that did nothing but poll ({@link isPollingTurn}). */
  readonly pollingTurns: number;
}

/** Turns spent purely waiting on a machine, and what that cost. */
export interface PollingTotals {
  readonly turns: number;
  readonly cost: number;
}

/**
 * One-shot invocations skipped by the `--min-turns` floor, aggregated.
 *
 * They ARE spend and are never silently dropped — the report prints this block — but they are not
 * the unit ADR-0323 measured, so pooling them into the window would misreport it.
 */
export interface OneShotTotals {
  readonly sessions: number;
  readonly turns: number;
  readonly cost: number;
}

export interface SessionCostReport {
  /** Sessions actually measured, newest first. */
  readonly sessions: readonly SessionRow[];
  /** Sessions excluded as still in flight — named, never silently dropped. */
  readonly active: readonly string[];
  /** Sessions skipped because their FIRST turn fell outside `--started-after`/`--started-before`. */
  readonly outsideStartWindow: number;
  /** Transcripts opened while filling the window. */
  readonly scanned: number;
  /** Older sessions never opened, because the window filled or the scan budget ran out. */
  readonly outsideWindow: number;
  /** True when the scan budget stopped the search before the window filled. */
  readonly scanBudgetHit: boolean;
  /** Invocations below the `--min-turns` floor — reported, never folded into the window. */
  readonly oneShot: OneShotTotals;
  readonly mainTurns: number;
  readonly subagentSpawns: number;
  readonly subagentTurns: number;
  readonly toolCalls: number;
  readonly skippedLines: number;
  readonly syntheticLines: number;
  /** The whole population's tokens, on all four axes. */
  readonly axes: TokenAxes;
  /** Cost by axis, in the same shape — the SPLIT is the finding. */
  readonly cost: TokenAxes;
  readonly totalCost: number;
  readonly phases: readonly PhaseRow[];
  readonly agentTypes: readonly AgentTypeRow[];
  /** Main-thread turns spent purely polling (ADR-0323 §3 / D2). */
  readonly polling: PollingTotals;
  /** Main-thread bash calls, split by what they were for (ADR-0323 §4). */
  readonly commands: CommandMix;
  /**
   * The same split for SUBAGENT bash calls. Reported beside the main-thread mix because D1's whole
   * claim is that inspection should MOVE here rather than disappear — a fall in main-thread
   * inspection with no rise in subagent inspection is a session doing less looking, not a session
   * delegating it, and those are different findings.
   */
  readonly subagentCommands: CommandMix;
  /** Measured sessions that spawned no subagent at all — ADR-0323 §4's "4 sessions using none". */
  readonly sessionsWithoutSubagents: number;
  /** Main-thread live-context size in tokens. */
  readonly context: { readonly median: number; readonly p90: number; readonly max: number };
  /** Models with no rate in {@link MODEL_PRICES}: turns and tokens, so the gap is visible. */
  readonly unpriced: ReadonlyArray<{ readonly model: string; readonly turns: number; readonly tokens: number }>;
  readonly window: {
    readonly from: string | undefined;
    readonly to: string | undefined;
    readonly startedAfter: string | undefined;
    readonly startedBefore: string | undefined;
    readonly limit: number;
    readonly minTurns: number;
  };
  readonly root: string;
  readonly projectPrefix: string;
}

export interface CollectOpts {
  /** Transcript root. Defaults to `resolveTranscriptDir()` (`STORYTREE_TRANSCRIPT_DIR` or `~/.claude/projects`). */
  readonly root?: string | undefined;
  readonly projectPrefix: string;
  /** Most-recent N sessions. */
  readonly limit: number;
  /** ISO bounds applied to each TURN, after session selection. */
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /**
   * ISO bounds applied to a SESSION's first turn, selecting whole sessions rather than truncating
   * them.
   *
   * `--from`/`--to` cut a session in half at the boundary, which is the wrong instrument for asking
   * "did behaviour change after X landed": half a session's turns is not half a session's habits,
   * and the orientation phase — where delegation is decided — lives entirely at the start. A
   * session's behaviour is set by the guidance that was live when it STARTED, because the harness
   * reads CLAUDE.md, AGENTS.md and `.claude/agents/` once at session start.
   */
  readonly startedAfter?: string | undefined;
  readonly startedBefore?: string | undefined;
  /** A session whose file changed within this many minutes of `now` is treated as in flight. */
  readonly activeWithinMinutes: number;
  /** Priced turns a transcript needs before it counts as a session rather than a one-shot. */
  readonly minTurns: number;
  /** Transcripts to open while filling the window, so a 1,400-session history is not read whole. */
  readonly scanLimit?: number | undefined;
  /** Injected so the report is deterministic under test. */
  readonly nowMs: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[idx] ?? 0;
}

function inWindow(at: string, from: string | undefined, to: string | undefined): boolean {
  if (from !== undefined && at < from) return false;
  if (to !== undefined && at > to) return false;
  return true;
}

export function collectSessionCost(opts: CollectOpts): SessionCostReport {
  const root = opts.root ?? resolveTranscriptDir();
  const all = discoverSessions(root, opts.projectPrefix).sort((a, b) => b.mtimeMs - a.mtimeMs);

  const activeCutoff = opts.nowMs - opts.activeWithinMinutes * 60_000;
  const active: string[] = [];
  const completed: SessionFiles[] = [];
  for (const session of all) {
    if (session.mtimeMs >= activeCutoff) active.push(session.sessionId);
    else completed.push(session);
  }

  /**
   * SELECT BY SUBSTANCE, NOT BY RECENCY ALONE.
   *
   * "The N most recent sessions" was only ever a proxy for "the N most recent WORKING sessions".
   * This machine's history is dominated by one-shot machine-driven invocations — a single scripted
   * prompt, one answer, done — and taking the ten newest transcripts by mtime lands entirely on
   * those, reporting a window nobody would recognise as a session. So the scan walks newest-first
   * and keeps transcripts carrying at least `minTurns` priced turns.
   *
   * The one-shots are NOT hidden: they are real spend, and the report prints their count, turns and
   * aggregate cost. A silent filter here would be the mirror image of the input-tokens trap — an
   * instrument quietly deciding which spend counts.
   */
  const scanBudget = opts.scanLimit ?? Math.max(200, opts.limit * 25);
  const selected: Array<{ session: SessionFiles; read: TranscriptRead; windowed: readonly Turn[] }> = [];
  let scanned = 0;
  let scanBudgetHit = false;
  let oneShotSessions = 0;
  let oneShotTurns = 0;
  let oneShotCost = 0;
  let outsideStartWindow = 0;
  const boundsStart = opts.startedAfter !== undefined || opts.startedBefore !== undefined;

  for (const session of completed) {
    if (selected.length >= opts.limit) break;
    if (scanned >= scanBudget) {
      scanBudgetHit = true;
      break;
    }
    scanned++;
    const read = readTranscript(session.mainFile);
    const windowed = read.turns.filter((t) => inWindow(t.at, opts.from, opts.to));

    // The START filter runs FIRST and is not a one-shot: a session excluded because it began on the
    // wrong side of an intervention is out of SCOPE, not below the substance floor. Pooling the two
    // would corrupt the one-shot block, which exists to account for spend rather than to hide it.
    if (boundsStart) {
      const start = windowed[0]?.at;
      if (start === undefined || !inWindow(start, opts.startedAfter, opts.startedBefore)) {
        outsideStartWindow++;
        continue;
      }
    }

    if (windowed.length < opts.minTurns) {
      oneShotSessions++;
      oneShotTurns += windowed.length;
      for (const turn of windowed) oneShotCost += priceAxes(turn.axes, turn.tier);
      continue;
    }
    selected.push({ session, read, windowed });
  }

  let axes = ZERO_AXES;
  let cost = ZERO_AXES;
  let totalCost = 0;
  let mainTurns = 0;
  let subagentTurns = 0;
  let subagentSpawns = 0;
  let toolCalls = 0;
  let skippedLines = 0;
  let syntheticLines = 0;
  const contexts: number[] = [];
  const phaseTotals = new Map<Phase, { turns: number; cost: number }>(
    PHASES.map((p) => [p, { turns: 0, cost: 0 }]),
  );
  const agentTotals = new Map<
    string,
    { spawns: number; sessions: number; turns: number; cost: number; models: Set<string> }
  >();
  const unpriced = new Map<string, { turns: number; tokens: number }>();
  const sessions: SessionRow[] = [];
  let pollingTurnCount = 0;
  let pollingCost = 0;
  let sessionsWithoutSubagents = 0;
  const mainMix = { calls: 0, polling: 0, inspection: 0, other: 0 };
  const subMix = { calls: 0, polling: 0, inspection: 0, other: 0 };

  const tallyCommands = (into: typeof mainMix, turn: Turn): void => {
    for (const command of turn.commands) {
      into.calls++;
      into[classifyCommand(command)]++;
    }
  };

  const account = (turn: Turn): number => {
    const turnCost = priceAxes(turn.axes, turn.tier);
    axes = addAxes(axes, turn.axes);
    totalCost += turnCost;
    const tier = turn.tier;
    const price = tier === undefined ? undefined : MODEL_PRICES[tier];
    if (price === undefined) {
      const row = unpriced.get(turn.model) ?? { turns: 0, tokens: 0 };
      unpriced.set(turn.model, {
        turns: row.turns + 1,
        tokens: row.tokens + contextTokens(turn.axes) + turn.axes.output,
      });
    } else {
      cost = addAxes(cost, {
        input: (turn.axes.input * price.input) / 1_000_000,
        cacheRead: (turn.axes.cacheRead * price.cacheRead) / 1_000_000,
        cacheWrite5m: (turn.axes.cacheWrite5m * price.cacheWrite5m) / 1_000_000,
        cacheWrite1h: (turn.axes.cacheWrite1h * price.cacheWrite1h) / 1_000_000,
        output: (turn.axes.output * price.output) / 1_000_000,
      });
    }
    toolCalls += turn.toolUseIds.length;
    return turnCost;
  };

  for (const { session, read, windowed } of selected) {
    skippedLines += read.skipped;
    syntheticLines += read.synthetic;
    const phases = attributePhases(windowed);

    let sessionCost = 0;
    let sessionTurns = 0;
    let sessionPolling = 0;
    for (const [index, turn] of windowed.entries()) {
      const turnCost = account(turn);
      sessionCost += turnCost;
      sessionTurns++;
      mainTurns++;
      contexts.push(contextTokens(turn.axes));
      tallyCommands(mainMix, turn);
      if (isPollingTurn(turn)) {
        pollingTurnCount++;
        pollingCost += turnCost;
        sessionPolling++;
      }
      const phase = phases[index] ?? "orientation";
      const bucket = phaseTotals.get(phase);
      if (bucket !== undefined) {
        bucket.turns++;
        bucket.cost += turnCost;
      }
    }

    let sessionSpawns = 0;
    // Per SESSION, so an agent type spawned five times by one session counts once toward adoption.
    const typesThisSession = new Set<string>();
    for (const sub of session.subagentFiles) {
      const subRead = readTranscript(sub.file);
      skippedLines += subRead.skipped;
      syntheticLines += subRead.synthetic;
      const subTurns = subRead.turns.filter((t) => inWindow(t.at, opts.from, opts.to));
      if (subTurns.length === 0) continue;
      subagentSpawns++;
      sessionSpawns++;
      const agentType = readAgentType(sub.metaFile);
      const row = agentTotals.get(agentType) ?? {
        spawns: 0,
        sessions: 0,
        turns: 0,
        cost: 0,
        models: new Set<string>(),
      };
      row.spawns++;
      if (!typesThisSession.has(agentType)) {
        typesThisSession.add(agentType);
        row.sessions++;
      }
      for (const turn of subTurns) {
        const turnCost = account(turn);
        row.turns++;
        row.cost += turnCost;
        if (turn.model !== "") row.models.add(turn.model);
        tallyCommands(subMix, turn);
        sessionCost += turnCost;
        sessionTurns++;
        subagentTurns++;
      }
      agentTotals.set(agentType, row);
    }
    if (sessionSpawns === 0) sessionsWithoutSubagents++;

    const first = windowed[0]?.at ?? "";
    const last = windowed[windowed.length - 1]?.at ?? "";
    sessions.push({
      project: session.project,
      sessionId: session.sessionId,
      turns: sessionTurns,
      cost: sessionCost,
      first,
      last,
      subagentSpawns: sessionSpawns,
      pollingTurns: sessionPolling,
    });
  }

  contexts.sort((a, b) => a - b);
  return {
    sessions,
    active,
    outsideStartWindow,
    scanned,
    outsideWindow: Math.max(0, completed.length - scanned),
    scanBudgetHit,
    oneShot: { sessions: oneShotSessions, turns: oneShotTurns, cost: oneShotCost },
    mainTurns,
    subagentSpawns,
    subagentTurns,
    toolCalls,
    skippedLines,
    syntheticLines,
    axes,
    cost,
    totalCost,
    phases: PHASES.map((phase) => {
      const bucket = phaseTotals.get(phase);
      return { phase, turns: bucket?.turns ?? 0, cost: bucket?.cost ?? 0 };
    }),
    agentTypes: [...agentTotals.entries()]
      .map(([agentType, row]) => ({
        agentType,
        spawns: row.spawns,
        sessions: row.sessions,
        turns: row.turns,
        cost: row.cost,
        models: [...row.models].sort(),
      }))
      .sort((a, b) => b.cost - a.cost),
    polling: { turns: pollingTurnCount, cost: pollingCost },
    commands: { ...mainMix },
    subagentCommands: { ...subMix },
    sessionsWithoutSubagents,
    context: {
      median: quantile(contexts, 0.5),
      p90: quantile(contexts, 0.9),
      max: contexts[contexts.length - 1] ?? 0,
    },
    unpriced: [...unpriced.entries()]
      .map(([model, row]) => ({ model, turns: row.turns, tokens: row.tokens }))
      .sort((a, b) => b.tokens - a.tokens),
    window: {
      from: opts.from,
      to: opts.to,
      startedAfter: opts.startedAfter,
      startedBefore: opts.startedBefore,
      limit: opts.limit,
      minTurns: opts.minTurns,
    },
    root,
    projectPrefix: opts.projectPrefix,
  };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "  0.0%";
  return `${((part / whole) * 100).toFixed(1)}%`.padStart(6);
}

function tokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export function renderSessionCost(report: SessionCostReport): string {
  const lines: string[] = [
    "SESSION COST — report-only (ADR-0323 D4: a diagnostic, deliberately NOT a gate rung).",
    "Dollar figures are a WEIGHT PROXY at list rates, never a bill: this factory's leaves are",
    "subscription-funded (ADR-0030 / ADR-0232). The token ratios are measured and exact.",
    "",
    "## THE WINDOW",
    "",
    `  root:     ${report.root}`,
    `  projects: ${report.projectPrefix === "" ? "(all)" : `${report.projectPrefix}*`}`,
    `  sessions: ${report.sessions.length} measured (most recent ${report.window.limit} requested, ` +
      `>= ${report.window.minTurns} priced turn(s) each; ${report.scanned} transcript(s) opened` +
      (report.outsideWindow > 0 ? `, ${report.outsideWindow} older not read` : "") +
      ")",
  ];
  if (report.oneShot.sessions > 0) {
    lines.push(
      `  one-shots: ${report.oneShot.sessions} invocation(s) below the --min-turns floor, skipped —` +
        ` ${report.oneShot.turns} turn(s), ${usd(report.oneShot.cost)}. REAL SPEND, reported here rather`,
      "             than pooled into the window: a single scripted prompt is not the unit ADR-0323",
      "             measured. Raise --limit or set --min-turns 1 to fold them in.",
    );
  }
  if (report.scanBudgetHit) {
    lines.push(
      `  ⚠ SCAN BUDGET REACHED before the window filled — this is ${report.sessions.length} session(s), not`,
      `    ${report.window.limit}. Lower --min-turns or narrow --project.`,
    );
  }
  if (report.window.from !== undefined || report.window.to !== undefined) {
    lines.push(`  turns:    bounded to ${report.window.from ?? "(open)"} .. ${report.window.to ?? "(open)"}`);
  }
  if (report.window.startedAfter !== undefined || report.window.startedBefore !== undefined) {
    lines.push(
      `  started:  whole sessions beginning in ${report.window.startedAfter ?? "(open)"} .. ` +
        `${report.window.startedBefore ?? "(open)"}` +
        (report.outsideStartWindow > 0 ? ` — ${report.outsideStartWindow} session(s) began outside it` : ""),
    );
  }
  const spanFrom = report.sessions.map((s) => s.first).filter((s) => s !== "").sort()[0];
  const spanTo = report.sessions.map((s) => s.last).filter((s) => s !== "").sort().reverse()[0];
  lines.push(
    `  span:     ${spanFrom ?? "(none)"} .. ${spanTo ?? "(none)"}`,
    `  sample:   ${report.mainTurns} main-thread turn(s), ${report.subagentSpawns} subagent spawn(s) ` +
      `(${report.subagentTurns} turn(s)), ${report.toolCalls} tool call(s)`,
  );
  if (report.active.length > 0) {
    lines.push(
      `  EXCLUDED: ${report.active.length} session(s) still in flight (an in-flight session under-reports):`,
      ...report.active.slice(0, 5).map((id) => `              ${id}`),
    );
  }
  if (report.skippedLines > 0 || report.syntheticLines > 0) {
    lines.push(
      `  unusable: ${report.skippedLines} assistant line(s) skipped, ${report.syntheticLines} synthetic (zero-usage) line(s)`,
    );
  }
  lines.push("");

  if (report.mainTurns === 0 && report.subagentTurns === 0) {
    lines.push(
      "  NO PRICEABLE TURN IN THIS WINDOW — nothing is reported rather than a zeroed table that",
      "  would read as a finding. Widen `--limit`, lower `--min-turns`, drop `--from`/`--to`, or",
      "  check `--project`.",
      "",
    );
    return lines.join("\n").trimEnd();
  }

  // -- the headline ---------------------------------------------------------
  const mix: ReadonlyArray<readonly [string, number, number]> = [
    ["cache READ", report.axes.cacheRead, report.cost.cacheRead],
    ["cache write", report.axes.cacheWrite5m + report.axes.cacheWrite1h, report.cost.cacheWrite5m + report.cost.cacheWrite1h],
    ["output", report.axes.output, report.cost.output],
    ["input", report.axes.input, report.cost.input],
  ];
  const inputSide =
    report.cost.cacheRead + report.cost.cacheWrite5m + report.cost.cacheWrite1h + report.cost.input;
  lines.push(
    "## THE PRICE MIX  (the SPLIT is the finding — a total alone supports no decision)",
    "",
    `  ${"component".padEnd(12)} ${"tokens".padStart(8)} ${"cost".padStart(10)}  share`,
  );
  for (const [label, tok, money] of mix) {
    lines.push(`  ${label.padEnd(12)} ${tokens(tok).padStart(8)} ${usd(money).padStart(10)}  ${pct(money, report.totalCost)}`);
  }
  lines.push(
    `  ${"TOTAL".padEnd(12)} ${"".padStart(8)} ${usd(report.totalCost).padStart(10)}`,
    "",
    `  INPUT-SIDE: ${pct(inputSide, report.totalCost).trim()} of spend. ADR-0323 measured 89% over its own window;`,
    "  a materially different figure here OVERTAKES that prose (ADR-0139, correct in place).",
    "",
  );

  if (report.unpriced.length > 0) {
    lines.push(
      "  ⚠ UNPRICED MODELS — no rate in `MODEL_PRICES`, so their tokens are counted above but",
      "    their cost is NOT. The split understates these tiers until a rate is added:",
      ...report.unpriced.map((row) => `      ${row.model.padEnd(24)} ${row.turns} turn(s), ${tokens(row.tokens)} token(s)`),
      "",
    );
  }

  // -- phases ---------------------------------------------------------------
  lines.push(
    "## COST BY PHASE  (main thread only, bucketed by TRANSCRIPT POSITION — a session idles, and",
    "   idle time is free. Subagent spend is attributed by agent type below, not by phase.)",
    "",
  );
  for (const row of report.phases) {
    lines.push(
      `  ${row.phase.padEnd(12)} ${String(row.turns).padStart(5)} turn(s)  ${usd(row.cost).padStart(10)}  ${pct(row.cost, report.totalCost)}`,
    );
  }
  lines.push(
    "",
    "  markers: build starts at the first edit or `pnpm gate` / `storytree … build`;",
    "           landing starts at `gh pr create` / `git push`, and is terminal.",
    "",
  );

  // -- the two behavioural lines --------------------------------------------
  const measured = report.sessions.length;
  lines.push(
    "## MECHANICAL WAITING  (ADR-0323 D2 / `asset:mechanical-waiting-never-pays-context-rent`)",
    "",
    `  polling turns   ${String(report.polling.turns).padStart(5)} of ${report.mainTurns} main-thread  ` +
      `${usd(report.polling.cost).padStart(9)}  ${pct(report.polling.cost, report.totalCost)} of spend`,
    "",
    "  A polling turn is one whose EVERY tool call is a bash `sleep`, `gh pr checks` or `gh run watch`",
    "  — a full-context round-trip whose entire yield is a status line. Counted by command SHAPE: a",
    "  transcript cannot separate one deliberate status read from the second tick of a loop, so this",
    "  is generous in both directions equally, which is what a before/after comparison needs.",
    "",
    "## BASH CALLS BY PURPOSE  (ADR-0323 §4 — inspection should MOVE to a subagent, not vanish)",
    "",
    `  ${"population".padEnd(14)} ${"calls".padStart(6)} ${"inspection".padStart(11)} ${"polling".padStart(9)} ${"other".padStart(7)}`,
  );
  for (const [label, mix] of [
    ["main thread", report.commands],
    ["subagents", report.subagentCommands],
  ] as const) {
    lines.push(
      `  ${label.padEnd(14)} ${String(mix.calls).padStart(6)} ` +
        `${`${mix.inspection} (${mix.calls === 0 ? "0.0" : ((mix.inspection / mix.calls) * 100).toFixed(1)}%)`.padStart(11)} ` +
        `${String(mix.polling).padStart(9)} ${String(mix.other).padStart(7)}`,
    );
  }
  lines.push(
    "",
    "  inspection = a command whose every segment is a read verb (grep/rg/cat/head/tail/ls/find/…).",
    "  Its face cost is trivial; the cost that matters is that the result lands in context and is",
    "  re-read on every later turn — 10–40× face value at a 200-turn session's depth.",
    "",
  );

  // -- subagents ------------------------------------------------------------
  lines.push("## SUBAGENT COST BY AGENT TYPE  (disposable context — never re-charged to the parent)", "");
  if (report.agentTypes.length === 0) {
    lines.push(
      "  NO SUBAGENT SPAWNED IN THIS WINDOW. ADR-0323 D1 re-affirms",
      "  `asset:delegate-exploration-to-digest-subagents`; zero spawns is the shape it calls unheeded.",
      "",
    );
  } else {
    for (const row of report.agentTypes) {
      lines.push(
        `  ${row.agentType.padEnd(24)} ${String(row.spawns).padStart(3)} spawn(s) in ${String(row.sessions).padStart(2)}/${measured} session(s)  ` +
          `${String(row.turns).padStart(4)} turn(s)  ${usd(row.cost).padStart(9)}  ${pct(row.cost, report.totalCost)}  ` +
          `[${row.models.join(", ") || "(no model recorded)"}]`,
      );
    }
    lines.push(
      "",
      `  ADOPTION: ${measured - report.sessionsWithoutSubagents} of ${measured} session(s) spawned at least one subagent; ` +
        `${report.sessionsWithoutSubagents} spawned none.`,
      "  Spawn count alone hides this — thirteen spawns is one session's habit or thirteen sessions',",
      "  and only the second is adoption.",
      "",
    );
  }

  // -- context --------------------------------------------------------------
  lines.push(
    "## CONTEXT SIZE  (main-thread live window per turn — what a turn costs simply to EXIST)",
    "",
    `  median ${tokens(report.context.median).padStart(7)}   p90 ${tokens(report.context.p90).padStart(7)}   max ${tokens(report.context.max).padStart(7)}`,
    "",
    "  Cost scales with `turns × context size` — with session LENGTH, not with ceremony count",
    "  (ADR-0323). This figure and the turn count above are the two levers.",
    "",
  );

  // -- per session ----------------------------------------------------------
  lines.push("## PER SESSION  (newest first; `started` is the FIRST turn — what guidance was live)", "");
  for (const row of report.sessions.slice(0, 20)) {
    lines.push(
      `  ${row.sessionId}  ${String(row.turns).padStart(4)} turn(s)  ${usd(row.cost).padStart(9)}  ` +
        `${String(row.subagentSpawns).padStart(2)} sub  ${String(row.pollingTurns).padStart(3)} poll  ` +
        `${row.first.slice(0, 16)}  ${row.project}`,
    );
  }
  if (report.sessions.length > 20) lines.push(`  … ${report.sessions.length - 20} more`);
  lines.push("");

  return lines.join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// The verb
// ---------------------------------------------------------------------------

/** Sessions read when `--limit` is not given — ADR-0323's own window was ten. */
export const DEFAULT_SESSION_LIMIT = 10;
/** A transcript touched this recently is treated as in flight (its session under-reports). */
export const DEFAULT_ACTIVE_MINUTES = 10;
/**
 * Priced turns a transcript needs to count as a session. Two is the minimal, least-arbitrary cut
 * that separates a one-shot (one scripted prompt, one answer, done) from a working session; it is
 * a SELECTION floor, not a filter that hides spend — see the one-shot block in the report.
 */
export const DEFAULT_MIN_TURNS = 2;

export interface SessionCostOpts {
  readonly limit?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly startedAfter?: string | undefined;
  readonly startedBefore?: string | undefined;
  readonly project?: string | undefined;
  readonly minTurns?: string | undefined;
  /** Measure every storytree-shaped project directory, not just this checkout's. */
  readonly all?: boolean | undefined;
  readonly cwd: string;
  readonly nowMs: number;
  /** Injected for tests; production reads `resolveTranscriptDir()`. */
  readonly root?: string | undefined;
}

export function sessionCostCommand(opts: SessionCostOpts): Envelope {
  const limit = opts.limit === undefined ? DEFAULT_SESSION_LIMIT : Number(opts.limit);
  if (!Number.isInteger(limit) || limit <= 0) {
    return {
      ok: false,
      body: `--limit must be a positive integer; got "${String(opts.limit)}".`,
      next: ["storytree session-cost --help"],
    };
  }

  const minTurns = opts.minTurns === undefined ? DEFAULT_MIN_TURNS : Number(opts.minTurns);
  if (!Number.isInteger(minTurns) || minTurns < 1) {
    return {
      ok: false,
      body: `--min-turns must be a positive integer; got "${String(opts.minTurns)}".`,
      next: ["storytree session-cost --help"],
    };
  }

  const projectPrefix =
    opts.all === true ? "" : (opts.project ?? slugifyRepoPath(mainCheckoutRoot(opts.cwd)));

  const report = collectSessionCost({
    root: opts.root,
    projectPrefix,
    limit,
    minTurns,
    from: opts.from,
    to: opts.to,
    startedAfter: opts.startedAfter,
    startedBefore: opts.startedBefore,
    activeWithinMinutes: DEFAULT_ACTIVE_MINUTES,
    nowMs: opts.nowMs,
  });

  return {
    ok: true,
    body: renderSessionCost(report),
    next: [
      "storytree session-cost --limit 25   (a wider window)",
      "storytree session-cost --all        (every storytree project dir on this machine)",
      "storytree library artifact measure-session-cost-from-transcripts   (the method + its traps)",
      "storytree arc show session-cost-arc --pg   (what this instrument is for)",
    ],
  };
}

/** `storytree session-cost --help`. */
export function sessionCostHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree session-cost — what did our sessions cost, and on what? (ADR-0323 D4)",
      "",
      "  storytree session-cost [--limit <n>] [--min-turns <n>] [--from <iso>] [--to <iso>]",
      "                         [--started-after <iso>] [--started-before <iso>]",
      "                         [--project <prefix>] [--all]",
      "",
      "Prices a window of PAST sessions from the harness's own JSONL transcripts, per assistant",
      "turn, from the recorded `message.usage` and `message.model`. It reports the four-way price",
      "SPLIT (cache read / cache write / output / input), cost per phase, polling turns, bash calls",
      "by purpose, subagent cost per agent type with the model each ran on and how many sessions",
      "spawned it, and live-context size.",
      "",
      `  --limit         most-recent N completed sessions (default ${DEFAULT_SESSION_LIMIT}). A session whose`,
      `                  transcript changed in the last ${DEFAULT_ACTIVE_MINUTES} minutes is treated as IN FLIGHT and`,
      "                  excluded by name — an in-flight session under-reports.",
      `  --min-turns     priced turns a transcript needs to count as a session (default ${DEFAULT_MIN_TURNS}).`,
      "                  Machine-driven one-shots — one scripted prompt, one answer — otherwise fill",
      "                  the whole window by recency. They are NOT hidden: the report prints their",
      "                  count and aggregate cost. `--min-turns 1` folds them back in.",
      "  --from / --to   bound individual TURNS by ISO timestamp, after session selection.",
      "  --started-after / --started-before",
      "                  bound WHOLE SESSIONS by their first turn, instead of truncating them at the",
      "                  boundary. This is the segmentation flag for \"did behaviour change after X",
      "                  landed\": a session's habits are set by the guidance live when it STARTED,",
      "                  because CLAUDE.md / AGENTS.md / `.claude/agents/` are read once at start.",
      "  --project       project-directory prefix (default: this checkout's, so a worktree still",
      "                  measures the whole repo's sessions).",
      "  --all           every project directory under the transcript root.",
      "",
      "READS ONLY, and only this machine: transcripts live under `~/.claude/projects` (override with",
      "STORYTREE_TRANSCRIPT_DIR), a per-user path OUTSIDE the repo — so a finding is only as wide as",
      "the machine it was measured on. Say so when you publish one.",
      "",
      "THE TRAP: summing only `input_tokens` reports ~0% input cost. The real figure — 89% in",
      "ADR-0323's window — is `cache_read_input_tokens` + `cache_creation_input_tokens`. An",
      "instrument that misses this reports the OPPOSITE of the truth.",
      "",
      "DOLLARS ARE A WEIGHT PROXY, NOT A BILL (ADR-0030 / ADR-0232 — subscription-funded leaves).",
      "Token ratios are measured and exact; the dollars only let four components be compared.",
      "",
      "NOT A GATE RUNG, on purpose (ADR-0323 Unresolved): ADR-0168 D1 found a compliance gate",
      "prices a ceremony toward theater, and a cost gate would be gamed by splitting sessions.",
    ].join("\n"),
    next: [
      "storytree session-cost",
      "storytree library artifact measure-session-cost-from-transcripts",
      "storytree arc show session-cost-arc --pg",
    ],
  };
}
