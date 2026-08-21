// `pnpm gate:bg` DETACHES — `the-gate-costs-what-the-change-risks-arc` inc 6, item 1.
//
// THE MEASURED FAILURE. `scripts/gate-bg.mjs` used to `spawnSync` the wrapper with inherited stdio,
// so `gate:bg` backgrounded nothing itself — it relied on the CALLER backgrounding it. That holds
// right up until the caller pipes it, and piping it is the natural move: `pnpm gate:bg 2>&1 | tail`
// is how you read the banner it prints. Measured 2026-08-20 — the pipe kept the pipeline in the
// FOREGROUND for the whole 600 s tool ceiling; a sibling filing records the same shape SIGTERMing
// the run outright. Documented in agent memory AND in a friction item, and still hit on the first
// gate launch of the day, which is why the remedy is code (ADR-0352: fix the write, do not detect
// the outcome — there is no pipe detector here and nothing for an honest caller to override).
//
// WHAT THESE TESTS PIN, AND WHY EACH ONE IS NEEDED.
//  - The launcher returns BEFORE the job does, and the job SURVIVES its exit. That pair is the
//    detach; either half alone is satisfiable by a broken implementation (a launcher that returns
//    early having killed the child, or one that waits and reports faithfully).
//  - A PIPE on the launcher's stdout changes neither half. This is the regression that actually
//    happened, so it is asserted directly rather than inferred from the spawn options.
//  - The exit code is the LAUNCH's, not the job's. A launcher cannot report a verdict it returns
//    before hearing; the verdict lives in `<log>.exit` and is read with `storytree dispatch`.
//  - A structural fence on the spawn options, read from CODE and never from comments. The
//    behavioural tests above would still pass under `stdio: "inherit"` on this box — the child
//    simply inherits handles it does not need — and the failure that reintroduces is a run coupled
//    to a parent's stdout, which is precisely what was fixed.
//
// Every test writes its log to a temp dir. Running the real script with no override would put a log
// AND a `.exit` file into this worktree's REAL `.gate-logs/` — byte-identical to a finished gate,
// which a waiting session reads as a completed run (the trap `gate-bg.test.ts` documents at length).
//
// Proof: node --import ../../scripts/tsx-cache-off.mjs --import tsx --test src/gate-bg-launcher.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { resolveRepoBash } from "../../../scripts/resolve-bash.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const launcher = path.join(repoRoot, "scripts", "gate-bg.mjs");
const bash = resolveRepoBash();

/** How long the dispatched job sleeps before exiting. Long enough that "returned first" is not luck. */
const JOB_SECONDS = 4;
/** The launcher must return well inside this. It does no work beyond one spawn. */
const LAUNCH_CEILING_MS = 3000;

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), "st-gate-bg-launch-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** Poll the sentinel the way a caller would, and return its contents (or null if it never lands). */
async function awaitSentinel(exitFile: string, budgetMs = 30_000): Promise<string | null> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (existsSync(exitFile)) return readFileSync(exitFile, "utf8").trim();
    await delay(250);
  }
  return null;
}

test("the launcher returns before the job does, and the job survives its exit", async () => {
  await withTempDir(async (dir) => {
    const log = path.join(dir, "run.log");
    const started = Date.now();
    const res = spawnSync(
      process.execPath,
      [launcher, "sh", "-c", `sleep ${String(JOB_SECONDS)}; exit 7`],
      { encoding: "utf8", env: { ...process.env, GATE_BG_LOG: log }, cwd: repoRoot },
    );
    const elapsed = Date.now() - started;

    assert.equal(res.error, undefined, `spawning the launcher failed: ${String(res.error)}`);
    assert.ok(
      elapsed < LAUNCH_CEILING_MS,
      `the launcher must return at once; it took ${String(elapsed)}ms for a ${String(JOB_SECONDS)}s job`,
    );
    // The other half of the same claim: it returned early because it DETACHED, not because it
    // killed the child. A launcher that returned early having killed the job would pass the line
    // above and fail here.
    assert.equal(
      existsSync(`${log}.exit`),
      false,
      "the job cannot already be finished — the launcher returned first",
    );
    assert.equal(await awaitSentinel(`${log}.exit`), "7", "the detached job ran to completion");
  });
});

test("the launcher's exit code reports the LAUNCH, never the job's verdict", () => {
  // It cannot report a verdict it returns before hearing. 0 = dispatched. The job's real status is
  // in `<log>.exit`, and the assertion above shows a job that exits 7 still leaves a 7 there.
  withTempDir((dir) => {
    const log = path.join(dir, "run.log");
    const res = spawnSync(process.execPath, [launcher, "sh", "-c", "exit 7"], {
      encoding: "utf8",
      env: { ...process.env, GATE_BG_LOG: log },
      cwd: repoRoot,
    });
    assert.equal(res.status, 0, "a dispatched job that will fail is still a successful dispatch");
    const out = `${res.stdout}${res.stderr}`;
    assert.match(out, /gate:bg log:\s+\S+/, "the handle is printed, so nobody has to guess it");
    assert.match(out, /gate:bg exit-file:\s+\S+/);
    assert.match(out, /DISPATCH, not a verdict/, "the banner says outright that this is not a result");
    assert.match(out, /storytree dispatch .* --wait/, "and names the verb that DOES give the verdict");
  });
});

test("a PIPE on the launcher's stdout no longer holds the run — the measured regression", async () => {
  // This is the defect, reproduced. Under the old `spawnSync` + inherited stdio the pipeline stayed
  // in the foreground for the full job (measured: the whole 600s tool ceiling for a real gate).
  await withTempDir(async (dir) => {
    const log = path.join(dir, "run.log");
    const started = Date.now();
    const res = spawnSync(
      bash,
      [
        "-c",
        `"${process.execPath}" "${launcher}" sh -c "sleep ${String(JOB_SECONDS)}; exit 3" 2>&1 | tail -2`,
      ],
      { encoding: "utf8", env: { ...process.env, GATE_BG_LOG: log }, cwd: repoRoot },
    );
    const elapsed = Date.now() - started;

    assert.equal(res.error, undefined, `spawning bash failed: ${String(res.error)}`);
    assert.ok(
      elapsed < LAUNCH_CEILING_MS,
      `a piped launch must still return at once; it took ${String(elapsed)}ms`,
    );
    assert.equal(await awaitSentinel(`${log}.exit`), "3", "and the piped-launch job still completed");
  });
});

// ---------- the structural fence, read from CODE and never from comments ----------

/** The script's executable lines only — this file's own header explains the fix; it does not implement it. */
function scriptCode(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

test("the child is spawned DETACHED with stdio it does not share with the parent", () => {
  // The behavioural tests above pass under `stdio: "inherit"` on this box — the child simply
  // inherits handles it never uses — so they cannot fence the property that matters: the run must
  // not hold, or be held by, anything the parent owns. That is asserted here, in code.
  const code = scriptCode(readFileSync(launcher, "utf8"));
  assert.match(code, /detached:\s*true/, "the child must outlive this process");
  assert.match(
    code,
    /stdio:\s*"ignore"/,
    'the child must not inherit the parent\'s stdout — that is what a pipe grabs. gate-bg.sh tees every byte into the log itself, so nothing is lost',
  );
  assert.match(code, /\.unref\(\)/, "and the parent must not wait on it");
  assert.doesNotMatch(
    code,
    /spawnSync/,
    "spawnSync is the regression: it blocks until the job finishes, which is the whole defect",
  );
});

test("a launch that creates no process FAILS LOUDLY rather than printing a handle", () => {
  // `unref()` empties the event loop, so an async `error` event can lose the race with process exit
  // — a handler alone would let a failed dispatch exit 0 having printed a handle to a log nothing
  // will ever write, which is a silent false dispatch. The synchronous `pid` check is what holds.
  const code = scriptCode(readFileSync(launcher, "utf8"));
  assert.match(code, /child\.pid === undefined/, "the no-process case is caught synchronously");
  const pidCheck = code.indexOf("child.pid === undefined");
  const unref = code.indexOf(".unref()");
  assert.ok(pidCheck !== -1 && unref !== -1 && pidCheck < unref, "…and BEFORE the unref");
});
