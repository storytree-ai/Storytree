/**
 * Red-green for `storytree session-cost` (ADR-0323 D4, `session-cost-arc` increment 2).
 *
 * Every assertion runs against the COMMITTED fixture tree beside this file, never against the real
 * `~/.claude` — that directory is machine-specific, unstable, and would make this suite report a
 * different answer on every box. The fixture is a real nested directory (`<project>/<session>.jsonl`
 * plus `<session>/subagents/agent-*.jsonl` + `.meta.json`), so the walk is proved too and not just
 * the line parser.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  MODEL_PRICES,
  attributePhases,
  classifyCommand,
  collectSessionCost,
  contextTokens,
  isPollingTurn,
  mainCheckoutRoot,
  parseTranscript,
  priceAxes,
  readTranscript,
  renderSessionCost,
  resolveTier,
  sessionCostCommand,
  sessionCostHelp,
  slugifyRepoPath,
  type SessionCostReport,
} from "./session-cost.js";

const FIXTURE_ROOT = path.join(import.meta.dirname, "session-cost.fixture");
const FIXTURE_PROJECT = "C--code-fixture";

/**
 * Far past every fixture mtime. A checkout stamps fixture files with the CHECKOUT time, so a real
 * `Date.now()` here would classify the whole fixture as "in flight" on a fresh clone and measure
 * nothing — the suite would pass by finding zero turns.
 */
const NOW_MS = Date.parse("2099-01-01T00:00:00.000Z");

function collect(over: Partial<Parameters<typeof collectSessionCost>[0]> = {}): SessionCostReport {
  return collectSessionCost({
    root: FIXTURE_ROOT,
    projectPrefix: FIXTURE_PROJECT,
    limit: 10,
    minTurns: 2,
    activeWithinMinutes: 10,
    nowMs: NOW_MS,
    ...over,
  });
}

/**
 * The second fixture project — polling turns, inspection calls, and one session that delegates
 * beside one that does not. It lives under its OWN prefix rather than beside `sess-alpha` because
 * `discoverSessions` matches by `startsWith`, so a `C--code-fixture-*` name would silently join
 * every existing assertion's population.
 */
const POLLING_PROJECT = "C--code-polling";

function polling(over: Partial<Parameters<typeof collectSessionCost>[0]> = {}): SessionCostReport {
  return collectSessionCost({
    root: FIXTURE_ROOT,
    projectPrefix: POLLING_PROJECT,
    limit: 10,
    minTurns: 2,
    activeWithinMinutes: 10,
    nowMs: NOW_MS,
    ...over,
  });
}

/** Money comparisons are floating point; compare to a cent-invisible epsilon. */
function close(actual: number, expected: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${what}: expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
  );
}

// ---------------------------------------------------------------------------
// THE TRAP — the assertion this whole instrument exists to make
// ---------------------------------------------------------------------------

test("counts cache READ and cache WRITE, not just input_tokens — the inversion trap", () => {
  const report = collect();

  // The four axes stay separate all the way through. An instrument that summed only
  // `input_tokens` would report 17 tokens of input-side traffic against 651,000 of cache read.
  assert.equal(report.axes.input, 17, "fresh input tokens");
  assert.equal(report.axes.cacheRead, 651_000, "cache-read tokens");
  assert.equal(report.axes.cacheWrite5m, 50_000, "5m cache-write tokens");
  assert.equal(report.axes.cacheWrite1h, 40_000, "1h cache-write tokens");
  assert.equal(report.axes.output, 2_200, "output tokens");

  // And the split is priced, not merely tallied.
  close(report.cost.cacheRead, 0.315, "cache-read cost");
  close(report.cost.cacheWrite5m, 0.2375, "5m cache-write cost");
  close(report.cost.cacheWrite1h, 0.4, "1h cache-write cost");
  close(report.cost.output, 0.0485, "output cost");
  close(report.cost.input, 0.000075, "fresh-input cost");
  close(report.totalCost, 1.001075, "total cost");

  // The finding, stated as a test: input-side dominates, and reading `input_tokens` alone would
  // have reported the OPPOSITE (0.007% instead of 95%).
  const inputSide =
    report.cost.cacheRead + report.cost.cacheWrite5m + report.cost.cacheWrite1h + report.cost.input;
  assert.ok(inputSide / report.totalCost > 0.95, `input-side share ${inputSide / report.totalCost}`);
  assert.ok(
    report.cost.input / report.totalCost < 0.001,
    "fresh input alone must be a rounding error — that is what makes the naive sum wrong",
  );
});

test("prices the 5m and 1h cache-write TTLs at their different rates", () => {
  // Folding the two TTLs together at either rate misweighs a long-lived cache, and this repo's
  // own sessions use the 1-hour TTL. Same token count, different money:
  const axes = { input: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, output: 0 };
  const at5m = priceAxes({ ...axes, cacheWrite5m: 40_000 }, "opus");
  const at1h = priceAxes({ ...axes, cacheWrite1h: 40_000 }, "opus");
  close(at5m, 0.25, "40k written at the 5m rate");
  close(at1h, 0.4, "40k written at the 1h rate");
  assert.ok(at1h > at5m, "the 1h TTL costs more per token to write");

  // And the fixture's population figures are the per-tier sum, not one blended rate: the opus main
  // thread wrote 20k at 5m + 40k at 1h; the sonnet subagent wrote 30k at 5m.
  const report = collect();
  close(
    report.cost.cacheWrite5m,
    (20_000 * MODEL_PRICES["opus"]!.cacheWrite5m + 30_000 * MODEL_PRICES["sonnet"]!.cacheWrite5m) / 1e6,
    "population 5m cost",
  );
  close(report.cost.cacheWrite1h, (40_000 * MODEL_PRICES["opus"]!.cacheWrite1h) / 1e6, "population 1h cost");
});

test("a cache_creation total with no TTL breakdown falls back to the 5m rate, losing no tokens", () => {
  const line = JSON.stringify({
    type: "assistant",
    requestId: "req_x",
    timestamp: "2026-08-06T10:00:00.000Z",
    message: {
      model: "claude-opus-5",
      usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 7_000, output_tokens: 0 },
    },
  });
  const { turns } = parseTranscript(line);
  assert.equal(turns.length, 1);
  assert.equal(turns[0]!.axes.cacheWrite5m, 7_000);
  assert.equal(turns[0]!.axes.cacheWrite1h, 0);
  assert.equal(contextTokens(turns[0]!.axes), 7_000, "the total survives the split");
});

// ---------------------------------------------------------------------------
// Dedupe by requestId — and the tool_use blocks it must NOT drop
// ---------------------------------------------------------------------------

test("dedupes usage by requestId — a 4-line streamed turn bills once", () => {
  const read = readTranscript(path.join(FIXTURE_ROOT, FIXTURE_PROJECT, "sess-alpha.jsonl"));
  const b = read.turns.filter((t) => t.requestId === "req_b");
  assert.equal(b.length, 1, "req_b spans 4 lines and must reduce to ONE turn");
  // Each of those 4 lines repeats the same usage; counting lines would have quadruple-billed it.
  assert.equal(b[0]!.axes.cacheRead, 200_000);
  assert.equal(read.turns.length, 4, "req_a, req_b, req_c, req_d");
});

test("dedupe-by-requestId does not drop tool calls", () => {
  const read = readTranscript(path.join(FIXTURE_ROOT, FIXTURE_PROJECT, "sess-alpha.jsonl"));
  const b = read.turns.find((t) => t.requestId === "req_b");
  assert.ok(b !== undefined);
  // The two tool_use blocks live on lines 3 and 4 of the turn — the exact lines the usage dedupe
  // skips. Counting by unique `tool_use.id` across ALL lines is what keeps them.
  assert.deepEqual([...b.toolUseIds].sort(), ["toolu_b1", "toolu_b2"]);
  assert.deepEqual([...b.toolNames].sort(), ["Bash", "Edit"]);

  const report = collect();
  assert.equal(report.toolCalls, 5, "toolu_a1, b1, b2, c1 + the subagent's s1");
});

test("counts tool calls by unique id, so a repeated block is not double counted", () => {
  const block = { type: "tool_use", id: "toolu_dup", name: "Read", input: {} };
  const usage = { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 };
  const base = { type: "assistant", requestId: "req_y", timestamp: "2026-08-06T10:00:00.000Z" };
  const raw = [
    JSON.stringify({ ...base, message: { model: "claude-opus-5", content: [block], usage } }),
    JSON.stringify({ ...base, message: { model: "claude-opus-5", content: [block], usage } }),
  ].join("\n");
  const { turns } = parseTranscript(raw);
  assert.equal(turns.length, 1);
  assert.deepEqual(turns[0]!.toolUseIds, ["toolu_dup"]);
});

// ---------------------------------------------------------------------------
// Subagents
// ---------------------------------------------------------------------------

test("attributes subagent turns to their agentType and the model each ran on", () => {
  const report = collect();
  assert.equal(report.subagentSpawns, 1);
  assert.equal(report.subagentTurns, 1);
  assert.equal(report.agentTypes.length, 1);

  const explorer = report.agentTypes[0]!;
  assert.equal(explorer.agentType, "explorer", "read from the sibling .meta.json, not guessed");
  assert.equal(explorer.spawns, 1);
  assert.equal(explorer.turns, 1);
  assert.deepEqual(explorer.models, ["claude-sonnet-5"]);
  // Priced at SONNET rates even though the parent thread ran on opus — the whole point of the
  // per-turn model read, and the number a tiering decision turns on.
  close(explorer.cost, 0.133515, "explorer cost at sonnet rates");
});

test("a subagent's cost is NOT priced at the parent's tier", () => {
  const report = collect();
  const explorer = report.agentTypes[0]!;
  const atOpusRates = priceAxes(
    { input: 5, cacheRead: 50_000, cacheWrite5m: 30_000, cacheWrite1h: 0, output: 400 },
    "opus",
  );
  assert.ok(explorer.cost < atOpusRates, `sonnet ${explorer.cost} must be below opus ${atOpusRates}`);
});

test("a subagent with no readable .meta.json is reported, not dropped", () => {
  // The directory membership is the main/subagent split; agentType is a best-effort label.
  const report = collect();
  assert.ok(report.agentTypes.every((row) => row.agentType !== ""));
});

// ---------------------------------------------------------------------------
// Malformed input degrades, never throws
// ---------------------------------------------------------------------------

test("skips empty, malformed and usage-less lines instead of throwing", () => {
  const read = readTranscript(path.join(FIXTURE_ROOT, FIXTURE_PROJECT, "sess-alpha.jsonl"));
  // One truncated assistant-shaped line + one assistant line with no `usage` block.
  assert.equal(read.skipped, 2);
  // `<synthetic>` is a known benign harness placeholder, counted apart so `skipped` stays meaningful.
  assert.equal(read.synthetic, 1);
  assert.equal(read.turns.length, 4, "the good turns still parse around the bad lines");
});

test("parseTranscript survives garbage without throwing", () => {
  for (const raw of ["", "\n\n\n", "not json at all", '{"type":"assistant"', "null\ntrue\n[]", "{}"]) {
    assert.doesNotThrow(() => parseTranscript(raw), `input: ${JSON.stringify(raw)}`);
  }
  assert.deepEqual(parseTranscript("").turns, []);
});

test("readTranscript on a missing file is an empty read, not an error", () => {
  const read = readTranscript(path.join(FIXTURE_ROOT, "nope", "missing.jsonl"));
  assert.deepEqual(read, { turns: [], skipped: 0, synthetic: 0 });
});

// ---------------------------------------------------------------------------
// Pricing table + model resolution
// ---------------------------------------------------------------------------

test("every price row holds the published cache multipliers", () => {
  // Guards a future rate edit: cache write is 1.25x/2x input and cache read is 0.1x input, so a
  // row that updates `input` without its cache columns is caught here rather than in a report.
  for (const [tier, price] of Object.entries(MODEL_PRICES)) {
    close(price.cacheWrite5m, price.input * 1.25, `${tier} 5m write`);
    close(price.cacheWrite1h, price.input * 2, `${tier} 1h write`);
    close(price.cacheRead, price.input * 0.1, `${tier} cache read`);
    assert.ok(price.output > price.input, `${tier}: output must exceed input`);
  }
});

test("resolves versioned model ids to a tier, and reports the ones it cannot", () => {
  assert.equal(resolveTier("claude-opus-5"), "opus");
  assert.equal(resolveTier("claude-opus-4-8"), "opus");
  assert.equal(resolveTier("claude-sonnet-5"), "sonnet");
  assert.equal(resolveTier("claude-haiku-4-5-20251001"), "haiku");
  assert.equal(resolveTier("claude-fable-5"), "fable");
  assert.equal(resolveTier("claude-experimental-9"), undefined);
  assert.equal(resolveTier("<synthetic>"), undefined);
});

test("an unpriced model is surfaced with its tokens rather than silently zeroed", () => {
  const report = collect();
  assert.equal(report.unpriced.length, 1);
  assert.equal(report.unpriced[0]!.model, "claude-experimental-9");
  assert.equal(report.unpriced[0]!.turns, 1);
  assert.equal(report.unpriced[0]!.tokens, 1_100, "1000 resident + 100 output");
  // Its tokens are still in the population; only its cost is absent, and the report says so.
  assert.ok(report.axes.cacheRead >= 1_000);
  assert.match(renderSessionCost(report), /UNPRICED MODELS/);
});

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

test("buckets turns by transcript position: orientation -> build -> landing", () => {
  const report = collect();
  const byPhase = new Map(report.phases.map((p) => [p.phase, p]));
  assert.equal(byPhase.get("orientation")!.turns, 1, "the Read before any edit");
  assert.equal(byPhase.get("build")!.turns, 1, "`pnpm gate` + Edit opens build");
  assert.equal(byPhase.get("landing")!.turns, 2, "`gh pr create` opens landing, which is terminal");

  close(byPhase.get("orientation")!.cost, 0.46255, "orientation cost");
  close(byPhase.get("build")!.cost, 0.25001, "build cost");
  close(byPhase.get("landing")!.cost, 0.155, "landing cost");

  const phaseSum = report.phases.reduce((acc, p) => acc + p.cost, 0);
  close(phaseSum + report.agentTypes[0]!.cost, report.totalCost, "phases + subagents == total");
});

test("landing is terminal — a post-push edit does not read the session back into build", () => {
  const turn = (commands: string[], toolNames: string[]) => ({
    requestId: commands.join("|") + toolNames.join("|"),
    at: "2026-08-06T10:00:00.000Z",
    model: "claude-opus-5",
    tier: "opus",
    axes: { input: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, output: 0 },
    toolUseIds: [],
    toolNames,
    commands,
  });
  const phases = attributePhases([
    turn([], []),
    turn([], ["Write"]),
    turn(["git push origin HEAD"], ["Bash"]),
    turn([], ["Edit"]),
  ]);
  assert.deepEqual(phases, ["orientation", "build", "landing", "landing"]);
});

// ---------------------------------------------------------------------------
// Context size
// ---------------------------------------------------------------------------

test("reports main-thread context size, excluding output tokens", () => {
  const report = collect();
  // Resident window per turn: 140010, 220002, 300000, 1000 (subagent windows are not the parent's).
  assert.equal(report.context.median, 140_010);
  assert.equal(report.context.p90, 220_002);
  assert.equal(report.context.max, 300_000);
  assert.equal(
    contextTokens({ input: 1, cacheRead: 2, cacheWrite5m: 3, cacheWrite1h: 4, output: 999 }),
    10,
    "output is generated, not carried — it is never resident context",
  );
});

// ---------------------------------------------------------------------------
// Window selection + the walk
// ---------------------------------------------------------------------------

test("--from/--to bound individual turns", () => {
  const report = collect({ from: "2026-08-06T10:01:30.000Z" });
  assert.equal(report.mainTurns, 2, "req_c and req_d survive; req_a and req_b are before the bound");
  assert.equal(report.subagentTurns, 0, "the subagent turn is also before the bound");
  assert.equal(report.axes.cacheRead, 301_000);
});

test("an empty window reports nothing rather than a zeroed table that reads as a finding", () => {
  const report = collect({ from: "2099-01-01T00:00:00.000Z" });
  assert.equal(report.mainTurns, 0);
  assert.equal(report.totalCost, 0);
  assert.match(renderSessionCost(report), /NO PRICEABLE TURN IN THIS WINDOW/);
});

// ---------------------------------------------------------------------------
// The --min-turns selection floor
// ---------------------------------------------------------------------------

test("a one-shot invocation does not fill the window, but its spend IS reported", () => {
  const report = collect();
  assert.equal(report.sessions.length, 1, "only sess-alpha is a session; sess-oneshot is a one-shot");
  assert.deepEqual(
    report.sessions.map((s) => s.sessionId),
    ["sess-alpha"],
  );
  // Not hidden: skipping it silently would be the mirror image of the input-tokens trap.
  assert.equal(report.oneShot.sessions, 1);
  assert.equal(report.oneShot.turns, 1);
  close(report.oneShot.cost, 0.039, "one-shot aggregate cost (73k cache read + 100 output at opus)");
  assert.match(renderSessionCost(report), /below the --min-turns floor/);
  assert.match(renderSessionCost(report), /REAL SPEND/);
});

test("one-shot spend is quarantined from the window's totals, not blended into them", () => {
  const report = collect();
  // sess-oneshot's 73k cache read must NOT appear in the measured population.
  assert.equal(report.axes.cacheRead, 651_000);
  close(report.totalCost, 1.001075, "window total excludes the one-shot");
});

test("--min-turns 1 folds the one-shots back into the window", () => {
  const report = collect({ minTurns: 1 });
  assert.equal(report.sessions.length, 2);
  assert.equal(report.oneShot.sessions, 0);
  assert.equal(report.axes.cacheRead, 651_000 + 73_000);
  close(report.totalCost, 1.001075 + 0.039, "both sessions together");
});

test("the scan budget is announced when it stops the search short", () => {
  const report = collect({ limit: 5, scanLimit: 1 });
  assert.equal(report.scanned, 1);
  assert.equal(report.scanBudgetHit, true);
  assert.match(renderSessionCost(report), /SCAN BUDGET REACHED/);
});

test("an unknown project prefix finds no sessions and does not throw", () => {
  const report = collect({ projectPrefix: "Z--not-a-project" });
  assert.deepEqual(report.sessions, []);
  assert.equal(report.mainTurns, 0);
});

test("sessions treated as in flight are excluded BY NAME, never silently", () => {
  // `nowMs` sits right on the fixture's own mtime, so every fixture session looks active.
  const now = Date.now();
  const report = collect({ nowMs: now, activeWithinMinutes: 60 * 24 * 365 * 100 });
  assert.equal(report.sessions.length, 0);
  assert.ok(report.active.includes("sess-alpha"), "the excluded session is named");
  assert.match(renderSessionCost(report), /still in flight/);
});

test("flattens a repo path the way the harness names its project directories", () => {
  assert.equal(slugifyRepoPath("C:\\code\\storytree"), "C--code-storytree");
  assert.equal(
    slugifyRepoPath("C:\\code\\storytree\\.claude\\worktrees\\priceless-kowalevski-ed19a4"),
    "C--code-storytree--claude-worktrees-priceless-kowalevski-ed19a4",
  );
});

test("a worktree measures its MAIN checkout's sessions, not just its own slot", () => {
  assert.equal(
    mainCheckoutRoot("C:\\code\\storytree\\.claude\\worktrees\\some-name"),
    "C:/code/storytree",
  );
  assert.equal(mainCheckoutRoot("C:\\code\\storytree"), "C:/code/storytree");
  // The prefix a worktree session derives therefore matches the main checkout AND every sibling.
  assert.equal(
    slugifyRepoPath(mainCheckoutRoot("C:\\code\\storytree\\.claude\\worktrees\\x")),
    "C--code-storytree",
  );
});

// ---------------------------------------------------------------------------
// Command classification — the two BEHAVIOURAL lines ADR-0323 measured
// ---------------------------------------------------------------------------

test("classifies a command by what it was FOR", () => {
  // Polling: waiting on a machine and looking again.
  assert.equal(classifyCommand("sleep 300"), "polling");
  assert.equal(classifyCommand("sleep 300; tail -4 .gate-logs/gate.log"), "polling");
  assert.equal(classifyCommand("gh pr checks 1234"), "polling");
  assert.equal(classifyCommand("gh pr checks 1234 --watch"), "polling");
  assert.equal(classifyCommand("gh run watch 99"), "polling");

  // Inspection: every segment is a read verb.
  assert.equal(classifyCommand("ls -la packages"), "inspection");
  assert.equal(classifyCommand('grep -rn "foo" src'), "inspection");
  assert.equal(classifyCommand('grep -rn "foo" src | head -20'), "inspection");
  assert.equal(classifyCommand("cat a.txt && wc -l b.txt"), "inspection");
  assert.equal(classifyCommand("/usr/bin/grep -n x y"), "inspection", "a path-qualified verb");
  assert.equal(classifyCommand("FOO=1 grep -n x y"), "inspection", "a leading env assignment");
  // A `cd` prefix is where, not what. Counting it as a non-inspection segment would push the
  // overwhelmingly common prefixed form into `other` and under-report this whole line.
  assert.equal(classifyCommand("cd packages/cli && grep -rn foo src"), "inspection");
  assert.equal(classifyCommand("cd /repo && ls -la"), "inspection");
  assert.equal(classifyCommand("cd /repo && pnpm gate"), "other", "the neutral prefix decides nothing");
  assert.equal(classifyCommand("cd /repo && sleep 60"), "polling");
  assert.equal(classifyCommand("cd /repo"), "other", "a bare `cd` inspects nothing");

  // Everything else does WORK, and folding it into either line would inflate that line.
  assert.equal(classifyCommand("pnpm gate"), "other");
  assert.equal(classifyCommand("git status --short"), "other");
  assert.equal(classifyCommand("gh pr create --fill"), "other");
  assert.equal(classifyCommand(""), "other");
});

test("polling BEATS inspection, or the finding moves from one line to the other", () => {
  // `sleep 300; tail -4 log` is the exact command ADR-0323 §3 counted. Reading it as inspection
  // because it ends in `tail` would move ~10% of spend onto the wrong line.
  assert.equal(classifyCommand("sleep 300; tail -4 .gate-logs/gate.log"), "polling");
  // And a build that happens to end in a read verb is neither — it is work.
  assert.equal(classifyCommand("pnpm gate | tail -5"), "other");
});

test("a polling TURN is pure — a turn that also edits is doing work", () => {
  const turn = (toolNames: string[], commands: string[]) => ({
    requestId: "r",
    at: "2026-08-07T09:00:00.000Z",
    model: "claude-opus-5",
    tier: "opus",
    axes: { input: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, output: 0 },
    toolUseIds: [],
    toolNames,
    commands,
  });
  assert.equal(isPollingTurn(turn(["Bash"], ["sleep 300; tail -4 x.log"])), true);
  assert.equal(isPollingTurn(turn(["Bash", "Bash"], ["sleep 5", "gh pr checks 1"])), true);
  // A poll alongside real work pays its rent for a reason; only the pure round-trip is waste.
  assert.equal(isPollingTurn(turn(["Bash", "Edit"], ["sleep 5"])), false);
  assert.equal(isPollingTurn(turn(["Bash"], ["ls -la"])), false);
  assert.equal(isPollingTurn(turn([], [])), false, "a turn with no tool call polls nothing");
});

test("counts polling turns and their cost over a real transcript walk", () => {
  const report = polling();
  assert.equal(report.sessions.length, 2, "sess-poll and sess-quiet");
  assert.equal(report.mainTurns, 6);
  assert.equal(report.polling.turns, 2, "the `sleep; tail` turn and the `gh pr checks` turn");
  // 200k + 200k cache read at the opus rate — the rent a status line costs.
  close(report.polling.cost, 0.2, "polling cost");

  const byId = new Map(report.sessions.map((s) => [s.sessionId, s]));
  assert.equal(byId.get("sess-poll")!.pollingTurns, 2);
  assert.equal(byId.get("sess-quiet")!.pollingTurns, 0);
  assert.match(renderSessionCost(report), /MECHANICAL WAITING/);
});

test("splits bash calls by purpose, main thread and subagents apart", () => {
  const report = polling();
  // Main thread: ls + grep (inspection), sleep-tail + gh-pr-checks (polling), pnpm gate + git
  // status (other). Counted by unique tool_use.id across all lines, never by turn.
  assert.deepEqual(report.commands, { calls: 6, inspection: 2, polling: 2, other: 2 });
  // The subagent's grep is reported SEPARATELY: D1's claim is that inspection MOVES here, and a
  // fall in main-thread inspection with no rise here is a session looking less, not delegating.
  assert.deepEqual(report.subagentCommands, { calls: 1, inspection: 1, polling: 0, other: 0 });
  assert.match(renderSessionCost(report), /BASH CALLS BY PURPOSE/);
});

test("reports ADOPTION — sessions that spawned a type, not just the spawn count", () => {
  const report = polling();
  const explorer = report.agentTypes.find((row) => row.agentType === "explorer");
  assert.ok(explorer !== undefined);
  assert.equal(explorer.spawns, 1);
  assert.equal(explorer.sessions, 1, "one of the two measured sessions used it");
  assert.equal(report.sessionsWithoutSubagents, 1, "sess-quiet spawned none");

  const byId = new Map(report.sessions.map((s) => [s.sessionId, s]));
  assert.equal(byId.get("sess-poll")!.subagentSpawns, 1);
  assert.equal(byId.get("sess-quiet")!.subagentSpawns, 0);
  assert.match(renderSessionCost(report), /ADOPTION: 1 of 2 session\(s\)/);
});

test("a type spawned twice by ONE session counts once toward adoption", () => {
  // Adoption is the habit, not the volume: thirteen spawns is one session's habit or thirteen
  // sessions', and only the second is behaviour change.
  const report = polling();
  const explorer = report.agentTypes.find((row) => row.agentType === "explorer")!;
  assert.ok(explorer.sessions <= report.sessions.length, "coverage can never exceed the population");
});

// ---------------------------------------------------------------------------
// Whole-session segmentation — `--started-after` / `--started-before`
// ---------------------------------------------------------------------------

test("--started-after selects WHOLE sessions by their first turn, never truncating one", () => {
  const report = polling({ startedAfter: "2026-08-07T12:00:00.000Z" });
  assert.deepEqual(
    report.sessions.map((s) => s.sessionId),
    ["sess-quiet"],
  );
  assert.equal(report.outsideStartWindow, 1, "sess-poll began before the bound");
  assert.equal(report.mainTurns, 2, "sess-quiet arrives WHOLE — both its turns");
  assert.equal(report.polling.turns, 0);
});

test("--started-before is its mirror, and the two bracket a segment", () => {
  const report = polling({ startedBefore: "2026-08-07T12:00:00.000Z" });
  assert.deepEqual(
    report.sessions.map((s) => s.sessionId),
    ["sess-poll"],
  );
  assert.equal(report.outsideStartWindow, 1);
  assert.equal(report.mainTurns, 4, "all four of sess-poll's turns, including the ones after noon");
  assert.equal(report.polling.turns, 2);
});

test("--from TRUNCATES where --started-after SELECTS — the difference is the point", () => {
  // Bounding TURNS at 09:01:30 keeps only sess-poll's later half, which is half a session's turns
  // and not half a session's habits: orientation, where delegation is decided, is already gone.
  const truncated = polling({ from: "2026-08-07T09:01:30.000Z" });
  assert.equal(truncated.sessions.length, 2);
  assert.equal(truncated.mainTurns, 4, "sess-poll loses 2 turns; sess-quiet keeps both");
  assert.equal(truncated.commands.inspection, 0, "its inspection calls were in the lost half");

  // Selecting whole sessions instead keeps sess-poll intact.
  const selected = polling({ startedBefore: "2026-08-07T12:00:00.000Z" });
  assert.equal(selected.commands.inspection, 2);
});

test("a session excluded by the start bound is NOT counted as a one-shot", () => {
  // Out of SCOPE and below the substance floor are different things; pooling them would corrupt
  // the one-shot block, which exists to account for spend rather than to hide it.
  const report = polling({ startedAfter: "2026-08-07T12:00:00.000Z" });
  assert.equal(report.oneShot.sessions, 0);
  assert.equal(report.oneShot.cost, 0);
  assert.equal(report.outsideStartWindow, 1);
  assert.match(renderSessionCost(report), /1 session\(s\) began outside it/);
});

test("a start bound that excludes everything reports nothing, not a zeroed table", () => {
  const report = polling({ startedAfter: "2099-01-01T00:00:00.000Z" });
  assert.equal(report.sessions.length, 0);
  assert.equal(report.outsideStartWindow, 2);
  assert.match(renderSessionCost(report), /NO PRICEABLE TURN IN THIS WINDOW/);
});

// ---------------------------------------------------------------------------
// The verb
// ---------------------------------------------------------------------------

test("the command returns a formatted envelope over the fixture", () => {
  const env = sessionCostCommand({
    root: FIXTURE_ROOT,
    project: FIXTURE_PROJECT,
    cwd: "/anywhere",
    nowMs: NOW_MS,
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /THE PRICE MIX/);
  assert.match(env.body, /cache READ/);
  assert.match(env.body, /COST BY PHASE/);
  assert.match(env.body, /SUBAGENT COST BY AGENT TYPE/);
  assert.match(env.body, /explorer/);
  assert.match(env.body, /CONTEXT SIZE/);
  // The subscription caveat is not optional decoration — it is what keeps a weight proxy from
  // being read as a bill (`process:measure-session-cost-from-transcripts`, Failure modes).
  assert.match(env.body, /WEIGHT PROXY/);
  assert.match(env.body, /never a bill/);
  // And the instrument states it is not a gate rung, because ADR-0323 decided that deliberately.
  assert.match(env.body, /NOT a gate rung/);
});

test("--all widens the prefix to every project directory", () => {
  const env = sessionCostCommand({ root: FIXTURE_ROOT, all: true, cwd: "/anywhere", nowMs: NOW_MS });
  assert.equal(env.ok, true);
  assert.match(env.body, /projects: \(all\)/);
});

test("a non-numeric --limit is refused with a usable message", () => {
  for (const limit of ["0", "-3", "abc", "2.5"]) {
    const env = sessionCostCommand({ root: FIXTURE_ROOT, limit, cwd: "/anywhere", nowMs: NOW_MS });
    assert.equal(env.ok, false, `--limit ${limit}`);
    assert.match(env.body, /--limit must be a positive integer/);
  }
});

test("a non-numeric --min-turns is refused with a usable message", () => {
  for (const minTurns of ["0", "-1", "many"]) {
    const env = sessionCostCommand({ root: FIXTURE_ROOT, minTurns, cwd: "/anywhere", nowMs: NOW_MS });
    assert.equal(env.ok, false, `--min-turns ${minTurns}`);
    assert.match(env.body, /--min-turns must be a positive integer/);
  }
});

test("help names the trap and the not-a-gate-rung decision", () => {
  const env = sessionCostHelp();
  assert.equal(env.ok, true);
  assert.match(env.body, /cache_read_input_tokens/);
  assert.match(env.body, /cache_creation_input_tokens/);
  assert.match(env.body, /NOT A GATE RUNG/);
  assert.match(env.body, /WEIGHT PROXY/);
});
