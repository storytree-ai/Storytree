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
// NOTHING HERE MEASURES SPEED, AND THAT IS DELIBERATE (see the constants below). The first version
// of this file asserted the launcher returned inside 3s for a 4s job; on a box carrying a sibling's
// gate it took 3409 ms and redded the whole test leg for a launcher that was working correctly. The
// job now blocks on a release file the test writes only after the launcher has returned, so the
// claim "it returned while the job was still running" is true or false regardless of load.
//
// WHAT THESE TESTS PIN, AND WHY EACH ONE IS NEEDED.
//  - The launcher returns WHILE THE JOB IS STILL RUNNING, and the job SURVIVES its exit. That pair
//    is the detach; either half alone is satisfiable by a broken implementation (a launcher that
//    returns early having killed the child, or one that waits and reports faithfully).
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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { resolveRepoBash } from "../../../scripts/resolve-bash.mjs";
import { nodeExecutable } from "./node-executable.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const launcher = path.join(repoRoot, "scripts", "gate-bg.mjs");
const bash = resolveRepoBash();

/**
 * THE DISPATCHED JOB BLOCKS ON A FILE, IT DOES NOT SLEEP — and that is the whole point.
 *
 * This test's claim is "the launcher returned while the job was STILL RUNNING". Expressed as a
 * clock — the job sleeps 4s, the launcher must return inside 3s — that claim is a statement about
 * how loaded the box is, not about the launcher. It failed exactly that way: a sibling's gate was
 * running, the launcher took **3409 ms**, and the assertion redded the whole `pnpm -r --no-bail
 * test` leg with `the launcher must return at once; it took 3409ms for a 4s job`. Re-run under the
 * same load it failed again; re-run once the box was quiet it passed. A test that reports the box's
 * load as a defect in the code is worse than no test, because the false red costs a session a
 * diagnosis and a full re-run.
 *
 * So the job now waits for a RELEASE FILE the test writes only AFTER the launcher has returned.
 * The job therefore cannot finish first, whatever the box is doing, and "the sentinel does not
 * exist yet" becomes a load-independent proof rather than a race the fast machine happens to win.
 * Raising the constant was the obvious move and the wrong one: it re-tunes a threshold that drifts
 * again under heavier load, and every raise makes the test prove less.
 */
const RELEASE_POLL_TICKS = 100; // 100 x 0.2s = a 20s self-release, so a deadlock FAILS on the
// meaningful assertion (the sentinel already exists) rather than on the backstop clock.

/**
 * The one remaining clock, and it is a DEADLOCK BACKSTOP rather than a performance assertion.
 *
 * The pre-change launcher blocked until its child exited; against a release-gated job that is a
 * deadlock, and a hanging test is a worse red anchor than a failing one. 30s is two orders of
 * magnitude above the ~1s the launcher takes and ~10x the worst figure ever observed under load,
 * so it cannot fire on a busy box — it fires only when the launcher genuinely waits for the job.
 */
const DEADLOCK_BACKSTOP_MS = 30_000;

/** The job: block until the release file appears, then exit with `code`. Never a sleep. */
function releaseGatedJob(releasePath: string, code: number): string[] {
  // Forward slashes: this string is read by `sh`, which does not want Windows separators.
  const release = releasePath.split(path.sep).join("/");
  return [
    "sh",
    "-c",
    `i=0; while [ ! -f "${release}" ] && [ $i -lt ${String(RELEASE_POLL_TICKS)} ]; do i=$((i+1)); sleep 0.2; done; exit ${String(code)}`,
  ];
}

/**
 * AWAITS the body before cleaning up, and that `await` is load-bearing rather than tidy.
 *
 * The sync version of this helper (`try { return fn(dir) } finally { rmSync(dir) }`) returns the
 * body's PROMISE and then deletes the directory immediately — while a detached child is still
 * writing into it. On Windows the child usually won this race; on Linux it lost, and CI failed with
 * `null !== '3'`: `tee` had already created the log, `rmSync` removed the whole directory out from
 * under it, and the `printf > "$exit_file"` four seconds later had nowhere to land. The job had run
 * perfectly; the test had deleted the evidence. Exactly the shape these tests exist to catch — work
 * that outlives the thing that started it — reproduced by accident in the harness.
 */
async function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "st-gate-bg-launch-"));
  try {
    return await fn(dir);
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

test("the launcher returns WHILE THE JOB IS STILL RUNNING, and the job survives its exit", async () => {
  await withTempDir(async (dir) => {
    const log = path.join(dir, "run.log");
    const release = path.join(dir, "release");
    const started = Date.now();
    const res = spawnSync(nodeExecutable(), [launcher, ...releaseGatedJob(release, 7)], {
      encoding: "utf8",
      env: { ...process.env, GATE_BG_LOG: log },
      cwd: repoRoot,
    });
    const elapsed = Date.now() - started;

    assert.equal(res.error, undefined, `spawning the launcher failed: ${String(res.error)}`);
    assert.ok(
      elapsed < DEADLOCK_BACKSTOP_MS,
      `the launcher waited for its child rather than detaching (${String(elapsed)}ms)`,
    );

    // THE LOAD-INDEPENDENT CLAIM. The job cannot have finished, because nothing has released it
    // yet — so a sentinel here means the launcher blocked until its child exited. No clock is
    // involved, and a busy box cannot change the answer.
    assert.equal(
      existsSync(`${log}.exit`),
      false,
      "the launcher returned while the job was still running",
    );

    // …and it returned early because it DETACHED, not because it killed the child: released now,
    // the job runs to completion and writes its own status.
    writeFileSync(release, "");
    assert.equal(await awaitSentinel(`${log}.exit`), "7", "the detached job ran to completion");
  });
});

test("the launcher's exit code reports the LAUNCH, never the job's verdict", async () => {
  // It cannot report a verdict it returns before hearing. 0 = dispatched. The job's real status is
  // in `<log>.exit`, and the assertion above shows a job that exits 7 still leaves a 7 there.
  await withTempDir((dir) => {
    const log = path.join(dir, "run.log");
    const res = spawnSync(nodeExecutable(), [launcher, "sh", "-c", "exit 7"], {
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
    const release = path.join(dir, "release");
    const [, , jobScript] = releaseGatedJob(release, 3);
    const started = Date.now();
    const res = spawnSync(
      bash,
      ["-c", `"${nodeExecutable()}" "${launcher}" sh -c '${String(jobScript)}' 2>&1 | tail -2`],
      { encoding: "utf8", env: { ...process.env, GATE_BG_LOG: log }, cwd: repoRoot },
    );
    const elapsed = Date.now() - started;

    assert.equal(res.error, undefined, `spawning bash failed: ${String(res.error)}`);
    assert.ok(
      elapsed < DEADLOCK_BACKSTOP_MS,
      `a piped launch held the run until its child exited (${String(elapsed)}ms)`,
    );
    assert.equal(
      existsSync(`${log}.exit`),
      false,
      "the piped launch returned while the job was still running",
    );
    writeFileSync(release, "");
    assert.equal(
      await awaitSentinel(`${log}.exit`),
      "3",
      // The pipeline's own output is carried into the message: a bare `null !== '3'` says only that
      // no sentinel appeared, which is true of a launcher that failed to start, a job that was
      // killed, and a directory that vanished underneath it. They need different fixes.
      `and the piped-launch job still completed — pipeline said: ${res.stdout}${res.stderr}`,
    );
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
