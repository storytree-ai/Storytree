// Type declarations for the pure helpers studio.mjs exports, so a TS test (and `tsc --noEmit`) can
// import them without `allowJs`. The launcher itself stays plain Node ESM (no tsx/deps) by design —
// this sibling only types the exported surface; the implementation lives in studio.mjs.

/** Extract the unique PIDs LISTENING on `port` from Windows `netstat -ano` output. */
export function parseListeningPids(netstatOutput: string, port: number): number[];

/**
 * Probe GET /api/health and report WHO answered: `serving` is any HTTP response at all (the old
 * "is the port busy" question), `pid` is the answering process's self-reported id — `null` when it
 * answered without identifying itself. Never rejects.
 */
export function probeHealth(
  baseUrl?: string,
  timeoutMs?: number,
): Promise<{ serving: boolean; pid: number | null }>;

/**
 * Whose server is on the port. `recordedPid` / `healthPid` are deliberately `unknown`: both arrive
 * from outside (a hand-editable pid file, a JSON body) and the function is total over junk, because
 * a malformed pid must never classify as `ours`.
 */
export function classifyListener(input: {
  recordedPid?: unknown;
  serving: boolean;
  healthPid?: unknown;
}): 'idle' | 'ours' | 'foreign' | 'unidentified';

/** The per-launch banner written to .studio.log; {@link tailSinceMarker} reads back from it. */
export const RUN_MARKER: string;

/** The log tail belonging to the CURRENT run only — from the LAST `marker` line onward, capped at `lines`. */
export function tailSinceMarker(text: string, marker?: string, lines?: number): string;
