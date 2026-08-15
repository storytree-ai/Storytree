// The gate's LIVENESS signal — the PURE half. Turns two CPU samples of a step's process tree into a
// verdict a reader can act on, and renders the one line that verdict is worth.
//
// WHY THIS EXISTS (`shared-box-session-ownership-arc` end state 4, from the friction
// `concurrent-gates-on-one-dev-box-wedge-each-other-silently`). `pnpm gate` had no liveness signal at
// all, so from the outside a WEDGED step and a SLOW step were the same observation: a step number that
// had not advanced. The only way to tell them apart was to leave the tool and read process CPU by
// hand (`Get-Process node | Sort-Object CPU`) — which is exactly the manoeuvre this arc's first two
// increments exist to remove, because on a shared box a hand-read of the process table is what leads a
// session to sweep a sibling's live work by start time.
//
// ELAPSED TIME IS NOT THE SIGNAL, and that is the whole design constraint. Measured on 2026-08-14: the
// `pnpm -r --no-bail test` leg went ~10 minutes with NO new output while workspaces were genuinely
// running, because `pnpm -r` buffers a workspace's output and prints it when that workspace finishes.
// SILENCE IS THE NORMAL APPEARANCE OF A LARGE WORKSPACE MID-SUITE. A timer would therefore report the
// healthy case and the wedged case identically — it would only restate the observation the reader
// already had. What separates them is whether the step's processes are DOING anything, so the measure
// has to be work performed, not time passed.
//
// WHY CPU AND NOT OUTPUT BYTES. Output activity is the obvious progress measure and is not available
// here: `stdio: "inherit"` is load-bearing (the runner's own header promises every check "prints
// exactly what it always did"), and piping to count bytes would change colour handling and
// interleaving for every step in the plan. Child-tree CPU survives `inherit` untouched.
//
// THE THREE VERDICTS ARE HONEST ABOUT WHAT THEY PROVE, and `idle` is the one to read carefully: a
// process tree burning no CPU is BLOCKED — on I/O, on a lock, on a network wait — or WEDGED, and
// nothing here can tell those apart. Saying "wedged" would be a claim the measurement does not
// support. What it does deliver is the discrimination that was missing: `progressing` positively
// acquits the quiet-but-working case, which is the common one and the one that used to cost a
// hand-read of the process table. And `idle` is fenced by {@link MIN_IDLE_WINDOW_MS}, because over a
// short window a lull and a stall are also the same reading — the asymmetry is deliberate: evidence of
// work needs no minimum window, an ABSENCE of it does.
//
// NOTHING HERE EVER CHANGES A VERDICT. Liveness is reporting only: it cannot red a step, cannot stop
// one, and `unknown` is a first-class outcome rather than a failure — the same ADR-0328 D3 discipline
// `holdsLiveWork` and `own stop` already apply. A measurement that could not be taken says so.
//
// Pure: no spawning, no clock of its own. The caller injects the samples ({@link file://./gate-liveness-probe.ts}).

/** One measurement of a step's process tree. `processes` is `null` when it could not be taken. */
export interface CpuSample {
  /** Epoch ms the sample was taken. */
  readonly at: number;
  /**
   * pid → that process's CUMULATIVE CPU seconds, for every live process in the tree; `null` when the
   * table could not be read.
   *
   * PER-PID RATHER THAN A TOTAL, and that is not tidiness — a bare total is unusable here. Each
   * value is cumulative-since-that-process-started, so a total over LIVE processes moves for two
   * unrelated reasons: work being done, and the tree's membership changing. Keeping the pids is what
   * lets {@link classifyLiveness} separate them.
   */
  readonly processes: ReadonlyMap<number, number> | null;
  /** Why the sample is `null`, when it is. */
  readonly note?: string;
}

export type LivenessVerdict =
  | {
      readonly kind: "progressing";
      /** Which observation carried it: CPU burned, or the tree's shape changing. */
      readonly evidence: "cpu" | "tree-changed";
      readonly cpuDeltaSeconds: number;
      readonly windowMs: number;
      readonly processCount: number;
    }
  | {
      readonly kind: "idle";
      readonly cpuDeltaSeconds: number;
      readonly windowMs: number;
      readonly processCount: number;
    }
  | { readonly kind: "unknown"; readonly reason: string };

/**
 * How much CPU the tree must burn across one window to count as progressing.
 *
 * Deliberately small. This is not a performance bar — the question is "is anything happening at all?",
 * and half a second of CPU across a whole process tree is far below anything a working step produces
 * while comfortably above the noise a mostly-idle supervisor accrues.
 */
export const CPU_PROGRESS_THRESHOLD_SECONDS = 0.5;

/**
 * The shortest window over which an absence of CPU is allowed to be called `idle`.
 *
 * MEASURED, not chosen for tidiness. Proving this against a real `pnpm -r typecheck` at a 5-second
 * debug interval produced two `NO CPU PROGRESS` lines during a step that was demonstrably healthy — a
 * healthy tree genuinely idles for a few seconds between spawns while `pnpm` walks the workspace
 * graph. Over a short window a LULL and a STALL are the same reading, so reporting either would be a
 * claim the measurement does not support; below this the verdict is `unknown` and says why. At the
 * runner's 60-second default every window clears this comfortably, so the signal is unaffected — what
 * it removes is the false alarm at debug intervals, which is the shape that would teach a reader to
 * ignore the line.
 */
export const MIN_IDLE_WINDOW_MS = 30_000;

/**
 * Classify a step's liveness from two consecutive samples.
 *
 * A TOTAL OVER LIVE PROCESSES IS NOT A MEASURE OF WORK DONE, and missing that produces the most
 * misleading reading available here. Each per-pid value is cumulative since that process started, so
 * a total over the tree moves for two unrelated reasons: work being done, and the tree's MEMBERSHIP
 * changing. Under `pnpm -r` the membership churns constantly — workers are spawned and reaped
 * throughout the leg — so a total can fall while the step is at full tilt, or, worse, land back on
 * roughly its old value after a complete turnover and read as a dead stop.
 *
 * MEASURED, on a live `pnpm -r --no-bail test` (2026-08-16): the tree went 16 processes → 7 → 16
 * across three samples while the suite was demonstrably working, and an earlier count-based version of
 * this function printed `NO CPU PROGRESS` twice over exactly that stretch. So:
 *
 *   - CPU is summed ONLY over processes present in BOTH samples, which is genuinely "work done inside
 *     this window by processes that lived through it", and is monotonic by construction.
 *   - Membership is compared as a SET of pids, not as a count. A tree that swapped seven workers for
 *     seven others changed completely while its count did not move at all, and counting would have
 *     called that idle.
 */
export function classifyLiveness(
  prev: CpuSample,
  curr: CpuSample,
  thresholdSeconds: number = CPU_PROGRESS_THRESHOLD_SECONDS,
): LivenessVerdict {
  const windowMs = curr.at - prev.at;
  if (windowMs <= 0) {
    return { kind: "unknown", reason: "the two samples did not span a positive window" };
  }
  if (prev.processes === null || curr.processes === null) {
    const note = curr.note ?? prev.note;
    return {
      kind: "unknown",
      reason:
        note !== undefined
          ? `the process tree's CPU could not be read (${note})`
          : "the process tree's CPU could not be read",
    };
  }

  const processCount = curr.processes.size;
  let cpuDeltaSeconds = 0;
  let survivors = 0;
  for (const [pid, cpuSeconds] of curr.processes) {
    const before = prev.processes.get(pid);
    if (before === undefined) continue;
    survivors += 1;
    // A live process's own counter only rises; clamping guards against a pid the OS re-handed
    // mid-window, which would otherwise contribute a negative and mask a sibling's real work.
    if (cpuSeconds > before) cpuDeltaSeconds += cpuSeconds - before;
  }
  const treeChanged = survivors !== prev.processes.size || survivors !== processCount;

  if (cpuDeltaSeconds >= thresholdSeconds) {
    return { kind: "progressing", evidence: "cpu", cpuDeltaSeconds, windowMs, processCount };
  }
  if (treeChanged) {
    return { kind: "progressing", evidence: "tree-changed", cpuDeltaSeconds, windowMs, processCount };
  }
  // A tree with no processes at all is not idle — it is between states (the step is exiting, or the
  // shell has handed off). Reporting that as a stall would cry wolf at every step's tail.
  if (processCount === 0) {
    return { kind: "unknown", reason: "the step's process tree held no processes at either sample" };
  }
  if (windowMs < MIN_IDLE_WINDOW_MS) {
    return {
      kind: "unknown",
      reason:
        `the sample window was only ${Math.round(windowMs / 1000)}s — too short to tell a lull from a ` +
        `stall, since a healthy tree idles for a few seconds between spawns`,
    };
  }
  return { kind: "idle", cpuDeltaSeconds, windowMs, processCount };
}

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function elapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

const plural = (n: number): string => (n === 1 ? "process" : "processes");

/**
 * The single line a heartbeat prints. One line, because it interleaves with the step's own inherited
 * output and a paragraph would bury what the step is saying.
 *
 * EVERY LINE SAYS WHAT IT DOES NOT PROVE. `progressing` names why quiet output is expected, so a reader
 * does not go looking for the silence's cause; `idle` states in terms that it cannot distinguish
 * blocked from wedged, so it is never read as a verdict that the step is dead.
 */
export function renderLivenessLine(verdict: LivenessVerdict, elapsedMs: number): string {
  const head = `liveness ${elapsed(elapsedMs)} in —`;
  switch (verdict.kind) {
    case "progressing":
      return verdict.evidence === "cpu"
        ? `${head} PROGRESSING: the step's process tree burned ${verdict.cpuDeltaSeconds.toFixed(1)}s of ` +
            `CPU across ${verdict.processCount} ${plural(verdict.processCount)} in the last ` +
            `${seconds(verdict.windowMs)}. Quiet output is normal — \`pnpm -r\` buffers a workspace's ` +
            `output until that workspace finishes.`
        : `${head} PROGRESSING: the step's process tree turned over (now ${verdict.processCount} ` +
            `${plural(verdict.processCount)}) in the last ${seconds(verdict.windowMs)}, so something ` +
            `completed or started.`;
    case "idle":
      return (
        `${head} NO CPU PROGRESS: the same ${verdict.processCount} ${plural(verdict.processCount)} as ` +
        `${seconds(verdict.windowMs)} ago, with under ${CPU_PROGRESS_THRESHOLD_SECONDS}s of CPU burned ` +
        `between them. That is BLOCKED (I/O, a lock, a DB or network wait) or WEDGED — this ` +
        `cannot tell which, and has neither stopped nor judged the step. \`storytree own --all\` names ` +
        `every session's live gate if you suspect contention.`
      );
    case "unknown":
      return (
        `${head} LIVENESS UNKNOWN: ${verdict.reason}. Elapsed time alone cannot tell a wedged step ` +
        `from a slow one, so treat this as no signal rather than as a healthy one.`
      );
  }
}
