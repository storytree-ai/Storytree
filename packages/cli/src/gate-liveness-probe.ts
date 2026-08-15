// The gate's liveness PROBE — the I/O half of {@link file://./gate-liveness.ts}. Reads the CPU time
// of one process TREE from the OS and hands back a {@link CpuSample}.
//
// THE ROOT IS THE STEP'S OWN CHILD, NOT THE GATE. `gate-run.ts` passes the pid `spawn` handed it for
// this step, so the sum covers exactly that step's subtree. That is not a detail: this probe is itself
// a child of the gate process, so a sum rooted at the GATE would include the probe's own PowerShell /
// `ps` invocation and report ~1s of CPU every window — a permanent false PROGRESSING, in the one
// module whose whole job is to tell working from stopped. Rooting at the step makes the probe
// structurally outside its own measurement rather than subtracted from it.
//
// FAIL SOFT, ALWAYS. Every failure path returns `cpuSeconds: null` with a note, which
// {@link classifyLiveness} turns into `unknown`. Nothing here may throw into the runner, red a step or
// stop one: this is a reporting instrument bolted to a gate that CI runs, and an instrument that can
// fail the thing it observes is worse than no instrument.
//
// The parsers are exported and pure so the OS-format handling — three `ps` time layouts and Windows'
// 100-nanosecond ticks — is unit-testable without a real process tree.

import { spawn } from "node:child_process";

import type { CpuSample } from "./gate-liveness.js";

/** One row of the OS process table, reduced to what a tree walk needs. */
export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly cpuSeconds: number;
}

/**
 * How long the probe may take before it is abandoned as no signal.
 *
 * MEASURED UNDER LOAD, not chosen. `Get-CimInstance Win32_Process` through a fresh PowerShell costs
 * ~4s on an idle box — almost all of it .NET startup rather than the query — but a full 12-step gate
 * pushed it past 15s twice in one run, which turned real windows into `unknown`. 45s is generous
 * enough for a loaded box while staying under the runner's 60s interval, and the re-entrancy guard in
 * `gate-run.ts` covers a probe that runs long anyway.
 *
 * THE DEGRADATION FALLS THE RIGHT WAY, which is why a slow probe is tolerable rather than
 * disqualifying: the probe is slow when the box is BUSY, and a busy box is the healthy case. A genuine
 * wedge means processes are NOT running, so the box is quiet and the probe is fast — the signal is at
 * its most reliable exactly when it is being relied on.
 */
export const PROBE_TIMEOUT_MS = 45_000;

/**
 * Windows CPU counters are in 100-nanosecond ticks (`Win32_Process.KernelModeTime` +
 * `UserModeTime`), so ten million of them make a second.
 */
const WINDOWS_TICKS_PER_SECOND = 10_000_000;

/**
 * Parse `pid,ppid,ticks` lines — the shape the PowerShell probe below emits.
 *
 * Deliberately not CSV-with-headers: `ConvertTo-Csv` quotes and localises, and a parser that has to
 * survive that is a parser with more failure modes than the thing it measures deserves.
 */
export function parseWindowsProcessRows(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(",");
    if (parts.length !== 3) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const ticks = Number(parts[2]);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(ticks)) continue;
    rows.push({ pid, ppid, cpuSeconds: ticks / WINDOWS_TICKS_PER_SECOND });
  }
  return rows;
}

/**
 * Parse one `ps -o time=` field into seconds, or `null` when it is not a time at all.
 *
 * THREE LAYOUTS, ALL REAL: `MM:SS` (the common case), `HH:MM:SS` once a process passes an hour, and
 * `DD-HH:MM:SS` past a day — plus macOS's fractional seconds (`0:03.45`). A parser that handled only
 * the first would silently under-read every long-running process, which is precisely the population
 * this probe exists to watch.
 */
export function parsePosixCpuTime(field: string): number | null {
  const trimmed = field.trim();
  if (trimmed === "") return null;
  const dash = trimmed.indexOf("-");
  const days = dash === -1 ? 0 : Number(trimmed.slice(0, dash));
  const clock = dash === -1 ? trimmed : trimmed.slice(dash + 1);
  if (!Number.isFinite(days)) return null;

  const parts = clock.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const numbers = parts.map((p) => Number(p));
  if (numbers.some((n) => !Number.isFinite(n))) return null;

  const [a, b, c] = numbers as [number, number, number?];
  const hours = c === undefined ? 0 : a;
  const minutes = c === undefined ? a : b;
  const secs = c === undefined ? b : c;
  return days * 86_400 + hours * 3_600 + minutes * 60 + secs;
}

/** Parse `ps -A -o pid=,ppid=,time=` output. */
export function parsePosixProcessRows(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 3) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const cpuSeconds = parsePosixCpuTime(parts[2] ?? "");
    if (!Number.isFinite(pid) || !Number.isFinite(ppid) || cpuSeconds === null) continue;
    rows.push({ pid, ppid, cpuSeconds });
  }
  return rows;
}

/**
 * Collect pid → cumulative CPU seconds for `rootPid` and every descendant of it.
 *
 * A `visited` set rather than a plain recursion because the process table is a snapshot of a moving
 * target: a reaped parent can leave a row whose ppid points somewhere that now points back, and an
 * instrument that hung the gate by looping over a self-referential process table would be a far worse
 * defect than the blindness it was added to fix.
 */
export function collectTreeCpu(rows: readonly ProcessRow[], rootPid: number): Map<number, number> {
  const children = new Map<number, ProcessRow[]>();
  for (const row of rows) {
    const siblings = children.get(row.ppid);
    if (siblings === undefined) children.set(row.ppid, [row]);
    else siblings.push(row);
  }

  const visited = new Set<number>();
  const queue: number[] = [rootPid];
  const tree = new Map<number, number>();

  while (queue.length > 0) {
    const pid = queue.pop() as number;
    if (visited.has(pid)) continue;
    visited.add(pid);
    const self = rows.find((r) => r.pid === pid);
    if (self !== undefined) tree.set(pid, self.cpuSeconds);
    for (const child of children.get(pid) ?? []) {
      // A process whose ppid is itself would otherwise re-enqueue forever.
      if (child.pid !== pid) queue.push(child.pid);
    }
  }

  return tree;
}

/** The command that dumps the whole process table, per platform. */
function probeCommand(): { file: string; args: string[]; parse: (text: string) => ProcessRow[] } {
  if (process.platform === "win32") {
    return {
      file: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,KernelModeTime,UserModeTime | " +
          "ForEach-Object { '{0},{1},{2}' -f $_.ProcessId, $_.ParentProcessId, ($_.KernelModeTime + $_.UserModeTime) }",
      ],
      parse: parseWindowsProcessRows,
    };
  }
  return {
    file: "ps",
    args: ["-A", "-o", "pid=,ppid=,time="],
    parse: parsePosixProcessRows,
  };
}

/** Read the whole process table, or `null` with a reason. */
function readProcessTable(timeoutMs: number): Promise<{ rows: ProcessRow[] } | { error: string }> {
  const { file, args, parse } = probeCommand();
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: { rows: ProcessRow[] } | { error: string }): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child;
    try {
      child = spawn(file, args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch (err) {
      done({ error: `${file} could not be started: ${(err as Error).message}` });
      return;
    }

    const timer = setTimeout(() => {
      child.kill();
      done({ error: `${file} did not answer within ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    timer.unref();

    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      done({ error: `${file} could not be started: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        done({ error: `${file} exited ${code ?? "on a signal"}` });
        return;
      }
      const rows = parse(out);
      if (rows.length === 0) {
        done({ error: `${file} returned no parseable process rows` });
        return;
      }
      done({ rows });
    });
  });
}

/**
 * Take one CPU sample of the tree rooted at `rootPid`.
 *
 * Never rejects. A sample that could not be taken is a `null` reading with a note, which is a signal in
 * its own right — see this module's header.
 */
export async function sampleTreeCpu(
  rootPid: number,
  opts: { readonly now?: () => number; readonly timeoutMs?: number } = {},
): Promise<CpuSample> {
  const now = opts.now ?? Date.now;
  try {
    const table = await readProcessTable(opts.timeoutMs ?? PROBE_TIMEOUT_MS);
    if ("error" in table) {
      return { at: now(), processes: null, note: table.error };
    }
    return { at: now(), processes: collectTreeCpu(table.rows, rootPid) };
  } catch (err) {
    return { at: now(), processes: null, note: (err as Error).message };
  }
}
