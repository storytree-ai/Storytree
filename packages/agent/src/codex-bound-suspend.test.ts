/**
 * inner-loop-exit-arc / codex-bound-suspends-during-feedback: the leaf spawn's bound can be
 * SUSPENDED while the spine runs a feedback command and RESUMED with its remaining time, so only the
 * leaf's own time counts against it. See `stories/agent/codex-bound-suspends-during-feedback.md`.
 *
 * `CodexCommand` is expected to gain one optional field carrying the control (named `bound` below),
 * and `CodexBoundClock` is expected to gain an optional `now()` the remaining-time arithmetic reads.
 * Neither exists on `codex-author.ts` yet — this file is authored RED against its CURRENT behaviour.
 * Every test below reaches the new behaviour through `runPinnedCodexCli`/`CodexCommand`, which
 * already exist, so the red is a genuine assertion failure rather than a missing-export import
 * failure. `BoundHandle` is declared locally rather than imported for the same reason.
 *
 * Every test title carries the contract id `suspended-bound-counts-only-leaf-time` verbatim
 * (ADR-0122's coverage binding).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runPinnedCodexCli } from "./codex-author.js";
import type { CodexBoundClock, CodexCommand } from "./codex-author.js";

/**
 * The shape `CodexCommand.bound` is expected to gain: an otherwise-empty handle the caller supplies,
 * which `runPinnedCodexCli` populates with real `suspend`/`resume` functions before it returns its
 * pending promise (the promise executor runs synchronously up to that point, exactly as the spawn and
 * the initial `clock.setTimeout` already do today).
 */
interface BoundHandle {
  suspend?: () => void;
  resume?: () => void;
}

/** Await a runner call under the test's OWN bound — mirrors `within` in `codex-author.test.ts`. */
async function within<T>(pending: Promise<T>, ms = 10_000): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`did not settle within ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}

/** A stand-in leaf: sleeps `sleepMs`, then prints identifiable output and exits 0 on its own. */
function leafCommand(sleepMs: number, timeoutMs: number): CodexCommand {
  return {
    args: [
      "-e",
      `setTimeout(() => { process.stdout.write("done"); process.stderr.write("noted"); }, ${sleepMs})`,
    ],
    cwd: process.cwd(),
    env: { ...process.env, STORYTREE_CODEX_EXECUTABLE: process.execPath },
    timeoutMs,
  };
}

/**
 * Attaches a bound control to a command. `CodexCommand` does not declare `bound` yet, so this casts
 * rather than relying on a fresh-literal excess-property check that will only pass once the source
 * gains the field — the cast has no runtime effect either way; the same object reference `control`
 * flows through, so mutations the implementation makes are visible on the caller's own variable.
 */
function withBound(command: CodexCommand, control: BoundHandle): CodexCommand {
  return { ...command, bound: control } as CodexCommand;
}

/**
 * A clock that keeps real timers (so the wrapper's own kill/settle plumbing is exercised exactly as
 * in production) but lets the test drive "now" by hand, recording every `setTimeout`/`clearTimeout` —
 * mirrors `recordingClock` in `codex-author.test.ts`, extended with the manual `now()` a suspend/resume
 * cycle's remaining-time arithmetic needs. Declared without a `CodexBoundClock` type annotation so the
 * extra `now` member never trips an excess-property check before the interface gains it; passing
 * `clock` by reference to `runPinnedCodexCli` only checks that the required members are present.
 */
function suspendableClock() {
  const log: string[] = [];
  let currentMs = 0;
  const base = {
    setTimeout: (callback, ms) => {
      log.push(`set ${ms}`);
      return setTimeout(callback, ms);
    },
    clearTimeout: (handle) => {
      log.push("clear");
      clearTimeout(handle);
    },
  } satisfies CodexBoundClock;
  const clock = { ...base, now: () => currentMs };
  return { clock, log, advance: (ms: number): void => { currentMs += ms; } };
}

test(
  "suspended-bound-counts-only-leaf-time: suspend() releases the armed timer and resume() re-arms " +
    "exactly the remaining time; a repeated suspend() or resume() changes nothing",
  async () => {
    const { clock, log, advance } = suspendableClock();
    const control: BoundHandle = {};
    const pending = runPinnedCodexCli(withBound(leafCommand(300, 30_000), control), clock);
    try {
      assert.equal(
        typeof control.suspend,
        "function",
        "runPinnedCodexCli wires suspend() onto the bound control before it returns",
      );
      assert.equal(
        typeof control.resume,
        "function",
        "runPinnedCodexCli wires resume() onto the bound control before it returns",
      );

      advance(10_000);
      control.suspend!();
      assert.deepEqual(log, ["set 30000", "clear"], "suspend() released the armed timer");

      control.suspend!();
      assert.deepEqual(
        log,
        ["set 30000", "clear"],
        "a repeated suspend() releases nothing further",
      );

      advance(40_000);
      control.resume!();
      // Forty seconds passed while suspended; only the 20 000 ms that remained when suspend() fired
      // (30 000 armed minus the 10 000 already spent) counts.
      assert.deepEqual(
        log,
        ["set 30000", "clear", "set 20000"],
        "resume() re-armed exactly the remaining time, ignoring the time spent suspended",
      );

      control.resume!();
      assert.deepEqual(
        log,
        ["set 30000", "clear", "set 20000"],
        "a repeated resume() arms nothing further",
      );
    } finally {
      await within(pending).catch(() => undefined);
    }
  },
);

test(
  "suspended-bound-counts-only-leaf-time: a child that exits while suspended settles normally with " +
    "nothing left armed, and a later resume() arms nothing",
  async () => {
    const { clock, log } = suspendableClock();
    const control: BoundHandle = {};
    const pending = runPinnedCodexCli(withBound(leafCommand(300, 30_000), control), clock);
    try {
      assert.equal(
        typeof control.suspend,
        "function",
        "runPinnedCodexCli wires suspend() onto the bound control before it returns",
      );
      control.suspend!();
      assert.deepEqual(
        log,
        ["set 30000", "clear"],
        "suspend() released the armed timer before the child exits on its own",
      );

      const result = await within(pending);
      assert.equal(result.timedOut, undefined, "the leaf's own exit is not reported as a timeout");
      assert.equal(result.code, 0, "the leaf's own exit code is reported");
      assert.equal(result.stdout, "done", "the leaf's own output is reported");
      assert.equal(result.stderr, "noted", "the leaf's own output is reported");
      assert.deepEqual(
        log,
        ["set 30000", "clear"],
        "settling while suspended releases nothing further, because nothing was armed",
      );

      assert.equal(
        typeof control.resume,
        "function",
        "runPinnedCodexCli wires resume() onto the bound control before it returns",
      );
      control.resume!();
      assert.deepEqual(
        log,
        ["set 30000", "clear"],
        "resume() after the child has settled arms nothing — an armed timer here would keep the " +
          "finished spawn reachable",
      );
    } finally {
      await within(pending).catch(() => undefined);
    }
  },
);

test(
  "suspended-bound-counts-only-leaf-time: a leaf that exceeds its bound in real leaf time is still " +
    "killed and reports timedOut despite one suspend/resume cycle on the system clock",
  async () => {
    const control: BoundHandle = {};
    const pending = runPinnedCodexCli(withBound(leafCommand(30_000, 400), control));
    try {
      assert.equal(
        typeof control.suspend,
        "function",
        "the default system clock still wires a suspend control onto the command",
      );
      assert.equal(
        typeof control.resume,
        "function",
        "the default system clock still wires a resume control onto the command",
      );
      control.suspend!();
      control.resume!();

      const result = await within(pending);
      assert.equal(
        result.timedOut,
        true,
        "leaf time past the 400ms bound still elapsed despite one suspend/resume cycle",
      );
    } finally {
      await within(pending).catch(() => undefined);
    }
  },
);

test(
  "suspended-bound-counts-only-leaf-time: a command carrying no bound control behaves exactly as " +
    "today — one setTimeout, one clearTimeout",
  async () => {
    const log: string[] = [];
    const clock = {
      setTimeout: (callback, ms) => {
        log.push(`set ${ms}`);
        return setTimeout(callback, ms);
      },
      clearTimeout: (handle) => {
        log.push("clear");
        clearTimeout(handle);
      },
    } satisfies CodexBoundClock;

    const result = await within(runPinnedCodexCli(leafCommand(0, 30_000), clock));
    assert.equal(result.timedOut, undefined);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "done");
    assert.equal(result.stderr, "noted");
    assert.deepEqual(log, ["set 30000", "clear"]);
  },
);

test(
  "suspended-bound-counts-only-leaf-time: the leaf time already spent is measured from the moment the " +
    "bound was armed, not from the clock's zero",
  async () => {
    const { clock, log, advance } = suspendableClock();
    // The bound is armed at a clock reading far from zero, as a real clock's always is.
    advance(1_000_000);
    const control: BoundHandle = {};
    const pending = runPinnedCodexCli(withBound(leafCommand(300, 30_000), control), clock);
    try {
      advance(10_000);
      control.suspend!();
      advance(40_000);
      control.resume!();
      assert.deepEqual(
        log,
        ["set 30000", "clear", "set 20000"],
        "resume() re-armed the 30 000 ms bound minus the 10 000 ms spent since it was armed",
      );
    } finally {
      await within(pending).catch(() => undefined);
    }
  },
);
