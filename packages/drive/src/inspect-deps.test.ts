/**
 * Integration tests for the inspect-deps composition (ADR-0173 — the read-only CI/git inspection
 * surface): proves `buildInspectDeps` composes the REAL {@link InspectSurfaceDeps} the desktop
 * orchestrator's inspect tool surface consumes —
 *   - `viewCiRun` shells `gh run view <runId> [--log-failed]` and surfaces the output tail;
 *   - `viewPrChecks` shells `gh pr checks <pr>` + `gh pr view <pr> --json …` for an ARBITRARY PR;
 *   - `gitInspect` shells `git <read-verb> [...args]` for the read-only verbs only, and REFUSES a
 *     mutating verb (commit / push / merge / …) BEFORE any shelling (ADR-0173 invariant 1);
 *   - the id-taking tools refuse a flag-like id so a mutating token can never ride in as an id;
 *   - each read is fail-closed on a non-zero exit (a readable `{ ok: false }`, never a throw);
 *   - a blank cwd is a typed refusal BEFORE any deps are built;
 *   - the composed deps thread through the real `orchestrate()` chain so the inspect tools mount.
 *
 * All OFFLINE by an injected recording exec seam (ADR-0010 §5): no real subprocess, no live spend.
 * The real `gh` / `git` exec is the desktop's operator-attested glue (backend-entry.ts).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

import { buildInspectDeps } from "./inspect-deps.js";
import type { ExecFn, ExecResult } from "./landing-deps.js";
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
 * exit 0). `script` may vary the result per call (e.g. fail one read) to prove fail-closed handling.
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

/** The SDK Options-capturing query double (allowedTools is the observable). */
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
// viewCiRun — reads a CI run / its failing-job log; fixed `gh run view` shape
// ---------------------------------------------------------------------------

test("buildInspectDeps: viewCiRun shells `gh run view <runId>` in the cwd and surfaces the output tail", async () => {
  const exec = recordingExec(() => ({ code: 0, stdout: "web-engine check\nverify FAILED", stderr: "" }));
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const r = await built.deps.viewCiRun({ runId: "12345" });
  assert.equal(r.ok, true);
  assert.match(r.summary, /verify FAILED/, "the run output must be surfaced");
  assert.deepEqual(
    exec.calls[0],
    { cmd: "gh", args: ["run", "view", "12345"], cwd: "/repo" },
    "viewCiRun must shell exactly `gh run view <runId>` in the cwd",
  );
});

test("buildInspectDeps: viewCiRun with logFailed:true appends --log-failed (the WHY of the red)", async () => {
  const exec = recordingExec(() => ({ code: 0, stdout: "Error: stale pin", stderr: "" }));
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  await built.deps.viewCiRun({ runId: "999", logFailed: true });
  assert.deepEqual(
    exec.calls[0]?.args,
    ["run", "view", "999", "--log-failed"],
    "logFailed:true must append --log-failed",
  );
});

test("buildInspectDeps: viewCiRun maps a non-zero exit to a fail-closed { ok:false } with the tail — never a throw", async () => {
  const exec = recordingExec(() => ({ code: 1, stdout: "", stderr: "run not found" }));
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const r = await built.deps.viewCiRun({ runId: "0" });
  assert.equal(r.ok, false);
  assert.match(r.summary, /run not found/, "a failed read must carry the error tail");
});

test("buildInspectDeps: viewCiRun REFUSES a flag-like runId BEFORE shelling — a mutating token can't ride in as an id", async () => {
  const exec = recordingExec();
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  for (const bad of ["--log-failed", "-x", "12345 && gh pr merge 1", ""]) {
    const r = await built.deps.viewCiRun({ runId: bad });
    assert.equal(r.ok, false, `runId '${bad}' must be refused`);
    assert.match(r.summary, /refused/i, `runId '${bad}' must surface a refusal`);
  }
  assert.equal(exec.calls.length, 0, "a refused runId must NEVER reach the shell");
});

// ---------------------------------------------------------------------------
// viewPrChecks — reads an ARBITRARY PR's checks; two reads, fixed shapes
// ---------------------------------------------------------------------------

test("buildInspectDeps: viewPrChecks shells `gh pr checks <pr>` and `gh pr view <pr> --json …` and combines them", async () => {
  const exec = recordingExec((call) =>
    call.args[1] === "checks"
      ? { code: 0, stdout: "verify\tfail\nbuild\tpass", stderr: "" }
      : { code: 0, stdout: '{"number":650,"state":"OPEN"}', stderr: "" },
  );
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const r = await built.deps.viewPrChecks({ pr: "650" });
  assert.equal(r.ok, true);
  assert.match(r.summary, /verify\tfail/, "the checks output must be surfaced");
  assert.match(r.summary, /OPEN/, "the pr view output must be surfaced");
  assert.equal(exec.calls[0]?.cmd, "gh");
  assert.deepEqual(exec.calls[0]?.args, ["pr", "checks", "650"], "first read is `gh pr checks <pr>`");
  assert.deepEqual(
    exec.calls[1]?.args,
    ["pr", "view", "650", "--json", "number,state,statusCheckRollup,url"],
    "second read is `gh pr view <pr> --json …`",
  );
});

test("buildInspectDeps: viewPrChecks REFUSES a flag-like pr BEFORE shelling", async () => {
  const exec = recordingExec();
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const r = await built.deps.viewPrChecks({ pr: "--json" });
  assert.equal(r.ok, false);
  assert.match(r.summary, /refused/i);
  assert.equal(exec.calls.length, 0, "a refused pr must NEVER reach the shell");
});

// ---------------------------------------------------------------------------
// gitInspect — read-only git verbs ONLY; the load-bearing write-fence test
// ---------------------------------------------------------------------------

test("buildInspectDeps: gitInspect shells `git <read-verb> [...args]` for an allowlisted verb", async () => {
  const exec = recordingExec(() => ({ code: 0, stdout: "160000 commit c850e06\tweb", stderr: "" }));
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const r = await built.deps.gitInspect({ verb: "ls-tree", args: ["HEAD", "web"] });
  assert.equal(r.ok, true);
  assert.match(r.summary, /c850e06/, "the git output (the stale gitlink) must be surfaced");
  assert.deepEqual(
    exec.calls[0],
    { cmd: "git", args: ["ls-tree", "HEAD", "web"], cwd: "/repo" },
    "gitInspect must shell exactly `git ls-tree HEAD web`",
  );
});

test("buildInspectDeps: gitInspect permits all five read-only verbs", async () => {
  const exec = recordingExec(() => ({ code: 0, stdout: "ok", stderr: "" }));
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  for (const verb of ["status", "log", "ls-tree", "rev-parse", "show"]) {
    const r = await built.deps.gitInspect({ verb });
    assert.equal(r.ok, true, `read verb '${verb}' must be permitted`);
  }
});

test("buildInspectDeps: gitInspect REFUSES every mutating verb BEFORE shelling — read-only means read-only (ADR-0173 invariant 1)", async () => {
  const exec = recordingExec();
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  // The exact verbs that would breach the fence if a lazy passthrough let them through.
  for (const verb of [
    "commit",
    "push",
    "merge",
    "checkout",
    "reset",
    "rebase",
    "add",
    "rm",
    "fetch",
    "pull",
    "tag",
    "clean",
    "cherry-pick",
    "stash",
    "switch",
  ]) {
    const r = await built.deps.gitInspect({ verb, args: ["--force"] });
    assert.equal(r.ok, false, `mutating verb '${verb}' must be refused`);
    assert.match(r.summary, /refused/i, `mutating verb '${verb}' must surface a refusal`);
  }
  assert.equal(exec.calls.length, 0, "a refused git verb must NEVER reach the shell — the tree is never mutated");
});

test("buildInspectDeps: gitInspect maps a non-zero exit to a fail-closed { ok:false } — never a throw", async () => {
  const exec = recordingExec(() => ({ code: 128, stdout: "", stderr: "fatal: not a git repository" }));
  const built = buildInspectDeps({ cwd: "/repo", exec: exec.fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const r = await built.deps.gitInspect({ verb: "status", args: ["--porcelain"] });
  assert.equal(r.ok, false);
  assert.match(r.summary, /not a git repository/);
});

// ---------------------------------------------------------------------------
// Identity wall — a blank cwd is a typed refusal BEFORE any deps are built
// ---------------------------------------------------------------------------

test("buildInspectDeps: a blank cwd is a typed { ok:false } refusal — never a default, never a throw", () => {
  const r = buildInspectDeps({ cwd: "   " });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /blank cwd/i);
});

// ---------------------------------------------------------------------------
// Threading through orchestrate() — additive, the §7 scale-down mirror
// ---------------------------------------------------------------------------

test("buildInspectDeps: orchestrate() with inspect deps advertises the three inspect tools — the diagnosis surface mounts", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const built = buildInspectDeps({ cwd: "/repo", exec: recordingExec().fn });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const q = capturingQuery();
  const r = await orchestrate({
    intent: "Orient and diagnose the red PR.",
    store,
    queryFn: q.fn,
    inspect: built.deps,
  });
  assert.equal(r.ok, true, `orchestrate must succeed; error: ${r.error ?? "(none)"}`);

  const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
  for (const name of [
    "mcp__inspect__view_ci_run",
    "mcp__inspect__view_pr_checks",
    "mcp__inspect__git_inspect",
  ]) {
    assert.ok(tools.includes(name), `${name} must be advertised when inspect deps are threaded; got ${JSON.stringify(tools)}`);
  }
});

test("buildInspectDeps: orchestrate() WITHOUT inspect deps advertises no mcp__inspect__* tool — byte-identical (the §7 scale-down)", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const q = capturingQuery();

  const r = await orchestrate({ intent: "Orient and propose.", store, queryFn: q.fn });
  assert.equal(r.ok, true, `orchestrate must succeed; error: ${r.error ?? "(none)"}`);

  const tools = (q.lastOptions()["allowedTools"] ?? []) as string[];
  assert.equal(
    tools.some((t) => t.startsWith("mcp__inspect__")),
    false,
    `no mcp__inspect__* tool may appear without inspect deps; got ${JSON.stringify(tools)}`,
  );
});
