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

/** A maximal run of CONSECUTIVE polling turns inside one transcript. */
export interface PollingRun {
  /** Index of the first turn of the run, within the transcript's windowed turns. */
  readonly start: number;
  readonly length: number;
}

/**
 * A run of at least this many consecutive polling turns is a LOOP; a shorter one is a status check.
 *
 * Two is the whole signature, and it is the least arbitrary cut available. A session that wants a
 * status reads it ONCE — `gh pr checks` after opening a PR is a deliberate, correct, single act. It
 * is the SECOND consecutive full-context round-trip that says the session is standing in a loop
 * doing by hand what `run_in_background` plus a completion notification does for free
 * (`asset:mechanical-waiting-never-pays-context-rent`, ADR-0323 D2). Nothing about "wait then look"
 * is wasteful until it repeats.
 */
export const LOOP_RUN_MIN = 2;

/**
 * The maximal runs of consecutive polling turns in one transcript's turns.
 *
 * WHY THIS EXISTS, AND WHAT IT FIXES. {@link isPollingTurn} counts by command SHAPE, and is
 * deliberately generous: a single deliberate `gh pr checks` scores identically to the second tick of
 * a `sleep 300; tail` loop. That generosity is exactly right for the before/after comparison it was
 * built for — it is equally generous on both sides of a cut point, so the DIFFERENCE is evidence —
 * and exactly wrong for the question `session-cost-arc`'s end-state 2 actually asks, which is
 * whether the LOOP is gone. A window can hold a fixed count of polling turns whose every instance is
 * one isolated status read, and that window has no loop in it at all.
 *
 * ADJACENCY IS THE INSTRUMENT, AND ITS LIMITATION IS DELIBERATE. A turn that does real work between
 * two polls breaks the run, so `poll → read the failing CI log → poll` reads here as two isolated
 * checks rather than one loop. That is the conservative direction on purpose: it can only
 * UNDER-report looping, so a loop count this instrument reports is a floor, and "the loops are gone"
 * is the claim it is least able to manufacture.
 */
export function pollingRuns(turns: readonly Turn[]): readonly PollingRun[] {
  const runs: PollingRun[] = [];
  let start = -1;
  for (const [index, turn] of turns.entries()) {
    if (isPollingTurn(turn)) {
      if (start === -1) start = index;
      continue;
    }
    if (start !== -1) {
      runs.push({ start, length: index - start });
      start = -1;
    }
  }
  if (start !== -1) runs.push({ start, length: turns.length - start });
  return runs;
}

// ---------------------------------------------------------------------------
// Spawn overlap — is the factory's delegation already concurrent?
// ---------------------------------------------------------------------------

/**
 * Spawns a session needs before a deterministic fan-out primitive would have anything to fan out.
 *
 * Three, not two: two spawns is a pair a session can hold in its head, and the per-item decision
 * turns a workflow removes are two. The question a fan-out engine has to answer is whether a
 * POPULATION of sessions repeatedly dispatches enough items for the control flow to be worth
 * writing, and three is the smallest count at which "iterate over a list" is a truer description of
 * the work than "delegate a thing, then delegate another thing".
 */
export const FANOUT_MIN_SPAWNS = 3;

/**
 * Tool names that DISPATCH a delegate. Measured from this machine's own transcripts rather than
 * assumed: `Agent` is what the harness emits (681 calls across the storytree history on 2026-08-09),
 * `Task` is its earlier name and is kept so an older window still counts. `SendMessage` continues an
 * ALREADY-RUNNING delegate and is deliberately not here — it starts nothing, so counting it would
 * inflate the very number a fan-out primitive is supposed to reduce.
 */
export const SPAWN_TOOLS: ReadonlySet<string> = new Set(["Agent", "Task"]);

/** How many delegates one main-thread turn dispatched. */
export function spawnsDispatched(turn: Turn): number {
  let count = 0;
  for (const name of turn.toolNames) if (SPAWN_TOOLS.has(name)) count++;
  return count;
}

/**
 * The orchestrator's per-item DECISION turns — the prize left over when the spawns already overlap.
 *
 * WHY THIS IS THE OTHER HALF OF THE QUESTION. A deterministic fan-out primitive replaces N
 * orchestrator decision turns with N spawns plus zero-cost control flow. If the spawns are already
 * concurrent, that decision-turn saving is the ONLY thing left to buy — so it has to be sized rather
 * than waved at. And it is directly observable: concurrency in this harness comes from emitting
 * several spawn blocks in ONE assistant turn, so a turn that dispatched four delegates has already
 * collapsed four decision turns into one, with no engine involved.
 *
 * THE RESIDUAL is `turns − sessions`: what would be saved if every session's dispatches collapsed to
 * a single turn. It is an upper bound and a generous one, because it assumes a session could have
 * known its whole delegation plan up front — which is exactly what a session discovering work cannot
 * do.
 */
export interface DispatchTotals {
  /** Main-thread turns carrying at least one spawn call. */
  readonly turns: number;
  /** Spawn calls across those turns. */
  readonly calls: number;
  /** Turns carrying 2+ spawn calls — a fan-out already batched into one turn. */
  readonly batchedTurns: number;
  /** Spawn calls that arrived inside a batched turn. */
  readonly batchedCalls: number;
  /** The widest single dispatch anywhere in the window. */
  readonly widest: number;
  /** Sessions that dispatched at least once. */
  readonly sessions: number;
  /** What the dispatch turns themselves cost. */
  readonly cost: number;
  /**
   * Spawn calls made from INSIDE a delegate — a delegate spawning a delegate.
   *
   * This is why {@link OverlapTotals.spawns} exceeds {@link calls}: a sub-subagent's transcript
   * lands in the parent SESSION's `subagents/` directory, but its dispatch turn is in another
   * delegate's transcript and was never a main-thread decision. Reported so the difference between
   * the two counts is accounted for rather than read as an instrument fault — and because a
   * main-thread fan-out primitive could not have batched these at all.
   *
   * It EXPLAINS the gap; it does not close it arithmetically. A delegate dispatched here that
   * produced no priced turn inside the window is a call with no transcript, so the sum can overshoot
   * the spawn count. The direction is the finding, never an identity to reconcile.
   */
  readonly subagentCalls: number;
}

/**
 * One delegate's live interval, read off its OWN transcript's first and last priced turn.
 *
 * THIS IS A FLOOR ON THE DURATION, IN A DIRECTION THAT MATTERS. The endpoints are the timestamps of
 * turns the delegate was billed for, so the interval excludes dispatch latency before turn one and
 * the generation time of the last turn itself. Both the per-spawn duration and the union are
 * shortened by the same omission, so the SHARE this instrument reports is roughly unbiased while the
 * absolute minutes are understated.
 */
export interface SpawnInterval {
  readonly agentType: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** What a set of spawn intervals says about whether they were already running at the same time. */
export interface OverlapStats {
  readonly spawns: number;
  /**
   * Spawns whose transcript holds ONE priced turn, so their interval is a point of zero length.
   *
   * A point can never overlap anything, so these bias every figure here toward "serial". They are
   * counted separately rather than dropped, because a window made mostly of one-turn delegates would
   * make a serial verdict an artifact of the instrument rather than a finding.
   */
  readonly pointSpawns: number;
  /** Σ of each spawn's own duration — the wall clock delegation would take if nothing overlapped. */
  readonly serialMs: number;
  /** Wall clock during which at LEAST one delegate was live — the union of the intervals. */
  readonly unionMs: number;
  /**
   * The longest single spawn. Amdahl's irreducible part: a perfect batcher starts everything at once
   * and still waits for the slowest chain, so no fan-out primitive can ever compress below this.
   */
  readonly criticalPathMs: number;
  /** Most delegates live at one instant. 1 means the session never had two running together. */
  readonly maxConcurrency: number;
  /** Spawns sharing a positive-length instant with at least one other spawn. */
  readonly overlappingSpawns: number;
}

const EMPTY_OVERLAP: OverlapStats = {
  spawns: 0,
  pointSpawns: 0,
  serialMs: 0,
  unionMs: 0,
  criticalPathMs: 0,
  maxConcurrency: 0,
  overlappingSpawns: 0,
};

/**
 * Reduces one session's spawn intervals to the facts a fan-out decision turns on.
 *
 * WHY THIS IS A MEASUREMENT AND NOT A JUDGEMENT. "Would a workflow help" reads like an architecture
 * question, but its load-bearing premise — that a session's delegates run one after another, so
 * there is an interval to compress — is written on disk: every subagent transcript carries its own
 * per-turn timestamps. If the spawns already overlap, a batcher buys nothing on wall clock and the
 * only prize left is the orchestrator's per-item decision turns, which is a much smaller and
 * separately-sized thing.
 *
 * OVERLAP REQUIRES POSITIVE SHARED LENGTH (`a.start < b.end && b.start < a.end`), so intervals that
 * merely touch at an instant are serial. That is the conservative reading for the concurrency
 * claim — it can only UNDER-report overlap, which is the honest bias here, because "already
 * concurrent" is the answer that kills the work and an instrument should not be able to manufacture
 * the convenient result.
 */
export function spawnOverlap(intervals: readonly SpawnInterval[]): OverlapStats {
  if (intervals.length === 0) return EMPTY_OVERLAP;

  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  let serialMs = 0;
  let criticalPathMs = 0;
  let pointSpawns = 0;
  for (const span of sorted) {
    const duration = Math.max(0, span.endMs - span.startMs);
    serialMs += duration;
    criticalPathMs = Math.max(criticalPathMs, duration);
    if (duration === 0) pointSpawns++;
  }

  // The union, by merging the sorted intervals. Zero-length spans extend nothing.
  let unionMs = 0;
  let openStart = Number.NaN;
  let openEnd = Number.NaN;
  for (const span of sorted) {
    if (Number.isNaN(openStart)) {
      openStart = span.startMs;
      openEnd = span.endMs;
      continue;
    }
    if (span.startMs <= openEnd) {
      openEnd = Math.max(openEnd, span.endMs);
      continue;
    }
    unionMs += Math.max(0, openEnd - openStart);
    openStart = span.startMs;
    openEnd = span.endMs;
  }
  if (!Number.isNaN(openStart)) unionMs += Math.max(0, openEnd - openStart);

  let maxConcurrency = 0;
  let overlappingSpawns = 0;
  for (const [i, a] of sorted.entries()) {
    let live = 0;
    let overlaps = false;
    for (const [j, b] of sorted.entries()) {
      // Count everything live at `a`'s start instant, `a` included — the sweep's only sample points
      // are interval starts, which is sufficient because concurrency can only RISE at a start.
      if (b.startMs <= a.startMs && a.startMs < b.endMs) live++;
      // Positive SHARED LENGTH, so intervals that merely touch are serial and a zero-length point
      // sitting inside another spawn is not evidence of concurrency — its true duration is unknown.
      if (i !== j && Math.min(a.endMs, b.endMs) > Math.max(a.startMs, b.startMs)) overlaps = true;
    }
    maxConcurrency = Math.max(maxConcurrency, live);
    if (overlaps) overlappingSpawns++;
  }
  // A window of nothing but point spawns has no live instant at all, but it did have delegates.
  if (maxConcurrency === 0) maxConcurrency = 1;

  return {
    spawns: sorted.length,
    pointSpawns,
    serialMs,
    unionMs,
    criticalPathMs,
    maxConcurrency,
    overlappingSpawns,
  };
}

/** The window-wide roll-up of {@link spawnOverlap}, plus the population a fan-out would serve. */
export interface OverlapTotals {
  readonly spawns: number;
  readonly pointSpawns: number;
  readonly serialMs: number;
  readonly unionMs: number;
  /** Σ over sessions of that session's own critical path — never one global maximum. */
  readonly criticalPathMs: number;
  /**
   * Σ over sessions of `union − criticalPath`: the wall clock a PERFECT fan-out could remove.
   *
   * This is the ceiling and nothing else is. It is summed per session because sessions run on
   * different clocks — a delegate in one session cannot be batched with a delegate in another.
   */
  readonly compressibleMs: number;
  /** The highest concurrency any single measured session reached. */
  readonly maxConcurrency: number;
  /** Sessions where two delegates were live at once — already fanning out, with no engine. */
  readonly sessionsWithOverlap: number;
  /** Sessions with 2+ spawns: the only ones where overlap was even possible. */
  readonly sessionsMultiSpawn: number;
  /** Sessions with {@link FANOUT_MIN_SPAWNS}+ spawns — the population a primitive would serve. */
  readonly sessionsFanoutCandidate: number;
  /**
   * Main-thread turns whose timestamp fell inside a live spawn.
   *
   * The other half of "is the thread blocked". A session whose main thread keeps working while a
   * delegate runs is already overlapping its OWN work with the delegation, and gains nothing from a
   * batcher even when the spawns themselves are serial.
   */
  readonly mainTurnsDuringSpawns: number;
  /** Σ of measured sessions' first-turn→last-turn spans — the Amdahl denominator. */
  readonly sessionWallMs: number;
  /** Spawns-per-session distribution, ascending; the shape behind the ≥3 population count. */
  readonly histogram: ReadonlyArray<{ readonly spawns: number; readonly sessions: number }>;
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
// The guidance surface — ADR-0323 D3's budget, in the one unit that is exact
// ---------------------------------------------------------------------------

/**
 * The ceiling on the eagerly-loaded, REPO-OWNED session-start guidance surface: 96 KiB across
 * `CLAUDE.md` and the harness `MEMORY.md`, together (ADR-0330 D1, setting the number ADR-0323 D3
 * deferred).
 *
 * IT IS DENOMINATED IN BYTES BECAUSE BYTES ARE EXACT. Tokens are the unit the bill is in, but
 * counting them needs a tokenizer this repo does not carry, and a budget whose measurement drifts
 * with an estimator is not a budget. Bytes are `wc -c`, identical on every machine and in every
 * checkout, so two readings of this number are always comparable — which is the only property a
 * ceiling has to have.
 *
 * THE NUMBER WAS CHOSEN AS A SHARE OF SESSION SPEND, then converted once. At the marginal price
 * this instrument measures — ~$0.115 per 1,000 eagerly-loaded tokens per session — and ~3.8
 * chars/token for this repo's markdown, 96 KiB is ≈25.9k tokens ≈ $2.98 on a ~$30 session: a TENTH
 * of what a session costs, spent on the factory's own standing instructions. That is the trade the
 * budget encodes. Re-derive it by re-running `storytree session-cost` when the rates, the turn
 * counts or the delegation habit move (ADR-0323 D4 makes that re-run the check on this prose).
 *
 * WHAT IS NOT IN IT. `AGENTS.md` is the CODEX runtime's root guidance (ADR-0232) and a Claude
 * session's preamble does not carry it — verified against a live session's own injected context,
 * and correcting ADR-0323 §1, which listed it. The system prompt and the tool definitions are the
 * larger half of the measured floor and are the harness's, not ours; budgeting what we cannot edit
 * would make the number unactionable.
 */
export const GUIDANCE_BUDGET_BYTES = 98_304;

/**
 * Bytes per token for this repo's guidance markdown, used ONLY to state the budget in the unit the
 * bill uses. Back-solved from ADR-0323 §1's own `CLAUDE.md` figure (17.8k tokens) against the file's
 * git-recorded size on the day it was measured (~67.5 KB), so it is calibrated on this corpus rather
 * than borrowed from general prose. It is a CONVERSION with maybe ±10% in it — never let a decision
 * turn on a token figure derived through it when the byte figure would do.
 */
export const GUIDANCE_CHARS_PER_TOKEN = 3.8;

/** One file on the eagerly-loaded surface, and what it weighs here. */
export interface GuidanceFile {
  readonly label: string;
  readonly path: string;
  /**
   * Size in bytes, or `null` when the file is ABSENT. Absent is a determined ZERO, not an unknown:
   * the harness loads nothing for a file that does not exist, so that machine's preamble really is
   * smaller. `MEMORY.md` is per-user and per-machine and is legitimately missing in CI and on a
   * fresh checkout — reporting that as undetermined would WARN on every clean environment.
   */
  readonly bytes: number | null;
}

export interface GuidanceSurface {
  readonly files: readonly GuidanceFile[];
  /** Total bytes actually present. */
  readonly bytes: number;
  readonly budget: number;
  /** Bytes over the ceiling; zero when within it. */
  readonly overBy: number;
  /** The same total in tokens, via {@link GUIDANCE_CHARS_PER_TOKEN} — a conversion, not a count. */
  readonly approxTokens: number;
}

/** Where the eagerly-loaded surface lives for a given checkout and home directory. */
export function guidanceSurfacePaths(
  checkoutDir: string,
  homeDir: string,
): ReadonlyArray<{ readonly label: string; readonly path: string }> {
  return [
    { label: "CLAUDE.md", path: path.join(checkoutDir, "CLAUDE.md") },
    {
      // Keyed to the MAIN checkout, not the worktree: the harness files memory per project, and a
      // worktree shares its parent's. `mainCheckoutRoot` is the same fold the transcript walk uses.
      label: "MEMORY.md",
      path: path.join(
        homeDir,
        ".claude",
        "projects",
        slugifyRepoPath(mainCheckoutRoot(checkoutDir)),
        "memory",
        "MEMORY.md",
      ),
    },
  ];
}

/** Weigh the surface. Reads sizes only — never the contents. */
export function measureGuidanceSurface(
  files: ReadonlyArray<{ readonly label: string; readonly path: string }>,
  budget: number = GUIDANCE_BUDGET_BYTES,
): GuidanceSurface {
  const measured: GuidanceFile[] = files.map((file) => {
    try {
      const stat = fs.statSync(file.path);
      return { label: file.label, path: file.path, bytes: stat.isFile() ? stat.size : null };
    } catch {
      return { label: file.label, path: file.path, bytes: null };
    }
  });
  const bytes = measured.reduce((sum, file) => sum + (file.bytes ?? 0), 0);
  return {
    files: measured,
    bytes,
    budget,
    overBy: Math.max(0, bytes - budget),
    approxTokens: Math.round(bytes / GUIDANCE_CHARS_PER_TOKEN),
  };
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
  /** Of those, the ones inside a run of {@link LOOP_RUN_MIN} or more — the loop signature. */
  readonly pollingLoopTurns: number;
  /** Context tokens on this session's FIRST main-thread turn — preamble + its opening prompt. */
  readonly firstTurnContext: number;
  /** First→last main-thread turn. Includes idle, which is free — see {@link OverlapTotals}. */
  readonly wallMs: number;
  /** This session's delegation, from its subagents' own timestamps ({@link spawnOverlap}). */
  readonly overlap: OverlapStats;
}

/** Turns spent purely waiting on a machine, and what that cost. */
export interface PollingTotals {
  readonly turns: number;
  readonly cost: number;
  /**
   * Polling turns that sat ALONE — a maximal run of exactly one. A deliberate single status read;
   * not the pattern ADR-0323 D2 retired.
   */
  readonly isolatedTurns: number;
  readonly isolatedCost: number;
  /** Polling turns inside a run of {@link LOOP_RUN_MIN}+ consecutive turns — the LOOP. */
  readonly loopedTurns: number;
  readonly loopedCost: number;
  /** Maximal consecutive runs of length {@link LOOP_RUN_MIN} or more, across the window. */
  readonly loops: number;
  readonly longestRun: number;
  /** Measured sessions containing at least one polling turn of any kind. */
  readonly sessionsPolling: number;
  /** Measured sessions containing at least one LOOP. The adoption figure for D2. */
  readonly sessionsLooping: number;
}

/**
 * What a session pays before it does anything — the eagerly-loaded preamble, measured rather than
 * estimated (ADR-0323 D3, whose budget number this block is what makes arguable).
 *
 * MEASURED, NOT COUNTED FROM THE FILES. A transcript never records the system prompt, the tool
 * definitions, `CLAUDE.md` or `MEMORY.md` — the harness injects all four at request-build time — but
 * the FIRST assistant turn's `usage` prices every one of them, because turn one's live context IS
 * the preamble plus that session's opening prompt and hook output. So the floor is read off the
 * bill, and no tokenizer, no file list and no guess about what the harness loads enters the number.
 *
 * WHY THE MINIMUM IS THE FLOOR. Every first-turn context over-states the fixed part by exactly that
 * session's opening prompt. The smallest one in a population therefore bounds the fixed preamble
 * most tightly from above, and is the closest thing to a direct reading of it. It is an UPPER bound
 * on the fixed surface and a LOWER bound on what any session actually paid — say which you mean.
 */
export interface PreambleTotals {
  /** Tightest observed main-thread first-turn context in the measured window. */
  readonly mainFloor: number;
  readonly mainMedian: number;
  /**
   * The same over transcripts skipped by `--min-turns` — machine-driven one-shots, whose opening
   * prompt is a single scripted line. They bound the fixed preamble far more tightly than a working
   * session can, which is the one thing this otherwise-uninteresting population is good for.
   */
  readonly oneShotFloor: number;
  /** Tightest observed SUBAGENT first-turn context — a delegate pays its own preamble (ADR-0325). */
  readonly subagentFloor: number;
  readonly subagentTranscripts: number;
  /**
   * What carrying 1,000 extra eagerly-loaded tokens would have cost PER SESSION over this window.
   *
   * The model is deliberately the cheapest defensible one: each transcript pays the added tokens
   * ONCE at its tier's cache-WRITE rate and then re-reads them at the cache-READ rate on every
   * later turn. It therefore under-states — a cache entry expires and is re-written, and every
   * subagent spawn pays a whole fresh write — so treat it as a floor on the marginal price, which
   * is the honest direction for a number that argues AGAINST adding text.
   */
  readonly marginalPerKTokPerSession: number;
  /** What the measured floors themselves cost across the whole window, on the same model. */
  readonly floorCost: number;
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
  /** What every session pays before it does anything (ADR-0323 D3). */
  readonly preamble: PreambleTotals;
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
  /** Whether the factory's delegation is ALREADY concurrent, and the ceiling if it is not. */
  readonly overlap: OverlapTotals;
  /** How delegates were dispatched — the per-item decision turns a fan-out primitive would remove. */
  readonly dispatch: DispatchTotals;
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
  const oneShotFirstTurns: number[] = [];
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
      // A one-shot's opening prompt is one scripted line, so its first-turn context is the tightest
      // reading of the fixed preamble this machine offers. Captured even though the session itself
      // is out of the window — the spend is excluded, the OBSERVATION is not.
      const opening = windowed[0];
      if (opening !== undefined) oneShotFirstTurns.push(contextTokens(opening.axes));
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
  let isolatedTurns = 0;
  let isolatedCost = 0;
  let loopedTurns = 0;
  let loopedCost = 0;
  let loops = 0;
  let longestRun = 0;
  let sessionsPolling = 0;
  let sessionsLooping = 0;
  let sessionsWithoutSubagents = 0;
  let overlapSpawns = 0;
  let overlapPointSpawns = 0;
  let overlapSerialMs = 0;
  let overlapUnionMs = 0;
  let overlapCriticalMs = 0;
  let overlapCompressibleMs = 0;
  let overlapMaxConcurrency = 0;
  let sessionsWithOverlap = 0;
  let sessionsMultiSpawn = 0;
  let sessionsFanoutCandidate = 0;
  let mainTurnsDuringSpawns = 0;
  let sessionWallMs = 0;
  const spawnHistogram = new Map<number, number>();
  let dispatchTurns = 0;
  let dispatchCalls = 0;
  let dispatchBatchedTurns = 0;
  let dispatchBatchedCalls = 0;
  let dispatchWidest = 0;
  let dispatchSessions = 0;
  let dispatchCost = 0;
  let dispatchSubagentCalls = 0;
  const mainFirstTurns: number[] = [];
  const subFirstTurns: number[] = [];
  /** One row per transcript: what it would cost to make every one of them carry more preamble. */
  const shapes: Array<{ turns: number; tier: string | undefined; main: boolean }> = [];
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
    let sessionLoopTurns = 0;
    // Which run each polling turn belongs to, so its cost lands on the isolated or the looped line.
    // Computed BEFORE the pricing walk because a run is a property of the whole transcript, and a
    // turn cannot know from the inside whether the next turn continues it.
    const runs = pollingRuns(windowed);
    const loopedIndices = new Set<number>();
    for (const run of runs) {
      longestRun = Math.max(longestRun, run.length);
      if (run.length < LOOP_RUN_MIN) continue;
      loops++;
      sessionLoopTurns += run.length;
      for (let i = run.start; i < run.start + run.length; i++) loopedIndices.add(i);
    }

    let sessionDispatchTurns = 0;
    const openingContext = windowed[0] === undefined ? 0 : contextTokens(windowed[0].axes);
    if (windowed[0] !== undefined) mainFirstTurns.push(openingContext);
    shapes.push({ turns: windowed.length, tier: windowed[0]?.tier, main: true });

    for (const [index, turn] of windowed.entries()) {
      const turnCost = account(turn);
      sessionCost += turnCost;
      sessionTurns++;
      mainTurns++;
      contexts.push(contextTokens(turn.axes));
      tallyCommands(mainMix, turn);
      const dispatched = spawnsDispatched(turn);
      if (dispatched > 0) {
        dispatchTurns++;
        sessionDispatchTurns++;
        dispatchCalls += dispatched;
        dispatchCost += turnCost;
        dispatchWidest = Math.max(dispatchWidest, dispatched);
        if (dispatched >= 2) {
          dispatchBatchedTurns++;
          dispatchBatchedCalls += dispatched;
        }
      }
      if (isPollingTurn(turn)) {
        pollingTurnCount++;
        pollingCost += turnCost;
        sessionPolling++;
        if (loopedIndices.has(index)) {
          loopedTurns++;
          loopedCost += turnCost;
        } else {
          isolatedTurns++;
          isolatedCost += turnCost;
        }
      }
      const phase = phases[index] ?? "orientation";
      const bucket = phaseTotals.get(phase);
      if (bucket !== undefined) {
        bucket.turns++;
        bucket.cost += turnCost;
      }
    }
    if (sessionPolling > 0) sessionsPolling++;
    if (sessionLoopTurns > 0) sessionsLooping++;
    if (sessionDispatchTurns > 0) dispatchSessions++;

    let sessionSpawns = 0;
    // Per SESSION, so an agent type spawned five times by one session counts once toward adoption.
    const typesThisSession = new Set<string>();
    const intervals: SpawnInterval[] = [];
    for (const sub of session.subagentFiles) {
      const subRead = readTranscript(sub.file);
      skippedLines += subRead.skipped;
      syntheticLines += subRead.synthetic;
      const subTurns = subRead.turns.filter((t) => inWindow(t.at, opts.from, opts.to));
      if (subTurns.length === 0) continue;
      subagentSpawns++;
      sessionSpawns++;
      const subOpening = subTurns[0];
      if (subOpening !== undefined) subFirstTurns.push(contextTokens(subOpening.axes));
      shapes.push({ turns: subTurns.length, tier: subTurns[0]?.tier, main: false });
      const agentType = readAgentType(sub.metaFile);
      const subLast = subTurns[subTurns.length - 1];
      const startMs = subOpening === undefined ? Number.NaN : Date.parse(subOpening.at);
      const endMs = subLast === undefined ? Number.NaN : Date.parse(subLast.at);
      // An unparseable timestamp is dropped from the OVERLAP figures only — the spawn still counts
      // and its cost is still priced. A guessed interval would be worse than a missing one.
      if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
        intervals.push({ agentType, startMs, endMs: Math.max(startMs, endMs) });
      }
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
        dispatchSubagentCalls += spawnsDispatched(turn);
        sessionCost += turnCost;
        sessionTurns++;
        subagentTurns++;
      }
      agentTotals.set(agentType, row);
    }
    if (sessionSpawns === 0) sessionsWithoutSubagents++;

    const first = windowed[0]?.at ?? "";
    const last = windowed[windowed.length - 1]?.at ?? "";
    const firstMs = Date.parse(first);
    const lastMs = Date.parse(last);
    const wallMs = Number.isFinite(firstMs) && Number.isFinite(lastMs) ? Math.max(0, lastMs - firstMs) : 0;

    const overlap = spawnOverlap(intervals);
    overlapSpawns += overlap.spawns;
    overlapPointSpawns += overlap.pointSpawns;
    overlapSerialMs += overlap.serialMs;
    overlapUnionMs += overlap.unionMs;
    overlapCriticalMs += overlap.criticalPathMs;
    // Per SESSION, because delegates in different sessions run on different clocks and cannot be
    // batched with each other. Summing a global union would invent a fan-out nobody could build.
    overlapCompressibleMs += Math.max(0, overlap.unionMs - overlap.criticalPathMs);
    overlapMaxConcurrency = Math.max(overlapMaxConcurrency, overlap.maxConcurrency);
    if (overlap.overlappingSpawns > 0) sessionsWithOverlap++;
    if (sessionSpawns >= 2) sessionsMultiSpawn++;
    if (sessionSpawns >= FANOUT_MIN_SPAWNS) sessionsFanoutCandidate++;
    spawnHistogram.set(sessionSpawns, (spawnHistogram.get(sessionSpawns) ?? 0) + 1);
    sessionWallMs += wallMs;
    for (const turn of windowed) {
      const atMs = Date.parse(turn.at);
      if (!Number.isFinite(atMs)) continue;
      if (intervals.some((span) => span.startMs < atMs && atMs < span.endMs)) mainTurnsDuringSpawns++;
    }

    sessions.push({
      project: session.project,
      sessionId: session.sessionId,
      turns: sessionTurns,
      cost: sessionCost,
      first,
      last,
      subagentSpawns: sessionSpawns,
      pollingTurns: sessionPolling,
      pollingLoopTurns: sessionLoopTurns,
      firstTurnContext: openingContext,
      wallMs,
      overlap,
    });
  }

  contexts.sort((a, b) => a - b);
  mainFirstTurns.sort((a, b) => a - b);
  subFirstTurns.sort((a, b) => a - b);
  oneShotFirstTurns.sort((a, b) => a - b);

  /**
   * What making EVERY transcript in this window carry `carried` more eagerly-loaded tokens would
   * have cost: one cache write per transcript, then a cache read on every later turn.
   */
  const priceCarried = (carried: number, over: typeof shapes): number => {
    let total = 0;
    for (const shape of over) {
      const price = shape.tier === undefined ? undefined : MODEL_PRICES[shape.tier];
      if (price === undefined) continue;
      total += (carried * price.cacheWrite1h) / 1_000_000;
      total += (carried * Math.max(0, shape.turns - 1) * price.cacheRead) / 1_000_000;
    }
    return total;
  };
  const measuredSessions = Math.max(1, selected.length);
  const mainFloor = mainFirstTurns[0] ?? 0;
  const subagentFloor = subFirstTurns[0] ?? 0;

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
    polling: {
      turns: pollingTurnCount,
      cost: pollingCost,
      isolatedTurns,
      isolatedCost,
      loopedTurns,
      loopedCost,
      loops,
      longestRun,
      sessionsPolling,
      sessionsLooping,
    },
    preamble: {
      mainFloor,
      mainMedian: quantile(mainFirstTurns, 0.5),
      oneShotFloor: oneShotFirstTurns[0] ?? 0,
      subagentFloor,
      subagentTranscripts: subFirstTurns.length,
      marginalPerKTokPerSession: priceCarried(1_000, shapes) / measuredSessions,
      floorCost:
        priceCarried(
          mainFloor,
          shapes.filter((s) => s.main),
        ) +
        priceCarried(
          subagentFloor,
          shapes.filter((s) => !s.main),
        ),
    },
    commands: { ...mainMix },
    subagentCommands: { ...subMix },
    sessionsWithoutSubagents,
    overlap: {
      spawns: overlapSpawns,
      pointSpawns: overlapPointSpawns,
      serialMs: overlapSerialMs,
      unionMs: overlapUnionMs,
      criticalPathMs: overlapCriticalMs,
      compressibleMs: overlapCompressibleMs,
      maxConcurrency: overlapMaxConcurrency,
      sessionsWithOverlap,
      sessionsMultiSpawn,
      sessionsFanoutCandidate,
      mainTurnsDuringSpawns,
      sessionWallMs,
      histogram: [...spawnHistogram.entries()]
        .map(([spawns, count]) => ({ spawns, sessions: count }))
        .sort((a, b) => a.spawns - b.spawns),
    },
    dispatch: {
      turns: dispatchTurns,
      calls: dispatchCalls,
      batchedTurns: dispatchBatchedTurns,
      batchedCalls: dispatchBatchedCalls,
      widest: dispatchWidest,
      sessions: dispatchSessions,
      cost: dispatchCost,
      subagentCalls: dispatchSubagentCalls,
    },
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

function mins(ms: number): string {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 60_000).toFixed(1)}m`;
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
    `    in LOOPS      ${String(report.polling.loopedTurns).padStart(5)} turn(s) in ${report.polling.loops} run(s) of ${LOOP_RUN_MIN}+  ` +
      `${usd(report.polling.loopedCost).padStart(9)}  ${pct(report.polling.loopedCost, report.totalCost)} of spend` +
      `  — longest run ${report.polling.longestRun}`,
    `    ISOLATED      ${String(report.polling.isolatedTurns).padStart(5)} turn(s) standing alone  ` +
      `${usd(report.polling.isolatedCost).padStart(9)}  ${pct(report.polling.isolatedCost, report.totalCost)} of spend`,
    `    sessions      ${report.polling.sessionsPolling} of ${measured} polled at all; ` +
      `${report.polling.sessionsLooping} of ${measured} LOOPED`,
    "",
    "  A polling turn is one whose EVERY tool call is a bash `sleep`, `gh pr checks` or `gh run watch`",
    "  — a full-context round-trip whose entire yield is a status line. Counted by command SHAPE: a",
    "  transcript cannot separate one deliberate status read from the second tick of a loop, so this",
    "  is generous in both directions equally, which is what a before/after comparison needs.",
    "",
    `  THE SPLIT IS WHAT JUDGES THE PATTERN, and the total is what compares two windows. ${LOOP_RUN_MIN}+`,
    "  CONSECUTIVE polling turns is the LOOP — the hand-rolled `run_in_background` that ADR-0323 D2",
    "  retired. One polling turn standing alone is a deliberate status read and was never the target:",
    "  a session that checks `gh pr checks` once after opening a PR has done nothing wrong. So a flat",
    "  polling count can stay non-zero while the retired PATTERN is gone, and only this split can",
    "  tell those apart. Adjacency UNDER-reports (real work between two polls breaks the run), so the",
    "  loop line is a floor: it cannot manufacture the conclusion that the loops have stopped.",
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

  // -- spawn overlap --------------------------------------------------------
  const ov = report.overlap;
  lines.push(
    "## SPAWN OVERLAP  (does the factory ALREADY fan out? — the ceiling on any batching primitive)",
    "",
  );
  if (ov.spawns === 0) {
    lines.push(
      "  NO SPAWN CARRIED A MEASURABLE INTERVAL IN THIS WINDOW. With nothing delegated there is",
      "  nothing to batch, and a fan-out primitive would have no population to serve.",
      "",
    );
  } else {
    const idealMs = Math.max(0, ov.sessionWallMs - ov.compressibleMs);
    const speedup = idealMs === 0 ? 1 : ov.sessionWallMs / idealMs;
    lines.push(
      `  spawns with an interval  ${String(ov.spawns).padStart(5)}   (${ov.pointSpawns} of them single-turn POINTS, which can never overlap)`,
      `  sessions with 2+ spawns  ${String(ov.sessionsMultiSpawn).padStart(5)} / ${measured}   — the only ones where overlap was possible`,
      `  sessions with ${FANOUT_MIN_SPAWNS}+ spawns  ${String(ov.sessionsFanoutCandidate).padStart(5)} / ${measured}   — the population a fan-out primitive would serve`,
      `  sessions ALREADY overlapping ${String(ov.sessionsWithOverlap).padStart(2)} / ${measured}   — peak concurrency reached anywhere: ${ov.maxConcurrency}`,
      "",
      `  Σ spawn durations (serial) ${mins(ov.serialMs).padStart(7)}`,
      `  Σ union of intervals       ${mins(ov.unionMs).padStart(7)}   — wall clock with ≥1 delegate live`,
      `  Σ per-session critical path${mins(ov.criticalPathMs).padStart(7)}   — the slowest single chain; NO batcher compresses this`,
      `  ⇒ COMPRESSIBLE             ${mins(ov.compressibleMs).padStart(7)}   = union − critical path, summed per session`,
      "",
      `  AMDAHL, computed: session wall clock ${mins(ov.sessionWallMs)} → best case ${mins(idealMs)} ` +
        `(×${speedup.toFixed(3)}, ${pct(ov.compressibleMs, ov.sessionWallMs).trim()} removable).`,
      `  Per session that is ${mins(ov.compressibleMs / Math.max(1, measured))} of the ${mins(ov.sessionWallMs / Math.max(1, measured))} a session spans.`,
      `  Main-thread turns that ran WHILE a delegate was live: ${ov.mainTurnsDuringSpawns} of ${report.mainTurns} ` +
        `(${pct(ov.mainTurnsDuringSpawns, report.mainTurns).trim()}).`,
      "",
    );

    // IS THE CEILING BROAD, OR IS IT ONE SESSION? This window has twice been read wrongly for want
    // of the question (`session-cost-arc` increments 8 and 10, where a single 682-turn session moved
    // a per-session delta from −22% to +11%). A ceiling carried by one session is that session's
    // shape, not the factory's, and a primitive built for it would serve nobody else.
    const carriers = [...report.sessions]
      .map((row) => ({ row, ms: Math.max(0, row.overlap.unionMs - row.overlap.criticalPathMs) }))
      .filter((entry) => entry.ms > 0)
      .sort((a, b) => b.ms - a.ms);
    if (carriers.length === 0) {
      lines.push("  NO SESSION CARRIES ANY COMPRESSIBLE INTERVAL — the ceiling is zero, not small.", "");
    } else {
      const top = carriers[0];
      lines.push(
        `  CONCENTRATION: ${carriers.length} of ${measured} session(s) carry any compressible interval at all; ` +
          `the largest holds ${pct(top === undefined ? 0 : top.ms, ov.compressibleMs).trim()} of it.`,
      );
      for (const entry of carriers.slice(0, 5)) {
        lines.push(
          `    ${entry.row.sessionId}  ${mins(entry.ms).padStart(7)} compressible  ` +
            `${String(entry.row.subagentSpawns).padStart(2)} spawn(s)  peak ×${entry.row.overlap.maxConcurrency}`,
        );
      }
      lines.push("");
    }

    // THE OTHER PRIZE. When the spawns already overlap, the per-item decision turns are all a
    // fan-out primitive has left to sell — so they are sized here rather than left as an intuition.
    const dp = report.dispatch;
    const perTurn = report.mainTurns === 0 ? 0 : report.totalCost / report.mainTurns;
    const residualTurns = Math.max(0, dp.turns - dp.sessions);
    lines.push(
      `  DISPATCH: ${dp.calls} spawn call(s) arrived in ${dp.turns} main-thread turn(s) across ${dp.sessions} session(s); ` +
        `${dp.batchedTurns} of those turn(s) carried 2+ (widest ×${dp.widest}).`,
      `  ${pct(dp.batchedCalls, dp.calls).trim()} of spawns were ALREADY batched into a multi-spawn turn — that saving is banked, not available.`,
      `  RESIDUAL: collapsing every session's dispatches to ONE turn removes ${residualTurns} turn(s) ≈ ${usd(residualTurns * perTurn)} ` +
        `(${pct(residualTurns * perTurn, report.totalCost).trim()} of spend), at ${usd(perTurn)}/turn.`,
      "  That residual is an upper bound: it assumes a session knew its whole delegation plan up",
      "  front, which is what a session DISCOVERING work cannot do.",
      `  A further ${dp.subagentCalls} spawn(s) were dispatched BY a delegate, not by the main thread — which is why the`,
      `  spawn count above (${ov.spawns}) exceeds the ${dp.calls} main-thread call(s). No main-thread batcher reaches those.`,
      "  The two do not BALANCE exactly, and are not meant to: a dispatched delegate that produced no",
      "  priced turn in the window has a call here and no transcript there. This is the direction of the",
      "  gap, accounted for — not an identity to reconcile.",
      "",
      "  spawns per session:",
    );
    for (const bucket of ov.histogram) {
      lines.push(
        `    ${String(bucket.spawns).padStart(3)} spawn(s)  ${String(bucket.sessions).padStart(3)} session(s)  ` +
          "#".repeat(Math.min(40, bucket.sessions)),
      );
    }
    lines.push(
      "",
      "  READ THE CEILING, NOT THE SPEEDUP. `compressible` is the wall clock a PERFECT batcher would",
      "  remove if every delegate in a session were independent and could start at once — an upper",
      "  bound twice over, since the transcript cannot show which spawn's prompt was written from a",
      "  previous spawn's digest. The denominator includes IDLE, which is free, so the removable share",
      "  understates the effect on an owner's attention while the absolute minutes do not.",
      "  Intervals are first→last PRICED turn, so dispatch latency and the last turn's own generation",
      "  are excluded: the minutes are a floor, and overlap needs positive shared length, so a session",
      "  scored as serial genuinely never had two delegates live at the same instant.",
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

  // -- the preamble ---------------------------------------------------------
  const pre = report.preamble;
  lines.push(
    "## THE PREAMBLE  (ADR-0323 D3 — what a session pays before it does anything)",
    "",
    `  main-thread floor   ${tokens(pre.mainFloor).padStart(7)}   (median first turn ${tokens(pre.mainMedian)})`,
    `  one-shot floor      ${tokens(pre.oneShotFloor).padStart(7)}   (tightest reading: a one-line scripted prompt)`,
    `  subagent floor      ${tokens(pre.subagentFloor).padStart(7)}   over ${pre.subagentTranscripts} delegate transcript(s)`,
    "",
    `  carrying those floors cost ${usd(pre.floorCost)} across this window — ` +
      `${pct(pre.floorCost, report.totalCost).trim()} of spend.`,
    `  MARGINAL PRICE: +1,000 eagerly-loaded tokens costs ${usd(pre.marginalPerKTokPerSession)} per session here.`,
    "",
    "  Read off the BILL, not counted from the files: a transcript never records the system prompt,",
    "  the tool definitions, `CLAUDE.md` or `MEMORY.md`, but the first turn's `usage` prices all four,",
    "  because turn one's live context IS the preamble plus that session's opening prompt. The floor",
    "  is the smallest first turn in a population, so it OVER-states the fixed part by the shortest",
    "  prompt in the window and no more. Both figures under-state the marginal price — a cache entry",
    "  expires and is re-written, and every delegate pays a whole fresh preamble at the write rate.",
    "",
  );

  // -- per session ----------------------------------------------------------
  lines.push("## PER SESSION  (newest first; `started` is the FIRST turn — what guidance was live)", "");
  for (const row of report.sessions.slice(0, 20)) {
    lines.push(
      `  ${row.sessionId}  ${String(row.turns).padStart(4)} turn(s)  ${usd(row.cost).padStart(9)}  ` +
        `${String(row.subagentSpawns).padStart(2)} sub (peak ×${row.overlap.maxConcurrency})  ${String(row.pollingTurns).padStart(3)} poll ` +
        `(${String(row.pollingLoopTurns).padStart(3)} looped)  ${tokens(row.firstTurnContext).padStart(6)} floor  ` +
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
      "SPLIT (cache read / cache write / output / input), cost per phase, polling turns split into",
      "LOOPS and isolated status checks, bash calls by purpose, subagent cost per agent type with the",
      "model each ran on and how many sessions spawned it, live-context size, and the measured",
      "preamble floor with the marginal price of adding to it.",
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
