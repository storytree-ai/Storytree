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

  /**
   * Spawn the command and resolve with the captured {@link ShellRunResult}. A non-zero exit is NOT a
   * rejection — `execFile`'s error carries the exit `code`, which we surface as data. We only reject
   * when there is NO exit code (a genuine spawn failure such as ENOENT, where the process never ran).
   *
   * ENV HONESTY: every `NODE_TEST*` variable is SCRUBBED from the child env. When the spine itself
   * runs under `node --test` (our own suite, CI), the runner exports `NODE_TEST_CONTEXT` to its
   * children; a spawned `node --test <file>` that inherits it behaves as a coordinated test-runner
   * child and can exit 0 WITHOUT running the file — observed as a FORGED GREEN at CONFIRM_RED.
   * The observation must come from a process whose verdict channel is its own exit code only.
   */
  private spawn(cmd: ShellCommand): Promise<ShellRunResult> {
    return new Promise<ShellRunResult>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith("NODE_TEST")) {
          env[key] = value;
        }
      }
      const options: { cwd?: string; maxBuffer: number; env: NodeJS.ProcessEnv } = {
        maxBuffer: 64 * 1024 * 1024,
        env,
      };
      if (cmd.cwd !== undefined) {
        options.cwd = cmd.cwd;
      }
      execFile(cmd.file, cmd.args, options, (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr, code: 0 });
          return;
        }
        // execFile annotates the error with `code` (number) on a non-zero exit, or a string errno
        // ('ENOENT', etc.) on a genuine spawn failure. Distinguish: a numeric `code` is a real exit
        // (a red), so surface it as data; anything else is a spawn failure we reject on.
        const exit = (error as NodeJS.ErrnoException & { code?: number | string }).code;
        if (typeof exit === "number") {
          resolve({ stdout, stderr, code: exit });
          return;
        }
        reject(
          new Error(
            `ShellTestExecutor failed to spawn '${cmd.file}' (${String(exit ?? error.message)}): the test command did not run, so red/green could not be observed`,
            { cause: error },
          ),
        );
      });
    });
  }
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
