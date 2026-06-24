/**
 * The LIVE {@link TestExecutor} (ADR-0020 §3): the spine OBSERVES red/green ITSELF by RUNNING a
 * test command — the model never reports the verdict. The phase machine ships only the offline
 * {@link RecordingTestExecutor} double; this is the real runner that spawns a subprocess and reads
 * its exit code.
 *
 * Honesty property: red/green is a fact derived from a process exit code the spine watched, not a
 * claim a leaf could forge. A non-zero exit is a `red` (data, not an error) — {@link ShellTestExecutor.run}
 * NEVER throws on a red; it only rejects on a genuine spawn failure (e.g. ENOENT).
 */

import { execFile } from "node:child_process";

import type { TestExecutor, TestObservation } from "./phase-machine.js";

/** The captured outcome of one spawned test command. */
export interface ShellRunResult {
  stdout: string;
  stderr: string;
  /** The process exit code, or `null` if the process was killed by a signal. */
  code: number | null;
}

/** How a {@link ShellTestExecutor} turns a `testId` into a concrete command to spawn. */
export interface ShellCommand {
  /** The executable to run (a FILE, not a shell string — `execFile`, never a shell, to avoid injection). */
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
   * Optional per-command wall-clock budget in milliseconds. A command that runs longer is KILLED
   * (SIGKILL) and surfaces as a fail-closed RED (`code: null`) rather than an infinite wedge — see
   * {@link runShellCommand}. Defaults to {@link DEFAULT_PROOF_TIMEOUT_MS} when absent. Injectable so a
   * test can use a short value; the spine leaves it absent so production rides the one default.
   * Deliberately NOT part of `ShellCommandSchema` (the spec-borne `proof:` parser, file/args/cwd
   * only), so a node author cannot inject it on the inner proofCommand. The DELIBERATE per-node
   * authoring surface is `RealProofConfig.timeoutMs` (ADR-0104, owner-gated): the resolver
   * (`realProofCommand`) stamps that validated value onto THIS spine-internal field on the single
   * resolved proof command, so the override is declared in ONE schema-checked place and the budget
   * reaches both the spine's CONFIRM observation and the leaf's `run_proof`.
   */
  timeoutMs?: number;
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
}

/**
 * The default RED classifier (ADR-0020 §3 "right-kind red"): a missing-symbol / unresolved-module /
 * syntax / TS-diagnostic shape in stdout+stderr reads as a `compile` red; anything else (an assertion
 * failure, a panic) reads as a `runtime` red.
 */
export function defaultClassifyKind(
  out: ShellRunResult,
): "compile" | "runtime" {
  const text = `${out.stdout}\n${out.stderr}`;
  if (/cannot find name|is not defined|no such module|SyntaxError|TS\d{3,}/i.test(text)) {
    return "compile";
  }
  return "runtime";
}

/**
 * The live {@link TestExecutor}: spawns a resolved command per `testId`, captures stdout/stderr/exit
 * code, and maps `exit 0 => green`, `exit non-zero => red` (with a classified `kind`). Built on
 * `node:child_process.execFile` (file + arg vector, no shell — injection-safe). A red is DATA, so a
 * non-zero exit resolves normally; only a genuine spawn failure (ENOENT, etc.) rejects.
 */
export class ShellTestExecutor implements TestExecutor {
  private readonly resolver: ShellTestResolver;

  constructor(resolver: ShellTestResolver) {
    this.resolver = resolver;
  }

  async run(testId: string): Promise<TestObservation> {
    const cmd = this.resolver.command(testId);
    const out = await this.spawn(cmd);

    if (out.code === 0) {
      return { result: "green", testId };
    }

    const classify = this.resolver.classifyKind ?? defaultClassifyKind;
    const kind = classify(out);
    // exactOptionalPropertyTypes: only attach `kind` when it is defined.
    return kind === undefined
      ? { result: "red", testId }
      : { result: "red", kind, testId };
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
    if (!isScrubbedEnvKey(key)) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * The default wall-clock budget (ms) a spawned proof/feedback command gets when its
 * {@link ShellCommand} declares no {@link ShellCommand.timeoutMs}. A command that runs longer is
 * SIGKILLed and observed as a fail-closed RED ({@link runShellCommand}) — the backstop that stops a
 * hung proof (a leaked DB connector / socket / timer) from wedging the gate's CONFIRM observation
 * FOREVER (hit driving library#gate-5, 2026-06-25).
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
 * Spawn one {@link ShellCommand} and resolve with the captured {@link ShellRunResult}. Three RESOLVE
 * outcomes, one REJECT — an exit code or a kill is DATA, only a failure-to-START throws:
 *  - exit 0 → `code: 0` (a green);
 *  - non-zero exit → that numeric `code` (a red);
 *  - KILLED by a signal (the {@link ShellCommand.timeoutMs} / {@link DEFAULT_PROOF_TIMEOUT_MS}
 *    SIGKILL, or any external kill) → `code: null` — a fail-closed red, so a hung proof becomes an
 *    OBSERVABLE red instead of an infinite wedge of the gate's CONFIRM observation;
 *  - genuine spawn failure (ENOENT — the process never ran: no exit code AND no kill) → reject.
 * The child env is {@link scrubbedChildEnv} — see its env-honesty notes.
 *
 * Exported as the shared runner: the gate's CONFIRM observations spawn through it (via
 * {@link ShellTestExecutor}), and the spine feedback tool (the leaf's bounded `run_proof` /
 * `run_typecheck`) spawns the SAME command the same way — one oracle, two consumers, so the timeout
 * protects BOTH paths with one change.
 */
export function runShellCommand(cmd: ShellCommand): Promise<ShellRunResult> {
  return new Promise<ShellRunResult>((resolve, reject) => {
    const options: {
      cwd?: string;
      maxBuffer: number;
      env: NodeJS.ProcessEnv;
      timeout: number;
      killSignal: "SIGKILL";
    } = {
      maxBuffer: 64 * 1024 * 1024,
      // Per-command env overrides are merged LAST so they WIN over both the inherited env and the
      // scrub list (ADR-0064 DB-backed proof: force STORYTREE_DB_NAME to the disposable test DB).
      env: cmd.env !== undefined ? { ...scrubbedChildEnv(), ...cmd.env } : scrubbedChildEnv(),
      // Fail-closed timeout: a proof that outruns its budget is killed, so a hung observation can
      // never wedge the gate forever. Always a positive value (cmd.timeoutMs OR the default — never
      // 0/absent, which execFile reads as NO timeout), so the backstop can't be silently disabled.
      // SIGKILL, not the default SIGTERM: a wedged process ignoring a catchable signal must still die.
      timeout: cmd.timeoutMs ?? DEFAULT_PROOF_TIMEOUT_MS,
      killSignal: "SIGKILL",
    };
    if (cmd.cwd !== undefined) {
      options.cwd = cmd.cwd;
    }
    execFile(cmd.file, cmd.args, options, (error, stdout, stderr) => {
      if (error === null) {
        resolve({ stdout, stderr, code: 0 });
        return;
      }
      // execFile annotates the error three ways:
      //  - a NUMERIC `code`: the process ran and exited non-zero — a red (data); surface it.
      //  - `killed`/`signal` set: the process RAN but a signal terminated it before it could exit (our
      //    timeout SIGKILL, or any external kill) — a fail-closed RED with NO exit code (`null`), the
      //    timeout backstop. NEVER a reject: a hung proof must be an observable red, not a wedge.
      //  - neither: a genuine spawn failure (ENOENT etc.) — the command never ran, so reject.
      const err = error as NodeJS.ErrnoException & {
        code?: number | string;
        killed?: boolean;
        signal?: NodeJS.Signals | null;
      };
      if (typeof err.code === "number") {
        resolve({ stdout, stderr, code: err.code });
        return;
      }
      if (err.killed === true || (err.signal !== undefined && err.signal !== null)) {
        resolve({ stdout, stderr, code: null });
        return;
      }
      reject(
        new Error(
          `failed to spawn '${cmd.file}' (${String(err.code ?? error.message)}): the command did not run, so its exit code could not be observed`,
          { cause: error },
        ),
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
