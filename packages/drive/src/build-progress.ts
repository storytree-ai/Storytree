// build-progress — a long-running build SAYS IT IS ALIVE, naming the leg it is alive IN
// (`diagnosis-honesty-arc`, from friction `a-real-build-emits-no-progress-until-it-finishes`).
//
// THE DEFECT. A backgrounded `--real` build emitted NOTHING between the pnpm banner and its final
// report — measured 2026-08-04: a redirected log held 4 lines (the banner) across several minutes,
// then jumped straight to the 50-line envelope. The only way to learn the build was alive was
// `git worktree list` forensics, four tool-calls deep.
//
// WHY SILENCE IS WORSE THAN SLOW. A NEIGHBOURING failure is byte-identical from outside: a preflight
// wedged on an external dependency also prints one line and then nothing. The correct responses are
// OPPOSITE — wait out a Cloud SQL cold start (they have reached ~21 min), kill a wedge — and the log
// alone could not tell them apart. That is this arc's whole charter: a command must name its REAL
// blocker rather than a downstream symptom, so the fix is not "print something" but "print WHICH LEG
// is holding the clock". A heartbeat reading `live-store preflight - still running, 300s elapsed`
// answers the question the silence could not; a bare spinner would not.
//
// THE SHAPE. `createBuildProgress` is pure over injected `log` / `now` / `heartbeat` effects, so the
// tick cadence and the elapsed arithmetic are asserted offline with a hand-driven clock and no timer
// (the same discipline `ensureDbUp` and `probeDb` use next door in db-control.ts). {@link
// liveBuildProgress} wires the real effects onto stderr — the envelope owns stdout, so a redirected
// `> log 2>&1` interleaves progress with the report while a piped `| jq` stays clean.
//
// ASCII ONLY in every emitted line: these land in Windows PowerShell consoles and redirected logs
// that are not reliably UTF-8, and a mojibaked liveness signal is a liveness signal nobody reads.

/** The wall-clock gap between heartbeats. 30s matches the preflight's own cold-start banner. */
export const PROGRESS_INTERVAL_MS = 30_000;

/** Injected effects for {@link createBuildProgress} — real wiring in {@link liveBuildProgress}. */
export interface ProgressDeps {
  /** Progress sink (real: `console.error` behind a `[build]` prefix). */
  log: (message: string) => void;
  /** Monotonic-ish clock for the elapsed measurements (real: `Date.now`). */
  now: () => number;
  /**
   * Start a repeating tick and return its canceller (real: `setInterval` + `clearInterval`). A
   * canceller rather than a handle so the pure core never names a runtime timer type — and so a
   * finished stage provably stops ticking, which is what keeps a stale stage name out of the log.
   */
  heartbeat: (intervalMs: number, tick: () => void) => () => void;
}

/** The progress surface a build driver reports through. */
export interface BuildProgress {
  /**
   * Run `work` as a NAMED leg of the build: announce it, heartbeat its name + elapsed while it runs,
   * and close it with what it cost. Returns `work`'s value; a throw is announced as a FAILED leg and
   * rethrown unchanged, so wrapping a leg never changes the build's outcome.
   */
  stage<T>(name: string, work: () => Promise<T>): Promise<T>;
  /**
   * Name a sub-step of the CURRENT leg without restarting its clock — the gate's red-green phase
   * walk (AUTHOR_TEST -> OBSERVE_RED -> ...). The heartbeat picks the detail up, so a stalled leg
   * reports the phase it stalled IN, not merely the leg. A no-op outside a stage.
   */
  note(detail: string): void;
}

/** Whole seconds, the unit every line reports in (sub-second precision would be noise here). */
function secs(ms: number): number {
  return Math.max(0, Math.round(ms / 1000));
}

interface Span {
  readonly name: string;
  readonly startedAt: number;
  detail: string | undefined;
}

/** `name / DETAIL` when a sub-step has been noted, else just `name`. */
function title(span: Span): string {
  return span.detail === undefined ? span.name : `${span.name} / ${span.detail}`;
}

/**
 * Build a {@link BuildProgress} over injected effects. Sequential stages only (a build's legs run one
 * after another); a stage started while another is live simply supersedes it, and the superseded
 * span's ticks go quiet rather than racing the new one into the log.
 */
export function createBuildProgress(
  deps: ProgressDeps,
  opts: { intervalMs?: number } = {},
): BuildProgress {
  const intervalMs = opts.intervalMs ?? PROGRESS_INTERVAL_MS;
  let current: Span | undefined;

  return {
    async stage<T>(name: string, work: () => Promise<T>): Promise<T> {
      const span: Span = { name, startedAt: deps.now(), detail: undefined };
      current = span;
      deps.log(`${name} - started`);
      const cancel = deps.heartbeat(intervalMs, () => {
        // A tick from a superseded or already-finished span must never fire: a heartbeat naming a
        // leg that has moved on is worse than no heartbeat, because it reads as a wedge in the wrong
        // place — exactly the misdiagnosis this module exists to prevent.
        if (current !== span) return;
        deps.log(`${title(span)} - still running, ${secs(deps.now() - span.startedAt)}s elapsed`);
      });
      try {
        const out = await work();
        deps.log(`${title(span)} - done in ${secs(deps.now() - span.startedAt)}s`);
        return out;
      } catch (err) {
        deps.log(
          `${title(span)} - FAILED after ${secs(deps.now() - span.startedAt)}s: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        throw err;
      } finally {
        cancel();
        if (current === span) current = undefined;
      }
    },

    note(detail: string): void {
      const span = current;
      if (span === undefined) return;
      span.detail = detail;
      deps.log(`${span.name} / ${detail} (${secs(deps.now() - span.startedAt)}s in)`);
    },
  };
}

/**
 * The real sink: `[build]`-prefixed lines on STDERR. Stderr because the envelope owns stdout — a
 * caller piping the report into a parser must not have liveness chatter folded into it, while the
 * `> build.log 2>&1` redirect that produced this friction interleaves both, which is the point.
 *
 * The interval is `unref`'d: a heartbeat must never be the reason a finished process stays alive.
 */
export function liveBuildProgress(intervalMs: number = PROGRESS_INTERVAL_MS): BuildProgress {
  return createBuildProgress(
    {
      log: (message) => console.error(`[build] ${message}`),
      now: () => Date.now(),
      heartbeat: (ms, tick) => {
        const timer = setInterval(tick, ms);
        timer.unref?.();
        return () => clearInterval(timer);
      },
    },
    { intervalMs },
  );
}

/**
 * A progress surface that emits nothing and starts no timer — the default for offline walks
 * (`--dry-run`) and the injection point for suites that assert on a build's ENVELOPE rather than its
 * liveness chatter. It still runs the work, so wiring cannot diverge between silent and live.
 */
export function silentBuildProgress(): BuildProgress {
  return {
    stage: async <T>(_name: string, work: () => Promise<T>): Promise<T> => work(),
    note: () => {},
  };
}
