#!/usr/bin/env node
// The `session-cutting-outage-arc` mechanical check (session-cutting-outage-arc-inc-01's
// deliverable) — answers "is worktree-backed desktop session creation working today?" without
// re-deriving the 2026-08-15/08-16 investigation by hand every time. See
// `storytree library artifact session-cutting-outage-arc-inc-01` for the full write-up and
// [[worktree-session-creation-vendor-broken]] for the memory trail; upstream:
// https://github.com/anthropics/claude-code/issues/86574 (open as of 2026-08-18).
//
// THE SIGNAL (established by hand, twice, before this script existed): a HEALTHY desktop session
// start logs `Starting local session <id> in <cwd>` within a couple of seconds of `LocalSessions.
// start:` in %APPDATA%\Claude\logs\main.log. A BROKEN one (the vendor bug) logs `LocalSessions.
// start:` and then nothing — no session line, no session record, no worktree directory. Two traps
// this script exists to avoid re-falling into (see the memory file for the full account):
//   - `LocalSessions.start:` carries NO fields, ever (`t.Jb.info(\`LocalSessions.start:\`)` is a
//     literal with no interpolation) — every start logs it identically, healthy or not, so it is
//     only useful as a MARKER TO CORRELATE FROM, never a symptom by itself.
//   - the start-timing line's own body contains the substring `worktree=` TWICE: once mid-line as
//     a DURATION (`worktree=1ms`, timing telemetry) and once after the `|` as the actual BOOLEAN
//     flag (`worktree=false`). Only the second one means what it looks like.
//
// TWO MODES:
//   baseline   — snapshot session-record count, worktree-dir count, newest record mtime, and the
//                current main.log line count. Prints what to do next (fire a chip, or start a
//                session with the worktree box ticked) and where the snapshot was written.
//   check      — re-snapshot, diff against the baseline, and scan every NEW main.log line for
//                `LocalSessions.start:` → does a `Starting local session` line follow within a few
//                seconds? Prints a per-attempt verdict plus one bottom-line HEALTHY / BROKEN /
//                NO ATTEMPT DETECTED read.
//   census     — the day-by-`worktree=`-flag bucketing the original investigation ran by hand
//                across every retained main*.log rotation. No baseline needed; answers "what does
//                the last few weeks look like" in one shot instead of a hand-rolled grep-and-count.
//
// Deliberately NOT wired into `pnpm gate` — it reads Windows/Electron-desktop-local state
// (%APPDATA%\Claude) that CI cannot see and that has no reason to exist once the upstream bug is
// fixed, so it stays a standalone operator tool (mirrors provision-worktree.mjs / worktree-health.mjs
// in spirit, but lives in scripts/ rather than packages/cli since nothing invokes it as a hook).
//
// Usage:
//   node scripts/check-worktree-session-creation.mjs baseline [--claude-dir <path>]
//   node scripts/check-worktree-session-creation.mjs check [--claude-dir <path>]
//   node scripts/check-worktree-session-creation.mjs census [--claude-dir <path>] [--days N]
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { spawnSync } from "node:child_process";
import process from "node:process";

const STATE_PATH = join(tmpdir(), "storytree-session-creation-check.json");

function defaultClaudeDir() {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Claude");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude");
  }
  return join(homedir(), ".config", "Claude");
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--claude-dir") args.claudeDir = argv[++i];
    else if (a === "--days") args.days = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

/** Every file under claude-code-sessions, recursively — count + newest mtime. */
function scanSessionRecords(claudeDir) {
  const root = join(claudeDir, "claude-code-sessions");
  let count = 0;
  let newestMs = 0;
  let newestPath = null;
  if (!existsSync(root)) return { count, newestMs, newestPath, root, exists: false };
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile()) {
        count++;
        try {
          const mtimeMs = statSync(p).mtimeMs;
          if (mtimeMs > newestMs) {
            newestMs = mtimeMs;
            newestPath = p;
          }
        } catch {
          // record may have been deleted between readdir and stat — skip it
        }
      }
    }
  }
  return { count, newestMs, newestPath, root, exists: true };
}

function scanWorktreeDirs(repoRoot) {
  const dir = join(repoRoot, ".claude", "worktrees");
  if (!existsSync(dir)) return { count: 0, dir, exists: false };
  const count = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  return { count, dir, exists: true };
}

function mainLogPath(claudeDir) {
  return join(claudeDir, "logs", "main.log");
}

function readMainLogLines(claudeDir) {
  const p = mainLogPath(claudeDir);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split(/\r?\n/);
}

/** `2026-08-15 21:56:03 [info] ...` → epoch ms, or null if the line doesn't start with a timestamp. */
function lineTimestampMs(line) {
  const m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(line);
  if (!m) return null;
  const t = Date.parse(m[1].replace(" ", "T") + "Z"); // logs are local time; treat as UTC consistently
  return Number.isNaN(t) ? null : t;
}

function findRepoRoot() {
  // The worktree-dir census belongs to the MAIN checkout, not whichever worktree this script
  // happens to run from — `.claude/worktrees` lives only there. `git rev-parse --git-common-dir`
  // resolves to the shared `.git` regardless of which worktree calls it, so its parent is always
  // the main checkout root; that beats walking up for a `.git` entry, which would stop at a
  // worktree's own `.git` FILE (not dir) and silently point at the worktree instead of main.
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (r.status === 0 && r.stdout.trim()) {
    return dirname(r.stdout.trim());
  }
  // Fall back to walking up for a workspace marker (e.g. git itself is unavailable).
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, ".git")) || existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function cmdBaseline(args) {
  const claudeDir = args.claudeDir ?? defaultClaudeDir();
  const repoRoot = findRepoRoot();
  const records = scanSessionRecords(claudeDir);
  const worktrees = scanWorktreeDirs(repoRoot);
  const logLines = readMainLogLines(claudeDir);

  if (!records.exists) {
    console.error(`No session-records directory found at ${records.root} — is this a machine with the desktop app installed?`);
    process.exitCode = 1;
    return;
  }

  const snapshot = {
    takenAtMs: Date.now(),
    claudeDir,
    repoRoot,
    sessionRecordCount: records.count,
    newestRecordMtimeMs: records.newestMs,
    worktreeDirCount: worktrees.count,
    mainLogLineCount: logLines.length,
  };
  mkdirSync(tmpdir(), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(snapshot, null, 2));

  console.log(`Baseline captured → ${STATE_PATH}`);
  console.log(`  session records:  ${snapshot.sessionRecordCount}  (newest mtime ${new Date(snapshot.newestRecordMtimeMs).toISOString()})`);
  console.log(`  worktree dirs:    ${snapshot.worktreeDirCount}  (${worktrees.dir})`);
  console.log(`  main.log lines:   ${snapshot.mainLogLineCount}`);
  console.log(``);
  console.log(`Now fire the thing you want to check — a background-task chip, or a new desktop`);
  console.log(`session with "create a fresh worktree" ticked — then run:`);
  console.log(`  node scripts/check-worktree-session-creation.mjs check`);
}

function cmdCheck(args) {
  const claudeDir = args.claudeDir ?? defaultClaudeDir();
  if (!existsSync(STATE_PATH)) {
    console.error(`No baseline found at ${STATE_PATH} — run the "baseline" command first.`);
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  const repoRoot = baseline.repoRoot;
  const records = scanSessionRecords(claudeDir);
  const worktrees = scanWorktreeDirs(repoRoot);
  const logLines = readMainLogLines(claudeDir);

  const recordDelta = records.count - baseline.sessionRecordCount;
  const worktreeDelta = worktrees.count - baseline.worktreeDirCount;
  const newestMoved = records.newestMs > baseline.newestRecordMtimeMs;

  console.log(`Baseline (${new Date(baseline.takenAtMs).toISOString()}) → now:`);
  console.log(`  session records:  ${baseline.sessionRecordCount} → ${records.count}  (${recordDelta >= 0 ? "+" : ""}${recordDelta})`);
  console.log(`  worktree dirs:    ${baseline.worktreeDirCount} → ${worktrees.count}  (${worktreeDelta >= 0 ? "+" : ""}${worktreeDelta})`);
  console.log(`  newest record:    ${newestMoved ? "moved forward" : "unchanged"}`);
  console.log(``);

  if (logLines.length < baseline.mainLogLineCount) {
    console.log(`⚠ main.log is SHORTER than the baseline (it rotated) — re-run "baseline" and fire`);
    console.log(`  the probe again; this check can only see the current file.`);
  }

  // Only the NEW lines since baseline are in scope.
  const newLines = logLines.slice(Math.max(0, baseline.mainLogLineCount));

  // Every "LocalSessions.start:" is a start ATTEMPT; every "Starting local session ... in <cwd>" is
  // a start that actually proceeded. Correlate by nearest-following-in-time, not by id (the start
  // line carries none).
  const attempts = [];
  const starts = [];
  for (const line of newLines) {
    const ts = lineTimestampMs(line);
    if (ts === null) continue;
    if (line.includes("LocalSessions.start:")) attempts.push(ts);
    const m = /Starting local session (\S+) in (.+)$/.exec(line);
    if (m) starts.push({ ts, id: m[1], cwd: m[2] });
  }

  if (attempts.length === 0) {
    console.log(`NO ATTEMPT DETECTED — no "LocalSessions.start:" line appeared in main.log since the`);
    console.log(`baseline. Did the session/chip actually fire? (Queued chips are hidden behind the`);
    console.log(`front card — dismiss or start it first, per #70388.)`);
    return;
  }

  console.log(`${attempts.length} session-start attempt(s) since baseline:`);
  let anyBroken = false;
  let anyHealthy = false;
  for (const attemptTs of attempts) {
    const matched = starts.find((s) => s.ts >= attemptTs && s.ts - attemptTs <= 5000);
    if (matched) {
      anyHealthy = true;
      console.log(`  ${new Date(attemptTs).toISOString()}  HEALTHY — "Starting local session ${matched.id}" followed ${matched.ts - attemptTs}ms later, in ${matched.cwd}`);
    } else {
      anyBroken = true;
      console.log(`  ${new Date(attemptTs).toISOString()}  BROKEN  — no "Starting local session" line followed within 5s (matches the vendor-bug signature)`);
    }
  }

  console.log(``);
  if (anyBroken && !anyHealthy) {
    console.log(`VERDICT: BROKEN — worktree-backed session creation still reproduces the outage.`);
    console.log(`Keep using the terminal fallback in CLAUDE.md until upstream fixes #86574.`);
  } else if (anyHealthy && !anyBroken) {
    console.log(`VERDICT: HEALTHY — every start attempt since baseline proceeded normally.`);
    console.log(`If you fired this against a session with the worktree box TICKED, the upstream bug`);
    console.log(`may be fixed — re-confirm, then remove the TEMPORARY bullet from CLAUDE.md and close`);
    console.log(`session-cutting-outage-arc.`);
  } else {
    console.log(`VERDICT: MIXED — some attempts healthy, some broken. Re-run against a single isolated`);
    console.log(`attempt (one chip or one session) to get a clean read.`);
  }
}

function cmdCensus(args) {
  const claudeDir = args.claudeDir ?? defaultClaudeDir();
  const logsDir = join(claudeDir, "logs");
  if (!existsSync(logsDir)) {
    console.error(`No logs directory at ${logsDir}.`);
    process.exitCode = 1;
    return;
  }
  const days = args.days ?? 30;
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const logFiles = readdirSync(logsDir).filter((f) => /^main\d*\.log$/.test(f));

  // day (YYYY-MM-DD) -> { true: n, false: n }
  const buckets = new Map();
  for (const file of logFiles) {
    let text;
    try {
      text = readFileSync(join(logsDir, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes("[CCD start-timing]")) continue;
      const ts = lineTimestampMs(line);
      if (ts === null || ts < cutoffMs) continue;
      // The flag is the one AFTER the `|` — the mid-line `worktree=Nms` is timing, not the flag.
      const afterPipe = line.split("|")[1] ?? "";
      const flagMatch = /\bworktree=(true|false)\b/.exec(afterPipe);
      if (!flagMatch) continue;
      const day = new Date(ts).toISOString().slice(0, 10);
      const bucket = buckets.get(day) ?? { true: 0, false: 0 };
      bucket[flagMatch[1]]++;
      buckets.set(day, bucket);
    }
  }

  const days_sorted = [...buckets.keys()].sort();
  if (days_sorted.length === 0) {
    console.log(`No [CCD start-timing] lines found in the last ${days} day(s) across ${logFiles.length} log file(s).`);
    return;
  }
  console.log(`worktree-backed vs plain session starts, by day (last ${days} day(s), ${logFiles.length} log file(s) read):`);
  console.log(``);
  for (const day of days_sorted) {
    const b = buckets.get(day);
    console.log(`  ${day}   worktree=true: ${String(b.true).padStart(3)}   worktree=false: ${String(b.false).padStart(3)}`);
  }
  const lastDay = buckets.get(days_sorted[days_sorted.length - 1]);
  console.log(``);
  if (lastDay.true === 0 && lastDay.false > 0) {
    console.log(`Most recent day has ZERO worktree=true starts against ${lastDay.false} worktree=false — matches the`);
    console.log(`outage signature. Cross-check with "check" against a live attempt before trusting this alone.`);
  }
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  if (cmd === "baseline") return cmdBaseline(args);
  if (cmd === "check") return cmdCheck(args);
  if (cmd === "census") return cmdCensus(args);
  console.error(`Usage: node scripts/check-worktree-session-creation.mjs <baseline|check|census> [--claude-dir <path>] [--days N]`);
  process.exitCode = 1;
}

main();
