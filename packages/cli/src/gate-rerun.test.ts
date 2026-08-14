import test from "node:test";
import assert from "node:assert/strict";

import type { GateStep } from "./gate-order.js";
import type { GateStepResult, GateStepStatus } from "./gate-runner.js";
import {
  GATE_RUN_RECORD_VERSION,
  type GateRunRecord,
  type GateSelection,
  compareRerun,
  encodeGateRunRecord,
  parseGateRunRecord,
  parseSelectionRequest,
  recordFromResults,
  renderRerunComparison,
  resolveSelection,
  treeChangedSince,
} from "./gate-rerun.js";

// The real plan's SHAPE without its cost: five cheap checks, two expensive legs. Nothing here spawns.
const PLAN: GateStep[] = [
  { command: "pnpm check:boundaries", check: "check:boundaries" },
  { command: "pnpm check:guidance", check: "check:guidance" },
  { command: "pnpm check:agents", check: "check:agents" },
  { command: "pnpm -r --no-bail typecheck", check: undefined },
  { command: "pnpm -r --no-bail test", check: undefined },
];

function result(command: string, status: GateStepStatus): GateStepResult {
  return {
    command,
    status,
    exitCode: status === "pass" ? 0 : status === "fail" ? 1 : status === "skip" ? 3 : null,
    durationMs: 10,
  };
}

function record(statuses: Record<string, GateStepStatus>, over: readonly GateStep[] = PLAN): GateRunRecord {
  return recordFromResults({
    results: over.map((s) => result(s.command, statuses[s.command] ?? "pass")),
    finishedAt: "2026-08-14T02:00:00.000Z",
    head: "abc1234",
    treeDigest: "digest-A",
    scope: "full run",
  });
}

/** Narrow an ok verdict, failing loudly rather than silently testing a refusal. */
function selected(v: ReturnType<typeof resolveSelection>): GateSelection {
  assert.ok(v.ok, `expected a selection, got refusal: ${v.ok ? "" : v.message}`);
  return v;
}

// ── the fence: a partial run can never look like a whole gate ────────────────

test("--only leaves every unselected step in the plan, each carrying WHY it did not run", () => {
  // The defect this closes is a partial run reporting a COMPLETE table. Every planned step must still
  // be accounted for; the selection changes what ran, never what is reported.
  const v = selected(resolveSelection({ steps: PLAN, request: { mode: "only", patterns: ["check:agents"] } }));

  assert.equal(v.partial, true);
  assert.deepEqual([...v.selected], ["pnpm check:agents"]);
  assert.equal(v.unselected.size, PLAN.length - 1, "every other planned step is accounted for");
  for (const [, reason] of v.unselected) assert.match(reason, /not selected \(--only check:agents\)/);
});

test("--only matching EVERY step is a full run, not a partial one", () => {
  // Otherwise `--only pnpm` would run the whole gate and then refuse to call it a verdict — and, worse,
  // would decline to record it, quietly breaking the next --rerun-failed.
  const v = selected(resolveSelection({ steps: PLAN, request: { mode: "only", patterns: ["pnpm"] } }));
  assert.equal(v.partial, false);
  assert.equal(v.unselected.size, 0);
});

test("--only matching NOTHING is refused — a table of NOT RUN rows is not a cheap gate run", () => {
  const v = resolveSelection({ steps: PLAN, request: { mode: "only", patterns: ["check:nope"] } });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.message.includes("verify nothing"), v.ok ? "" : v.message);
  // It has to name the plan, or the session's next move is to guess again.
  assert.ok(!v.ok && v.message.includes("pnpm check:boundaries"));
});

test("--only matches case-insensitively on a SUBSTRING, so a session need not know the exact command", () => {
  const v = selected(resolveSelection({ steps: PLAN, request: { mode: "only", patterns: ["TYPECHECK"] } }));
  assert.deepEqual([...v.selected], ["pnpm -r --no-bail typecheck"]);
});

// ── --rerun-failed ───────────────────────────────────────────────────────────

test("--rerun-failed re-runs exactly the FAIL and NOT RUN steps, and nothing that passed", () => {
  const v = selected(
    resolveSelection({
      steps: PLAN,
      request: { mode: "rerun-failed" },
      record: record({ "pnpm -r --no-bail test": "fail", "pnpm check:agents": "not-run" }),
    }),
  );

  assert.deepEqual([...v.selected].sort(), ["pnpm -r --no-bail test", "pnpm check:agents"].sort());
  assert.equal(v.partial, true);
  assert.match(
    v.unselected.get("pnpm check:boundaries") ?? "",
    /passed in the run at 2026-08-14T02:00:00.000Z — NOT re-executed/,
  );
});

test("a step the record SKIPPED is not re-run, and its row says skipped rather than passed", () => {
  const v = selected(
    resolveSelection({
      steps: PLAN,
      request: { mode: "rerun-failed" },
      record: record({ "pnpm check:agents": "fail", "pnpm check:guidance": "skip" }),
    }),
  );
  assert.equal(v.selected.has("pnpm check:guidance"), false);
  assert.match(v.unselected.get("pnpm check:guidance") ?? "", /^skipped in the run at /);
});

test("a step in today's plan the record never saw is NOT RUN, never assumed passed", () => {
  // The plan grew between the two runs. The new step has no recorded verdict to stand on, so it must
  // not inherit one by being absent from the record.
  const shorter = PLAN.slice(0, 3);
  const v = selected(
    resolveSelection({
      steps: PLAN,
      request: { mode: "rerun-failed" },
      record: record({ "pnpm check:agents": "fail" }, shorter),
    }),
  );
  assert.match(
    v.unselected.get("pnpm -r --no-bail test") ?? "",
    /not in the recorded run at .* — NOT executed here/,
  );
});

test("--rerun-failed with no record is refused, and says a partial run never writes one", () => {
  const v = resolveSelection({
    steps: PLAN,
    request: { mode: "rerun-failed" },
    record: null,
    recordPath: ".gate-logs/last-run.json",
  });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.message.includes(".gate-logs/last-run.json"));
  assert.ok(!v.ok && v.message.includes("A partial run never writes a record"));
});

test("--rerun-failed over a clean record is refused rather than re-asserting a verdict it did not produce", () => {
  const v = resolveSelection({ steps: PLAN, request: { mode: "rerun-failed" }, record: record({}) });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.message.includes("nothing to re-run"));
});

test("--rerun-failed is refused when the recorded failure is not in today's plan", () => {
  // The usual cause is the affected-scope rewrite (ADR-0304 D1): the diff moved, so the expensive legs
  // carry different --filter args and the recorded command no longer exists.
  const stale = recordFromResults({
    results: [result("pnpm --filter ...@storytree/forest-world test", "fail")],
    finishedAt: "2026-08-14T02:00:00.000Z",
    head: "abc1234",
    treeDigest: "digest-A",
    scope: "affected: 1 project",
  });
  const v = resolveSelection({ steps: PLAN, request: { mode: "rerun-failed" }, record: stale });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.message.includes("the plan has moved"));
  assert.ok(!v.ok && v.message.includes("affected: 1 project"), "names what the recorded run covered");
});

// ── argv ─────────────────────────────────────────────────────────────────────

test("--only accepts a repeated flag, an =form and a comma list", () => {
  const a = parseSelectionRequest(["--only", "check:agents", "--only=check:guidance"]);
  assert.ok(a.ok);
  assert.deepEqual(a.request, { mode: "only", patterns: ["check:agents", "check:guidance"] });

  const b = parseSelectionRequest(["--only", "test,typecheck"]);
  assert.ok(b.ok);
  assert.deepEqual(b.request, { mode: "only", patterns: ["test", "typecheck"] });
});

test("no selection flag is the ordinary whole-plan run", () => {
  const v = parseSelectionRequest(["--full", "--fail-fast"]);
  assert.ok(v.ok);
  assert.deepEqual(v.request, { mode: "all" });
});

test("--only and --rerun-failed together are refused rather than one silently winning", () => {
  const v = parseSelectionRequest(["--rerun-failed", "--only", "test"]);
  assert.equal(v.ok, false);
});

test("--only with no pattern is refused, including when the next token is another flag", () => {
  assert.equal(parseSelectionRequest(["--only"]).ok, false);
  assert.equal(parseSelectionRequest(["--only", "--full"]).ok, false);
});

// ── the record ───────────────────────────────────────────────────────────────

test("a record round-trips through encode/parse", () => {
  const r = record({ "pnpm check:agents": "fail" });
  assert.deepEqual(parseGateRunRecord(encodeGateRunRecord(r)), r);
});

test("anything a build does not fully recognise parses as null, never as a half-read record", () => {
  // A half-understood record would decide which steps a re-run declines to execute. The only safe
  // failure is to have no record at all, which routes the caller to a full run.
  assert.equal(parseGateRunRecord("not json"), null);
  assert.equal(parseGateRunRecord(JSON.stringify({ ...record({}), version: GATE_RUN_RECORD_VERSION + 1 })), null);
  assert.equal(parseGateRunRecord(JSON.stringify({ ...record({}), steps: "nope" })), null);
  const badStatus = { ...record({}), steps: [{ command: "x", status: "green", exitCode: 0, durationMs: 1 }] };
  assert.equal(parseGateRunRecord(JSON.stringify(badStatus)), null);
});

// ── what a fail→pass is allowed to be called ─────────────────────────────────

test("fail -> pass over a PROVABLY unchanged tree is a flake signature", () => {
  // The measured shape: a storage-protocol worker exited non-zero naming no assertion, then passed
  // 19/19 in isolation with nothing changed. That is what this verdict exists to say out loud.
  const rec = record({ "pnpm -r --no-bail test": "fail" });
  const [c] = compareRerun({
    record: rec,
    results: [result("pnpm -r --no-bail test", "pass")],
    selected: new Set(["pnpm -r --no-bail test"]),
    treeChanged: false,
  });
  assert.equal(c?.verdict, "flake-signature");
  const rendered = renderRerunComparison([c!], rec).join("\n");
  assert.match(rendered, /FLAKE SIGNATURE/);
  assert.match(
    rendered,
    /None of this is a gate verdict/,
    "an acquittal must still say what it is NOT",
  );
});

test("fail -> pass with the tree CHANGED is a fix, and is never called a flake", () => {
  const [c] = compareRerun({
    record: record({ "pnpm check:agents": "fail" }),
    results: [result("pnpm check:agents", "pass")],
    selected: new Set(["pnpm check:agents"]),
    treeChanged: true,
  });
  assert.equal(c?.verdict, "fixed");
});

test("fail -> pass with the tree state UNKNOWABLE acquits nothing", () => {
  // `null` is "cannot tell", not a weak "no". Collapsing it into `flake-signature` would let the tool
  // acquit a red on evidence it never had — this arc's own defect, with the sign flipped.
  const [c] = compareRerun({
    record: record({ "pnpm check:agents": "fail" }),
    results: [result("pnpm check:agents", "pass")],
    selected: new Set(["pnpm check:agents"]),
    treeChanged: null,
  });
  assert.equal(c?.verdict, "passed-on-rerun");
  assert.match(renderRerunComparison([c!], record({})).join("\n"), /acquits nothing/);
});

test("fail -> fail across two independent runs is a real red", () => {
  const [c] = compareRerun({
    record: record({ "pnpm check:agents": "fail" }),
    results: [result("pnpm check:agents", "fail")],
    selected: new Set(["pnpm check:agents"]),
    treeChanged: false,
  });
  assert.equal(c?.verdict, "still-failing");
});

test("a step this run did NOT execute produces no comparison row", () => {
  // Inventing an 'unchanged' row for an unexecuted step would be the report asserting continuity it
  // never observed — the same move as printing PASS over a step that verified nothing.
  const comparisons = compareRerun({
    record: record({ "pnpm check:agents": "fail" }),
    results: [result("pnpm check:agents", "pass"), result("pnpm check:boundaries", "not-run")],
    selected: new Set(["pnpm check:agents"]),
    treeChanged: false,
  });
  assert.deepEqual(comparisons.map((c) => c.command), ["pnpm check:agents"]);
});

test("treeChangedSince answers null whenever either side is missing, never false", () => {
  const rec = record({});
  assert.equal(treeChangedSince(rec, "abc1234", "digest-A"), false);
  assert.equal(treeChangedSince(rec, "abc1234", "digest-B"), true);
  assert.equal(treeChangedSince(rec, "def5678", "digest-A"), true, "HEAD moved is a change too");
  assert.equal(treeChangedSince(rec, "abc1234", null), null);
  assert.equal(treeChangedSince(rec, null, "digest-A"), null);
  assert.equal(treeChangedSince({ ...rec, treeDigest: null }, "abc1234", "digest-A"), null);
});
