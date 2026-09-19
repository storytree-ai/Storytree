/**
 * The LIVE {@link TestExecutor} (ADR-0020 §3): the spine OBSERVES red/green ITSELF by RUNNING a
 * test command — the model never reports the verdict. The phase machine ships only the offline
 * {@link RecordingTestExecutor} double; this is the real runner that spawns a subprocess and reads
 * its exit code.
 *
 * Honesty property: red/green is a fact derived from a process exit code the spine watched, not a
 * claim a leaf could forge. A non-zero exit is a `red` (data, not an error) —
 * {@link ShellTestExecutor.run} NEVER throws on a red. It rejects only observation-infrastructure
 * failures: no spawn, pre-deadline output overflow, or unconfirmed force-stop delivery.
 */

import { execFileSync, spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";

import type { TestExecutor, TestObservation } from "./phase-machine.js";
import type { PerTestReportSource } from "./proof/per-test-report.js";

/** The captured outcome of one spawned test command. */
export interface ShellRunResult {
  stdout: string;
  stderr: string;
  /** The process exit code, or `null` if the process was killed by a signal. */
  code: number | null;
}

/** How a {@link ShellTestExecutor} turns a `testId` into a concrete command to spawn. */
export interface ShellCommand {
  /** The executable to run (a FILE + argv through `spawn`; {@link shell} is the explicit exception). */
  file: string;
  /** The argument vector passed to {@link ShellCommand.file}. */
  args: string[];
  /** Optional working directory for the spawned process. */
  cwd?: string;
  /**
   * Optional env overrides MERGED OVER {@link scrubbedChildEnv} (these win, so they FORCE a value
   * even if the parent env or the scrub list would set/strip it). The DB-backed proof seam
   * (ADR-0064) uses this to force `STORYTREE_DB_NAME` to the disposable test database — so the proof
   * can never reach production even when the parent process points at it. Spine-only: a spec-borne
   * `proofCommand` is parsed by `ShellCommandSchema`, which does NOT accept `env` (file/args/cwd
   * only), so a node author can never inject env here.
   */
  env?: Record<string, string>;
  /**
   * Optional per-command wall-clock budget in milliseconds. A command that runs longer has the
   * still-live root's owned POSIX process group or taskkill-reachable Windows tree force-stopped and
   * normally surfaces as a fail-closed RED (`code: null`) rather than an infinite wedge — see
   * {@link runShellCommand}. Defaults to {@link DEFAULT_PROOF_TIMEOUT_MS} when absent. Injectable so
   * a test can use a short value; the spine leaves it absent so production rides the one default.
   * Deliberately NOT part of `ShellCommandSchema` (the spec-borne `proof:` parser, file/args/cwd
   * only), so a node author cannot inject it on the inner proofCommand. The DELIBERATE per-node
   * authoring surface is `RealProofConfig.timeoutMs` (ADR-0104, owner-gated): the resolver
   * (`realProofCommand`) stamps that validated value onto THIS spine-internal field on the single
   * resolved proof command, so the override is declared in ONE schema-checked place and the budget
   * reaches both the spine's CONFIRM observation and the leaf's `run_proof`.
   */
  timeoutMs?: number;
  /**
   * Run {@link ShellCommand.file} THROUGH the platform shell (`cmd.exe` / `sh`) instead of spawning it
   * as a file with an argument vector. When set, `file` carries the WHOLE command line and `args` is
   * empty, so quoting and shell operators (`&&`, a pipe, a redirect) behave as the author wrote them.
   *
   * SPINE-INTERNAL, and deliberately narrow (ADR-0421). It exists for ONE caller: the OBSERVE path,
   * where the command is committed story prose in `stories/<id>/story.md`, reviewed on a PR, and
   * already able to run arbitrary code — see {@link shellObserveCommand}. It is NOT part of
   * `ShellCommandSchema` (the parser for a spec-borne `proof:` command, which accepts file/args/cwd
   * only), exactly as `env` and `timeoutMs` are not, so the LEAF proof path keeps its no-shell rule:
   * a model can never reach a shell and nothing in a node spec can turn one on.
   */
  shell?: boolean;
}

/**
 * The OBSERVE path's command builder (ADR-0421 D1): run a story's declared `proofCommand` STRING
 * through the platform shell, AS WRITTEN.
 *
 * The old shape whitespace-split the string into an `execFile` vector, which silently shredded any
 * command a shell would parse: `node -e "…"` reached node as `-e` `"import` plus seven stray argv
 * entries, and a `&&` was passed to the first command as a literal argument. Neither can ever exit 0,
 * and the spine reported the result as an ordinary red with the command echoed back — indistinguishable
 * from a genuine failure. Six `ci-cd` gates sat unobservable that way from the day they were authored,
 * stranding the six machine UAT legs bound to them.
 */
export function shellObserveCommand(command: string, cwd: string): ShellCommand {
  return { file: command, args: [], cwd, shell: true };
}

/**
 * The resolver a {@link ShellTestExecutor} is constructed with.
 *  - `command(testId)` maps a `testId` to the {@link ShellCommand} to spawn.
 *  - `classifyKind(out)` optionally classifies a RED's `kind` from the captured output; when absent,
 *    {@link defaultClassifyKind} is used.
 */
export interface ShellTestResolver {
  command: (testId: string) => ShellCommand;
  classifyKind?: (out: ShellRunResult) => "compile" | "runtime" | undefined;
  /**
   * ADR-0573 D2 (optional): the per-test report this proof command writes. The executor CLEARS it before
   * the spawn — a report that survives the clear makes the observation a fail-closed red without
   * spawning, because a report the spine could not clear cannot be attributed to the run that follows
   * (ADR-0249's rule) — and READS it right after, attaching what this run wrote to the observation as
   * `perTest`, red or green.
   *
   * It changes nothing the executor decides: red/green stays the exit code. The gate's per-test review
   * is what reads the report, and it can only refuse (ADR-0573 D1). Absent ⇒ the observation carries no
   * `perTest` (unchanged).
   */
  perTestReport?: PerTestReportSource;
}

/**
 * The default RED classifier (ADR-0020 §3 "right-kind red"): a missing-symbol / unresolved-module /
 * syntax / TS-diagnostic shape in stdout+stderr reads as a `compile` red; anything else (an assertion
 * failure, a panic) reads as a `runtime` red.
 *
 * The module-resolution alternatives were WRONG for years and nothing caught it
 * (`gate-the-right-kind-red`). The list read `cannot find name|is not defined|no such module|…`,
 * which is TypeScript's and some other toolchain's wording — and matches NONE of what Node actually
 * prints for the dominant case. A net-new node's red IS an unresolved import, Node says
 * `Cannot find module './thing.js'` / `ERR_MODULE_NOT_FOUND`, and this returned `runtime`. So every
 * net-new verdict's evidence note has been claiming "observed red (runtime)" over a structural red.
 *
 * It survived because nothing DEPENDED on the answer: the value was dead to control flow but live to
 * the attestation, so it was exercised on every red and published on every verdict while no test
 * could ever go red over it being wrong. It is still a REPORTING value only — no phase transition
 * refuses on it (ADR-0580 D1). Whether a red is an assertion or a crash is judged by the per-test
 * review from the runner's own report (ADR-0573 C5), never from this heuristic.
 */
export function defaultClassifyKind(
  out: ShellRunResult,
): "compile" | "runtime" {
  const text = `${out.stdout}\n${out.stderr}`;
  if (
    /cannot find name|cannot find module|cannot find package|is not defined|no such module|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|MODULE_NOT_FOUND|SyntaxError|TS\d{3,}/i.test(
      text,
    )
  ) {
    return "compile";
  }
  return "runtime";
}

/** What every observation a spawn produces carries: its process result, and its per-test report when one was read. */
type SpawnedObservation = Pick<TestObservation, "originalProcessResult" | "perTest">;

/**
 * The live {@link TestExecutor}: spawns a resolved command per `testId`, captures stdout/stderr/exit
 * code, and maps `exit 0 => green`, `exit non-zero => red` (with a classified `kind`). Built on
 * `node:child_process.spawn` (file + arg vector, no shell unless the resolved command explicitly
 * opts in). A red is DATA, so a non-zero exit resolves normally; observation-infrastructure failures
 * reject distinctly.
 */
export class ShellTestExecutor implements TestExecutor {
  private readonly resolver: ShellTestResolver;

  constructor(resolver: ShellTestResolver) {
    this.resolver = resolver;
  }

  async run(testId: string): Promise<TestObservation> {
    // ADR-0573 D2, under ADR-0249's rule: the per-test report is cleared before the spawn — a report
    // that survives would be read back as this run's. Fail-closed: if it cannot be cleared, the
    // observation is a red and the command is never spawned.
    const perTestCleared = this.resolver.perTestReport?.reset();
    if (perTestCleared !== undefined && !perTestCleared.ok) {
      return { result: "red", kind: "runtime", testId, note: perTestCleared.reason };
    }

    const cmd = this.resolver.command(testId);
    const out = await this.spawn(cmd);
    // Read what THIS run wrote, before anything else can touch the path.
    const perTest = this.resolver.perTestReport?.read();
    const spawned: SpawnedObservation = {
      originalProcessResult: {
        stdout: out.stdout,
        stderr: out.stderr,
        exitCode: out.code,
      },
    };
    if (perTest !== undefined) spawned.perTest = perTest;

    if (out.code === 0) {
      return { result: "green", testId, ...spawned };
    }

    const classify = this.resolver.classifyKind ?? defaultClassifyKind;
    const kind = classify(out);
    // exactOptionalPropertyTypes: only attach `kind` when it is defined.
    return kind === undefined
      ? { result: "red", testId, ...spawned }
      : { result: "red", kind, testId, ...spawned };
  }

  /** Spawn via the shared {@link runShellCommand} (env-scrubbed, exit-code-as-data). */
  private spawn(cmd: ShellCommand): Promise<ShellRunResult> {
    return runShellCommand(cmd);
  }
}

/**
 * Env-var names that never reach a spawned test/feedback process. Two scrub families:
 *  - `NODE_TEST*` (the forged-green fix): when the spine itself runs under `node --test`, the
 *    runner exports `NODE_TEST_CONTEXT` to its children; a spawned `node --test <file>` that
 *    inherits it behaves as a coordinated test-runner child and can exit 0 WITHOUT running the
 *    file — observed as a FORGED GREEN at CONFIRM_RED. The observation must come from a process
 *    whose verdict channel is its own exit code only.
 *  - secret-shaped names (TOKEN/SECRET/PASSWORD/CREDENTIAL/API_KEY/ACCESS_KEY): the leaf authors
 *    the test file this command executes, and with the spine feedback tool its OUTPUT flows back
 *    to the model — a test that prints `process.env` must find no credentials there.
 */
export function isScrubbedEnvKey(key: string): boolean {
  return (
    key.startsWith("NODE_TEST") ||
    /TOKEN|SECRET|PASSWORD|CREDENTIAL|API_?KEY|ACCESS_KEY/i.test(key)
  );
}

/** The child env every spawned test/feedback process gets: the parent env minus the scrub list. */
export function scrubbedChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (isScrubbedEnvKey(key)) {
      continue;
    }
    env[key] = value;
  }
  return env;
}

/**
 * The default wall-clock budget (ms) a spawned proof/feedback command gets when its
 * {@link ShellCommand} declares no {@link ShellCommand.timeoutMs}. A command that runs longer is
 * force-stopped within the still-live root's owned/reachable process scope and observed as a
 * fail-closed RED ({@link runShellCommand}) — the backstop that stops a hung proof (a leaked DB
 * connector / socket / timer) from wedging the gate's CONFIRM observation FOREVER (hit driving
 * library#gate-5, 2026-06-25).
 *
 * 10 minutes — generous ON PURPOSE: it must clear the slowest LEGITIMATE proof so the timeout only
 * ever kills a genuine hang, never false-REDs real work. The slow case is a db-backed proof
 * (`real.db`, ADR-0064) whose first Cloud SQL connection rides a cold-start / idle-wake handshake
 * (measured ~5–6 min; cf. `db-control.ts`'s 420s connectivity budget). Leaf discipline
 * (`real-test-must-not-leak-a-handle`) is the fast path; this is only the safety net, so "fail closed
 * eventually" rightly beats "fail fast and risk a false red". OWNER CALL - RESOLVED (ADR-0104, both):
 * this stays the spine-wide FALLBACK, AND a node may OVERRIDE it per-node via `RealProofConfig.timeoutMs`
 * (a fast builtins-only node:test can declare a tight budget; a db:true node on a cold connector a
 * longer one). The override is the deliberate, schema-validated authoring surface; this default is what
 * a node that declares nothing rides.
 */
export const DEFAULT_PROOF_TIMEOUT_MS = 10 * 60_000;

/**
 * Spawn one {@link ShellCommand} and resolve with the captured {@link ShellRunResult}. Process
 * outcomes are DATA; observation-infrastructure failures are distinct rejections:
 *  - exit 0 → `code: 0` (a green);
 *  - non-zero exit → that numeric `code` (a red);
 *  - force-stop delivered at the {@link ShellCommand.timeoutMs} / {@link DEFAULT_PROOF_TIMEOUT_MS}
 *    deadline, an already-observed exited root, or an external signal → `code: null` — fail-closed;
 *  - genuine spawn failure (ENOENT — the process never ran) → command-never-ran rejection;
 *  - a per-stream capture overflow before the deadline → structured maxBuffer rejection;
 *  - force-stop delivery not confirmed for a still-live root → structured termination rejection.
 * The child env is {@link scrubbedChildEnv} — see its env-honesty notes.
 *
 * Exported as the shared runner: the gate's CONFIRM observations spawn through it (via
 * {@link ShellTestExecutor}), and the spine feedback tool (the leaf's bounded `run_proof` /
 * `run_typecheck`) spawns the SAME command the same way — one oracle, two consumers, so the timeout
 * protects BOTH paths with one change.
 */
/** The same generous capture ceiling the former `execFile` runner supplied to each output stream. */
export const SHELL_COMMAND_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
// `taskkill /T /F` has exceeded two seconds while enumerating even this runner's three-process
// fixture under a saturated Windows gate. Keep native delivery bounded, but do not turn ordinary
// scheduler contention into a false infrastructure failure after the proof has already timed out.
const WINDOWS_TREE_TERMINATION_TIMEOUT_MS = 10_000;
const TREE_TERMINATION_DRAIN_MS = 1_000;

export type ShellTreeTerminationDelivery =
  | { readonly delivered: true }
  | { readonly delivered: false; readonly cause: Error };

export class ShellCommandMaxBufferError extends Error {
  readonly code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" as const;

  constructor(
    readonly stream: "stdout" | "stderr",
    readonly limitBytes: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(
      `${stream} maxBuffer length exceeded (${limitBytes} bytes): the command ran, but its ${stream} exceeded the per-stream capture limit`,
    );
    this.name = "ShellCommandMaxBufferError";
  }
}

export class ShellCommandTreeTerminationError extends Error {
  readonly code = "ERR_CHILD_PROCESS_TREE_TERMINATION" as const;

  constructor(
    readonly pid: number,
    readonly target: "posix-process-group" | "windows-process-tree",
    readonly stdout: string,
    readonly stderr: string,
    cause: Error,
  ) {
    const targetLabel =
      target === "posix-process-group" ? "owned POSIX process group" : "reachable Windows process tree";
    super(
      `proof deadline expired, but force-stop delivery to the ${targetLabel} rooted at pid ${pid} was not confirmed`,
      { cause },
    );
    this.name = "ShellCommandTreeTerminationError";
  }
}

type SpawnedShellCommand = Pick<
  ChildProcessWithoutNullStreams,
  "pid" | "stdin" | "stdout" | "stderr" | "exitCode" | "signalCode" | "unref"
> & {
  once(event: "spawn", listener: () => void): unknown;
  once(
    event: "exit" | "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
};

/** @internal Injectable only so process-lifecycle tests can prove that an exited PID is never reused. */
export interface ShellCommandRuntime {
  readonly maxBufferBytes: number;
  readonly platform: NodeJS.Platform;
  readonly terminateProcessTree: (pid: number) => ShellTreeTerminationDelivery;
  readonly terminationDrainMs?: number;
  readonly spawnCommand?: (
    file: string,
    args: string[],
    options: SpawnOptionsWithoutStdio,
  ) => SpawnedShellCommand;
}

/**
 * Ask the OS to force-stop one spawned command's owned group/reachable tree.
 *
 * The command is often a wrapper (`cmd.exe /c pnpm` on Windows, a pnpm/shim process on POSIX), so
 * killing only its PID leaves Bun/Node descendants alive. Those descendants can retain the command's
 * stdout/stderr pipes, keep the callback pending past the declared budget, and race worktree teardown.
 * This mirrors the proven tree primitive in drive's `spawn-stop.ts` without reversing the package
 * edge: Windows asks `taskkill /T /F` while Node has not yet observed root exit; POSIX signals the
 * detached process group while its leader is still observed live. After leader exit, neither a PID
 * nor a numeric PGID is retained as ownership proof: descendants may have escaped, the original
 * group may have emptied, and either number may be reused. Windows also has an unavoidable
 * check-to-taskkill race without a Job Object/process handle, so a successful helper call means
 * delivery was accepted, not that PID reuse was impossible. There is NO bare-PID fallback.
 */
function terminateProcessTree(pid: number): ShellTreeTerminationDelivery {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        timeout: WINDOWS_TREE_TERMINATION_TIMEOUT_MS,
        windowsHide: true,
      });
      return { delivered: true };
    } catch (cause) {
      // Never fall back to `process.kill(pid)`: taskkill may have lost an exit/reuse race, and the
      // positive number no longer proves ownership. The bounded pipe-drain path below still returns
      // an explicit delivery failure without risking a second signal against a sibling process.
      return {
        delivered: false,
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      };
    }
  }

  try {
    // `runShellCommand` starts the command detached on POSIX, making `pid` its process-group id.
    process.kill(-pid, "SIGKILL");
    return { delivered: true };
  } catch (cause) {
    // No positive-PID fallback here either. With `detached:true`, group delivery is the ownership-safe
    // primitive; ESRCH means there is no owned group left to target and is surfaced distinctly.
    return {
      delivered: false,
      cause: cause instanceof Error ? cause : new Error(String(cause)),
    };
  }
}

export function runShellCommand(cmd: ShellCommand): Promise<ShellRunResult> {
  return runShellCommandWithRuntime(cmd, {
    maxBufferBytes: SHELL_COMMAND_MAX_BUFFER_BYTES,
    platform: process.platform,
    terminateProcessTree,
  });
}

/** @internal Production goes through {@link runShellCommand}; this seam makes lifecycle facts testable. */
export function runShellCommandWithRuntime(
  cmd: ShellCommand,
  runtime: ShellCommandRuntime,
): Promise<ShellRunResult> {
  return new Promise<ShellRunResult>((resolve, reject) => {
    const timeoutMs = cmd.timeoutMs ?? DEFAULT_PROOF_TIMEOUT_MS;
    const options: SpawnOptionsWithoutStdio = {
      // Per-command env overrides are merged LAST so they WIN over both the inherited env and the
      // scrub list (ADR-0064 DB-backed proof: force STORYTREE_DB_NAME to the disposable test DB).
      env: cmd.env !== undefined ? { ...scrubbedChildEnv(), ...cmd.env } : scrubbedChildEnv(),
      // Unlike `execFile`, `spawn` really forwards `detached`; on POSIX that calls setsid(2), making
      // this child's PID the process-group id that the negative-PID timeout below can safely target.
      detached: runtime.platform !== "win32",
      windowsHide: runtime.platform === "win32",
      shell: cmd.shell === true,
    };
    if (cmd.cwd !== undefined) {
      options.cwd = cmd.cwd;
    }

    const child = (runtime.spawnCommand ?? spawn)(cmd.file, cmd.args, options);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;
    let rootExitObserved = false;
    let spawnObserved = false;
    let ownedHandlesReleased = false;
    let closeObservedAfterTimeout = false;
    let timeout: NodeJS.Timeout | undefined;
    let terminationDrain: NodeJS.Timeout | undefined;

    type TerminationRequest =
      | { readonly kind: "not-attempted"; readonly reason: "root-exited" }
      | {
          readonly kind: "delivered";
          readonly pid: number;
          readonly target: "posix-process-group" | "windows-process-tree";
        }
      | {
          readonly kind: "undelivered";
          readonly pid: number;
          readonly target: "posix-process-group" | "windows-process-tree";
          readonly cause: Error;
        };
    let timeoutTermination: "pending" | TerminationRequest | undefined;

    const output = (): Pick<ShellRunResult, "stdout" | "stderr"> => ({
      stdout: Buffer.concat(stdout, stdoutBytes).toString("utf8"),
      stderr: Buffer.concat(stderr, stderrBytes).toString("utf8"),
    });

    const clearDeadline = (): void => {
      if (timeout !== undefined) clearTimeout(timeout);
      if (terminationDrain !== undefined) clearTimeout(terminationDrain);
      timeout = undefined;
      terminationDrain = undefined;
    };

    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearDeadline();
      resolve({ ...output(), code });
    };

    const failWith = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearDeadline();
      reject(error);
    };

    const failSpawn = (error: Error & { code?: number | string }): void => {
      failWith(
        new Error(
          `failed to spawn '${cmd.file}' (${String(error.code ?? error.message)}): the command did not run, so its exit code could not be observed`,
          { cause: error },
        ),
      );
    };

    const rootHasExited = (): boolean =>
      rootExitObserved || child.exitCode !== null || child.signalCode !== null;

    const closeOwnedPipes = (): void => {
      if (ownedHandlesReleased) return;
      ownedHandlesReleased = true;
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      // If OS termination failed, closed pipes alone do not release ChildProcess's referenced process
      // handle. The Promise may resolve, but the CLI would still be wedged. Once this runner has
      // abandoned the observation, unref that handle so an immortal root cannot own the event loop.
      child.unref();
    };

    const requestTreeTermination = (): TerminationRequest => {
      // Once the root exit is observed, its numeric PID is stale. The POSIX number was also the PGID,
      // but Node cannot prove the original group still exists: every member may have left while an
      // escaped descendant alone retains a pipe, allowing that PGID to be reused. Without a retained
      // OS handle/job object, neither platform may signal the number after observed root exit.
      if (rootHasExited()) {
        return { kind: "not-attempted", reason: "root-exited" };
      }
      const pid = child.pid;
      if (pid === undefined) {
        return {
          kind: "undelivered",
          pid: -1,
          target:
            runtime.platform === "win32" ? "windows-process-tree" : "posix-process-group",
          cause: new Error("spawned command exposed no process id for deadline termination"),
        };
      }
      const target =
        runtime.platform === "win32" ? "windows-process-tree" : "posix-process-group";
      let delivery: ShellTreeTerminationDelivery;
      try {
        delivery = runtime.terminateProcessTree(pid);
      } catch (cause) {
        delivery = {
          delivered: false,
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        };
      }
      return delivery.delivered
        ? { kind: "delivered", pid, target }
        : { kind: "undelivered", pid, target, cause: delivery.cause };
    };

    const capture = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      if (settled) return;
      const chunks = stream === "stdout" ? stdout : stderr;
      const currentBytes = stream === "stdout" ? stdoutBytes : stderrBytes;
      const chunkBytes = chunk.byteLength;
      if (currentBytes + chunkBytes > runtime.maxBufferBytes) {
        const remaining = runtime.maxBufferBytes - currentBytes;
        if (remaining > 0) {
          chunks.push(chunk.subarray(0, remaining));
          if (stream === "stdout") stdoutBytes += remaining;
          else stderrBytes += remaining;
        }
        // Once the deadline callback starts, timeout owns the terminal result. A final burst emitted
        // while force-stop is being delivered may fill the bounded capture, but it cannot rewrite the
        // already-expired command into a maxBuffer rejection.
        if (timedOut) return;
        const captured = output();
        // Claim the terminal result BEFORE asking the synchronous native helper to stop the
        // producer. An injected helper (and, in principle, a native wrapper) may cause `close`
        // re-entrantly; that close must not turn an already-observed overflow into a numeric green.
        failWith(
          new ShellCommandMaxBufferError(
            stream,
            runtime.maxBufferBytes,
            captured.stdout,
            captured.stderr,
          ),
        );
        requestTreeTermination();
        closeOwnedPipes();
        return;
      }
      chunks.push(chunk);
      if (stream === "stdout") stdoutBytes += chunkBytes;
      else stderrBytes += chunkBytes;
    };

    // Keep raw chunks until the observation closes: `maxBuffer` is a byte ceiling, not a JavaScript
    // character ceiling, and decoding first makes a partial multibyte chunk impossible to trim safely.
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));

    child.once("spawn", () => {
      spawnObserved = true;
      // Start only after a real spawn so ENOENT remains a spawn failure. The timer remains armed after
      // `exit`: descendants may still own the pipes, and `close` (the former execFile callback point)
      // has not happened until those pipes close.
      timeout = setTimeout(() => {
        timedOut = true;
        // `terminateProcessTree` is synchronous and an injected/native implementation may trigger
        // data/close re-entrantly. Publish PENDING first so those events cannot settle a numeric exit
        // or maxBuffer result before delivery status is known.
        timeoutTermination = "pending";
        timeoutTermination = requestTreeTermination();
        if (timeoutTermination.kind === "not-attempted") {
          // Root already exited: neither its numeric PID nor its former PGID remains ownership proof,
          // and no stdlib tree handle survives. Bound the observation by dropping only the pipes this
          // runner owns; descendants are left unclaimed rather than risking an unrelated process.
          closeOwnedPipes();
          finish(null);
          return;
        }
        // A delivered tree kill normally closes inherited pipes promptly. An undelivered request must
        // remain a distinct infrastructure error. Both cases get the same bounded drain so neither a
        // failed helper nor a stubborn process can own this runner's handles indefinitely.
        terminationDrain = setTimeout(() => {
          closeOwnedPipes();
          settleTimedOut();
        }, runtime.terminationDrainMs ?? TREE_TERMINATION_DRAIN_MS);
        if (closeObservedAfterTimeout) settleTimedOut();
      }, timeoutMs);
    });

    const settleTimedOut = (): void => {
      if (!timedOut || timeoutTermination === undefined || timeoutTermination === "pending") return;
      if (timeoutTermination.kind === "undelivered") {
        const captured = output();
        failWith(
          new ShellCommandTreeTerminationError(
            timeoutTermination.pid,
            timeoutTermination.target,
            captured.stdout,
            captured.stderr,
            timeoutTermination.cause,
          ),
        );
        return;
      }
      finish(null);
    };

    child.once("exit", () => {
      rootExitObserved = true;
    });
    child.once("close", (code, signal) => {
      if (timedOut) {
        closeObservedAfterTimeout = true;
        settleTimedOut();
        return;
      }
      if (signal !== null) {
        finish(null);
        return;
      }
      if (typeof code === "number") {
        finish(code);
        return;
      }
      failWith(new Error("the spawned command closed without an exit code or signal"));
    });
    child.once("error", (error) => {
      closeOwnedPipes();
      if (timedOut) {
        closeObservedAfterTimeout = true;
        settleTimedOut();
        return;
      }
      if (!spawnObserved) {
        failSpawn(error);
        return;
      }
      failWith(
        new Error(`spawned command '${cmd.file}' failed before its exit could be observed`, {
          cause: error,
        }),
      );
    });
  });
}

/**
 * A convenience resolver for OFFLINE tests: maps each `testId` to `process.execPath -e <script>`, so a
 * test can script a green (`'process.exit(0)'`), a runtime red (`'process.exit(1)'`), or a
 * compile-shaped red (`'console.error("cannot find name X"); process.exit(1)'`) with NO files on disk.
 *
 * @param scripts a `testId -> node-script-source` map. Spawns the SAME Node binary running the spine.
 */
export function nodeEvalExecutor(
  scripts: Record<string, string>,
): ShellTestExecutor {
  return new ShellTestExecutor({
    command: (testId: string): ShellCommand => {
      const script = scripts[testId];
      if (script === undefined) {
        throw new Error(
          `nodeEvalExecutor: no script for testId '${testId}'`,
        );
      }
      return { file: process.execPath, args: ["-e", script] };
    },
  });
}
