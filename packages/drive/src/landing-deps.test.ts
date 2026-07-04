/**
 * Integration tests for the landing-deps composition (ADR-0152, Unit 2 of the
 * desktop-orchestrator full-autonomy arc): proves `buildLandingDeps` composes the REAL
 * {@link LandingSurfaceDeps} the desktop orchestrator's landing tool surface consumes —
 *   - `runGate` shells `pnpm gate` and maps exit 0 → passed / non-zero → failed, surfacing the tail;
 *   - `openLandingPr` shells the merge ceremony in order (git add -A → git commit → git push
 *     -u origin <branch> → a NON-DRAFT `gh pr create`), parses the PR URL, and is fail-closed on any
 *     non-zero exit (a readable `{ ok: false }`, never a throw);
 *   - a blank identity (cwd / branch) is a typed refusal BEFORE any deps are built;
 *   - the composed deps thread through the real `orchestrate()` chain so the landing tools mount.
 *
 * All OFFLINE by an injected recording exec seam (ADR-0010 §5): no real subprocess, no live spend.
 * The real `pnpm gate` / `git` / `gh` exec is Unit 3's operator-attested desktop glue.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

import { buildLandingDeps, type ExecFn, type ExecResult } from "./landing-deps.js";
import { orchestrate } from "./orchestrate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One recorded exec invocation (what command ran, with what args, in what cwd). */
interface ExecCall {
  cmd: string;
  args: string[];
  cwd?: string;
}

/**
 * A recording exec seam: captures every invocation verbatim and returns a scripted result (default
 * exit 0). `script` may vary the result per call (e.g. fail one step) to prove fail-closed handling.
 */
function recordingExec(script?: (call: ExecCall, index: number) => ExecResult): {
  fn: ExecFn;
  calls: ExecCall[];
} {
  const calls: ExecCall[] = [];
  const fn: ExecFn = async (cmd, args, opts) => {
    const call: ExecCall = {
      cmd,
      args: [...args],
      ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
    };
    calls.push(call);
    return script?.(call, calls.length - 1) ?? { code: 0, stdout: "", stderr: "" };
  };
  return { fn, calls };
}

const OK: ExecResult = { code: 0, stdout: "", stderr: "" };

/** The SDK Options-capturing query double (allowedTools is the observable) — mirrors spawn-deps.test.ts. */
function capturingQuery(): { fn: SdkQueryFn; lastOptions: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  const fn: SdkQueryFn = ({ options }) => {
    captured = options as Record<string, unknown>;
    return (async function* () {
      yield {
        type: "result",
        subtype: "success",
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.001,
        result: "session finished",
      };
    })();
  };
  return { fn, lastOptions: () => captured };
}

// ---------------------------------------------------------------------------
// runGate — observed pass/fail from a real exit code (never authors a "healthy")
// ---------------------------------------------------------------------------

test("buildLandingDeps: runGate shells `pnpm gate` in the cwd and maps exit 0 → passed with the output tail", async () => {
  const exec = recordingExec(() => ({ code: 0, stdout: "all green\ngate: PASS", stderr: "" }));
  const built = buildLandingDeps({ cwd: "/repo", branch: "claude/x", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = await built.deps.runGate();

  assert.equal(exec.calls.length, 1, "runGate runs exactly one command");
  assert.deepEqual(exec.calls[0], { cmd: "pnpm", args: ["gate"], cwd: "/repo" }, "it shells `pnpm gate` in the cwd");
  assert.equal(result.passed, true, "exit 0 → passed");
  assert.match(result.summary, /gate: PASS/, "the summary carries the observed gate output");
});

test("buildLandingDeps: runGate maps a non-zero exit → failed (the OBSERVED red, never rewritten to a pass)", async () => {
  const exec = recordingExec(() => ({ code: 1, stdout: "", stderr: "3 tests failed" }));
  const built = buildLandingDeps({ cwd: "/repo", branch: "claude/x", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = await built.deps.runGate();
  assert.equal(result.passed, false, "a non-zero gate exit is surfaced as failed — never a forged pass (ADR-0091)");
  assert.match(result.summary, /3 tests failed/, "the failure summary carries the stderr tail so the orchestrator can act");
});

// ---------------------------------------------------------------------------
// openLandingPr — the merge ceremony, in order, NON-DRAFT, fail-closed
// ---------------------------------------------------------------------------

test("buildLandingDeps: openLandingPr runs the merge ceremony in order — git add -A → commit → push -u origin <branch> → NON-DRAFT gh pr create", async () => {
  const exec = recordingExec((call) =>
    // The gh step returns the PR URL on stdout (as real `gh pr create` does).
    call.cmd === "gh" ? { code: 0, stdout: "https://github.com/o/r/pull/999\n", stderr: "" } : OK,
  );
  const built = buildLandingDeps({ cwd: "/repo", branch: "claude/sess-42", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = await built.deps.openLandingPr({
    commitMessage: "feat(x): land unit",
    prTitle: "Land unit x",
    prBody: "what landed and why",
  });

  assert.equal(result.ok, true, "the ceremony succeeds when every step exits 0");
  assert.deepEqual(
    exec.calls.map((c) => `${c.cmd} ${c.args.join(" ")}`),
    [
      "git add -A",
      "git commit -m feat(x): land unit",
      "git push -u origin claude/sess-42",
      "gh pr create --title Land unit x --body what landed and why",
    ],
    "the exact command sequence — commit message / branch / title / body threaded through as arg-vector values",
  );

  // NON-DRAFT: the gh args must NOT carry --draft (CI re-proves and auto-merges, ADR-0022).
  const gh = exec.calls.find((c) => c.cmd === "gh");
  assert.ok(gh !== undefined && !gh.args.includes("--draft"), "the PR is opened NON-DRAFT — never --draft");
  // And never `gh pr merge` — the spine/CI merges, not the orchestrator.
  assert.ok(!gh.args.includes("merge"), "openLandingPr never runs `gh pr merge`");

  assert.equal(result.prUrl, "https://github.com/o/r/pull/999", "the PR URL is parsed from `gh pr create` stdout");
});

test("buildLandingDeps: openLandingPr is FAIL-CLOSED on a non-zero step — returns a readable { ok:false } naming the step, never throws, and stops the ceremony", async () => {
  // Fail the commit (step index 1): push + gh must NOT run.
  const exec = recordingExec((_call, index) =>
    index === 1 ? { code: 1, stdout: "", stderr: "nothing to commit, working tree clean" } : OK,
  );
  const built = buildLandingDeps({ cwd: "/repo", branch: "claude/x", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  let threw = false;
  let result;
  try {
    result = await built.deps.openLandingPr({ commitMessage: "m", prTitle: "t", prBody: "b" });
  } catch {
    threw = true;
  }

  assert.equal(threw, false, "a failing ceremony step is a returned failure, never a throw (fail-closed)");
  assert.ok(result !== undefined && result.ok === false, "the failure is a typed { ok: false }");
  assert.match(result.summary, /git commit failed/, "the summary names the failing step");
  assert.match(result.summary, /nothing to commit/, "the summary carries the step's stderr so the cause is visible");
  assert.equal(exec.calls.length, 2, "the ceremony STOPS at the failed step — push + gh never run");
  assert.equal(result.prUrl, undefined, "no PR URL on a failed ceremony");
});

test("buildLandingDeps: openLandingPr succeeds with no prUrl when gh prints no URL (still ok — the URL is best-effort)", async () => {
  const exec = recordingExec(() => OK); // gh stdout empty
  const built = buildLandingDeps({ cwd: "/repo", branch: "claude/x", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = await built.deps.openLandingPr({ commitMessage: "m", prTitle: "t", prBody: "b" });
  assert.equal(result.ok, true, "the ceremony succeeded (every step exit 0)");
  assert.equal(result.prUrl, undefined, "no URL parsed → prUrl omitted, not a fabricated value");
});

// ---------------------------------------------------------------------------
// Fail-closed identity — blank cwd / branch is a typed refusal before any deps
// ---------------------------------------------------------------------------

test("buildLandingDeps: a blank or whitespace cwd / branch is a fail-closed typed error — never a defaulted ceremony target", () => {
  for (const [cwd, branch, what] of [
    ["", "claude/x", "blank cwd"],
    ["   ", "claude/x", "whitespace cwd"],
    ["/repo", "", "blank branch"],
    ["/repo", "  \t", "whitespace branch"],
  ] as const) {
    const built = buildLandingDeps({ cwd, branch });
    assert.equal(built.ok, false, `${what} must refuse the composition fail-closed`);
    if (built.ok) continue;
    assert.match(built.error, /fail-closed/, `${what}: the refusal states the wall`);
  }
});

// ---------------------------------------------------------------------------
// Threading through orchestrate() — additive, the §7 scale-down mirror
// ---------------------------------------------------------------------------

test("buildLandingDeps: orchestrate() with landing deps advertises the two landing tools — the merge-ceremony surface mounts on the session", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const built = buildLandingDeps({ cwd: "/repo", branch: "claude/x", exec: recordingExec().fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const q = capturingQuery();
  const r = await orchestrate({
    intent: "Orient and propose the next unit.",
    store,
    queryFn: q.fn,
    landing: built.deps,
  });
  assert.equal(r.ok, true, `orchestrate must succeed; error: ${r.error ?? "(none)"}`);

  const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
  assert.ok(
    tools.includes("mcp__landing__run_gate"),
    `mcp__landing__run_gate must be advertised when landing deps are threaded; got ${JSON.stringify(tools)}`,
  );
  assert.ok(
    tools.includes("mcp__landing__open_landing_pr"),
    `mcp__landing__open_landing_pr must be advertised when landing deps are threaded; got ${JSON.stringify(tools)}`,
  );
  // The existing surface is untouched — additive threading, not a fork.
  assert.ok(
    tools.includes("mcp__proposal__propose_unit"),
    "mcp__proposal__propose_unit stays mounted alongside the landing tools",
  );
});

test("buildLandingDeps: orchestrate() WITHOUT landing deps advertises no mcp__landing__* tool — byte-identical to the propose surface (the §7 scale-down)", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const q = capturingQuery();

  const r = await orchestrate({ intent: "Orient and propose.", store, queryFn: q.fn });
  assert.equal(r.ok, true, `orchestrate must succeed; error: ${r.error ?? "(none)"}`);

  const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
  assert.equal(
    tools.some((t) => t.startsWith("mcp__landing__")),
    false,
    `no mcp__landing__* tool may appear without landing deps; got ${JSON.stringify(tools)}`,
  );
});
