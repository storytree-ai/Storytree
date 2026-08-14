// Detached studio launcher — `pnpm studio:up | studio:down | studio:status`.
//
// `pnpm --filter studio dev` ties the Vite dev server to a terminal the operator
// then has to babysit. This script instead spawns the same server DETACHED
// (windowsHide, stdio to an append-only log, unref'd), so one `pnpm studio:up`
// outlives the launching shell/session. State lives next to the app:
// apps/studio/.studio.pid (the server PID) and apps/studio/.studio.log
// (appended stdout+stderr) — both gitignored.
//
// `up` and `status` probe http://localhost:5173/api/health and ask "is it MINE?", not merely
// "is something up?". A port answering 200 is evidence only that SOMETHING on it is healthy —
// which is read as "my server is healthy", and the two diverge exactly when a sibling session
// already holds :5173, the normal state of this shared dev box. Measured 2026-08-02: a foreign
// server returned 200 and the right 45-story /api/tree shape while the launching session's own
// listen() had died on EADDRINUSE, and the run came within a step of profiling a SIBLING'S build
// and reporting it as this branch's change. So identity comes from the server's own `pid` stamp
// (apiRouter.ts handleHealth), compared against the pid this launcher spawned — never from the
// port answering, and never from netstat guesswork. `listeningPids` stays, but only to NAME a
// holder in a message; it never decides whose server it is.
//
// Two limits, deliberately not crossed. A pid identifies a process on THIS machine, so the
// comparison is localhost-launcher-only and must never become a general health assertion. And it
// catches a foreign LISTENER, not a foreign BUILD — the same session restarting stale code under
// its own pid still measures the wrong thing; that is /api/health's `code` git-HEAD stamp's job.
//
// Plain Node ESM (no tsx/deps) so it runs before/without a workspace install
// of anything beyond the studio app itself.

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// The spawn registry (`shared-box-session-ownership-arc`), reached by RELATIVE PATH rather than by
// package name so this launcher keeps its no-workspace-install promise — `spawn-record.mjs` is plain
// ESM over node builtins for exactly this caller. Registering here is what makes a detached vite
// server VISIBLE to `storytree own` and STOPPABLE by `storytree own stop`; without it the session
// reports a clean inventory while still holding :5173, which is the false clear that arc exists to
// remove. Fail-silent by construction: every function below absorbs its own failure, so a broken
// registry can never keep the studio from starting.
import {
  registerDetachedSpawn,
  removeSpawnRecordForPid,
} from '../packages/drive/src/spawn-record.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studioDir = path.join(repoRoot, 'apps', 'studio');
const pidFile = path.join(studioDir, '.studio.pid');
const logFile = path.join(studioDir, '.studio.log');
// The dev server's port (mirrors apps/studio/vite.config.ts `server.port`). Drives both the health
// probe and the port-based orphan reap: on Windows a detached vite can outlive the pid we recorded
// (a re-fork, or a stale pid file), so `down` must stop whatever actually HOLDS the port, not just
// the pid in .studio.pid — else `studio:down` leaves an orphaned :5173 listener the file can't track.
const PORT = 5173;
const url = `http://localhost:${PORT}`;

function readPid() {
  try {
    const pid = Number.parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * PURE: extract the PIDs LISTENING on `port` from Windows `netstat -ano` output. A listener line is
 * `TCP  <local>  <foreign>  LISTENING  <pid>`; we keep those whose local address ends in exactly
 * `:port` (so `:5173` matches but `:51730` does not — both IPv4 `0.0.0.0:5173` and IPv6 `[::1]:5173`
 * forms). Exported so the orphan-reap logic is unit-tested without a live server. Returns unique pids.
 */
export function parseListeningPids(netstatOutput, port) {
  const pids = new Set();
  const suffix = `:${port}`;
  for (const line of String(netstatOutput).split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    // proto, local, foreign, state, pid — TCP listeners only (UDP has no LISTENING state).
    if (t.length < 5) continue;
    if (!/^TCP$/i.test(t[0])) continue;
    if (t[3] !== 'LISTENING') continue;
    const local = t[1];
    const colon = local.lastIndexOf(':');
    if (colon === -1 || local.slice(colon) !== suffix) continue;
    const pid = Number.parseInt(t[4], 10);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/**
 * The PIDs actually LISTENING on `port` right now (dep-free, cross-platform): `netstat -ano` parsed by
 * {@link parseListeningPids} on Windows, `lsof` on POSIX. Best-effort — returns `[]` if the tool is
 * missing or nothing is listening. This is what catches the ORPHAN the pid file can't.
 */
function listeningPids(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8', windowsHide: true });
      return parseListeningPids(out, port);
    }
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: 'utf8' });
    return [
      ...new Set(
        out
          .split(/\r?\n/)
          .map((l) => Number.parseInt(l.trim(), 10))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
  } catch {
    return []; // netstat/lsof unavailable, or nothing is listening
  }
}

/**
 * Probe GET /api/health and report WHO answered. Two independent facts, never collapsed:
 *  - `serving`: any HTTP response at all — health route or a 404 from a server without it. This is
 *    the old `portServing` semantics, unchanged: it answers "is the port busy", nothing more.
 *  - `pid`: the answering process's OWN id, self-reported by handleHealth. `null` means it answered
 *    but did not identify itself, which is NOT the same as "it is mine" — a pre-stamp studio, a
 *    plain Vite server, or something else entirely all land here.
 * Never throws; a dead port and a hung one both read `{serving:false, pid:null}`.
 */
export async function probeHealth(baseUrl = url, timeoutMs = 1500) {
  let res;
  try {
    res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { serving: false, pid: null };
  }
  try {
    const body = await res.json();
    const pid = body?.pid;
    return { serving: true, pid: Number.isInteger(pid) && pid > 0 ? pid : null };
  } catch {
    return { serving: true, pid: null }; // answered, but not a studio health envelope
  }
}

/**
 * PURE: whose server is on the port? The ONE question both `up` and `status` turn on, kept
 * separate from the I/O so the truth table is unit-testable without a live server.
 *   'idle'         — nothing answered
 *   'ours'         — the answering process IS the pid we recorded/spawned
 *   'foreign'      — a pid answered and it is NOT ours (a null pid file lands here too: if this
 *                    checkout started nothing, whatever holds the port is by definition not ours)
 *   'unidentified' — something answered but carries no pid, so identity is UNPROVABLE. Deliberately
 *                    its own verdict rather than folded into either side: callers treat "cannot
 *                    tell" differently depending on whether they just spawned a server or not.
 */
export function classifyListener({ recordedPid, serving, healthPid }) {
  if (!serving) return 'idle';
  if (!Number.isInteger(healthPid) || healthPid <= 0) return 'unidentified';
  if (Number.isInteger(recordedPid) && recordedPid === healthPid) return 'ours';
  return 'foreign';
}

/** The per-launch banner `up()` appends to .studio.log; {@link tailSinceMarker} reads back from it. */
export const RUN_MARKER = '--- studio:up ';

/**
 * PURE: the log tail belonging to the CURRENT run only — everything from the LAST `--- studio:up
 * <iso> ---` marker (written just before spawning) onward, capped at `lines`. A flat "last N lines"
 * of an APPENDED log silently mixes in the previous attempt's output, so a failed startup gets
 * diagnosed from a run that already ended — the same misattribution as reading a stale exit-code
 * file. Falls back to the plain tail when no marker is present (a hand-truncated or foreign log).
 */
export function tailSinceMarker(text, marker = RUN_MARKER, lines = 20) {
  const all = String(text).split(/\r?\n/);
  let start = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].startsWith(marker)) {
      start = i;
      break;
    }
  }
  return all.slice(start === -1 ? 0 : start).slice(-lines).join('\n');
}

function logTail(lines = 20) {
  try {
    return tailSinceMarker(fs.readFileSync(logFile, 'utf8'), RUN_MARKER, lines);
  } catch {
    return '(no log)';
  }
}

/**
 * The refusal both `up` paths share: something holds the port and it is provably not ours. Names the
 * foreign pid from the server's OWN report where it has one, falling back to the netstat holder so
 * the message is still actionable against a server that does not stamp itself.
 */
function reportForeign(verdict, probe, recordedPid) {
  const holder = probe.pid ?? listeningPids(PORT)[0] ?? null;
  const who = holder === null ? 'an unidentified process' : `another process (pid ${holder})`;
  console.error(`studio: port ${PORT} is held by ${who} — not this session's server`);
  if (verdict === 'unidentified') {
    console.error(
      `studio: it answers ${url}/api/health but carries no pid, so it cannot be confirmed as this session's — a studio started before the pid stamp landed reads this way; restart it to identify itself`,
    );
  }
  console.error(
    `studio: this checkout's pid file ${recordedPid === null ? 'is absent' : `names ${recordedPid}`}`,
  );
  console.error(
    `studio: stop the holder with \`pnpm studio:down\` (it reaps whatever holds :${PORT} — that is ANOTHER session's server if one is running), or serve on a different port`,
  );
}

/**
 * Wait for the pid we are tracking to answer /api/health AS ITSELF. `spawned` is the freshly started
 * child (null when we are only waiting on an already-live recorded pid), used to tell "died during
 * startup" from "still warming".
 *
 * The verdicts differ from the pre-spawn check on purpose. 'foreign' here is the EADDRINUSE race the
 * whole unit exists for — our listen() lost the port to a server that was already there, and the poll
 * would otherwise read that stranger's 200 as success. 'unidentified' is NOT a refusal here: a
 * booting server can answer before its route table is mounted, and refusing on that would false-red
 * our own server. So it keeps waiting and only reports at the deadline.
 */
async function awaitReady(expectedPid, spawned) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const probe = await probeHealth(url, 1000);
    const verdict = classifyListener({ recordedPid: expectedPid, serving: probe.serving, healthPid: probe.pid });
    if (verdict === 'ours') {
      console.log(`studio: serving at ${url} (pid ${expectedPid})`);
      return 0;
    }
    if (verdict === 'foreign') {
      console.error(`studio: ${url} answers, but pid ${probe.pid} is answering — NOT the ${spawned ? 'server just started' : 'tracked server'} (pid ${expectedPid})`);
      if (spawned) {
        console.error('studio: the port was already held, so this launch lost it — log tail:');
        console.error(logTail());
        try { fs.unlinkSync(pidFile); } catch {}
      }
      reportForeign(verdict, probe, expectedPid);
      return 1;
    }
    if (!pidAlive(expectedPid)) {
      console.error(`studio: process ${spawned ? 'died during startup' : 'is gone'} — log tail:`);
      console.error(logTail());
      try { fs.unlinkSync(pidFile); } catch {}
      return 1;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // Alive but not confirmed serving. Makes NO readiness or identity claim, so exit 0 stays honest —
  // a cold pg-backed boot legitimately outruns 15s and must not read as a failure.
  console.log(`studio: not answering yet after 15s — pid ${expectedPid} is alive and may still be warming up.`);
  console.log('studio: `pnpm studio:status` re-probes; check the log for the cause.');
  return 0;
}

async function up() {
  const recorded = readPid();
  const probe = await probeHealth();
  const verdict = classifyListener({ recordedPid: recorded, serving: probe.serving, healthPid: probe.pid });

  if (verdict === 'ours') {
    console.log(`studio: already running (pid ${recorded}) at ${url}`);
    return 0;
  }
  // A listener we did not start. Previously this exited 0 ("not starting a second one"), which a
  // scripted caller reads as ready — the silent wrong answer. It is a refusal.
  if (verdict === 'foreign' || verdict === 'unidentified') {
    reportForeign(verdict, probe, recorded);
    return 1;
  }
  // Nothing is answering — but if our own recorded process is alive it is warming, not absent, so
  // wait on IT rather than racing a second server onto the same port.
  if (recorded !== null && pidAlive(recorded)) {
    console.log(`studio: pid ${recorded} is alive but ${url} is not answering yet — waiting rather than starting a second server`);
    return await awaitReady(recorded, null);
  }

  // Same command as apps/studio's "dev" script, but detached. Defaults mirror
  // .claude/launch.json (pg store, operator IAM email); explicit env wins.
  const env = {
    ...process.env,
    STORYTREE_STUDIO_STORE: process.env.STORYTREE_STUDIO_STORE ?? 'pg',
    STORYTREE_DB_USER: process.env.STORYTREE_DB_USER ?? 'hua.mick@gmail.com',
  };

  const logFd = fs.openSync(logFile, 'a');
  // The marker logTail() reads back from, so a failed startup can never be diagnosed from the
  // PREVIOUS attempt's lines in this append-only log.
  fs.writeSync(logFd, `\n${RUN_MARKER}${new Date().toISOString()} ---\n`);
  const child = spawn(process.execPath, ['--import', 'tsx', 'node_modules/vite/bin/vite.js'], {
    cwd: studioDir,
    env,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);

  fs.writeFileSync(pidFile, `${child.pid}\n`);

  // ATTRIBUTE the detached child to this session. The launcher registers on the child's behalf
  // because the child is the whole point: it is unref'd so it OUTLIVES this process, and vite knows
  // nothing about the registry. The row is retired by whatever stops it — `down` below, or
  // `storytree own stop`, which clears a record only on a confirmed death. A vite that dies on its
  // own leaves the row standing as LEAKED, which is correct: it is the record of work that ended
  // without saying so, and the only evidence a later session has that it happened.
  const spawnRecord = registerDetachedSpawn({
    pid: child.pid,
    command: `studio dev server (vite) on :${PORT} — pnpm studio:up`,
    cwd: studioDir,
  });

  console.log(`studio: started pid ${child.pid} → ${url}`);
  console.log(`studio: log → ${logFile}`);
  if (spawnRecord !== null) console.log('studio: registered with `storytree own` (stop it with `storytree own stop`)');

  // Poll briefly so the operator learns immediately whether it actually came up — and whether the
  // thing that came up is the process we just started.
  return await awaitReady(child.pid, child);
}

function down() {
  // Stop BOTH the recorded pid AND whatever actually holds :5173. The two usually coincide, but the
  // orphan case (recorded pid dead, a different process still serving — the bug this fixes) is exactly
  // when they don't, so reaping by port is what makes `down` reliable.
  const recorded = readPid();
  const portPids = listeningPids(PORT);
  const targets = [...new Set([recorded, ...portPids].filter((p) => Number.isInteger(p) && p > 0))];
  if (targets.length === 0) {
    console.log(`studio: not running (no pid file, nothing on :${PORT})`);
    try { fs.unlinkSync(pidFile); } catch {}
    return 0;
  }
  for (const pid of targets) {
    try {
      process.kill(pid); // Windows: maps to TerminateProcess — unconditional, so an orphan can't ignore it
      console.log(`studio: stopped pid ${pid}${pid === recorded ? '' : ` (held :${PORT})`}`);
    } catch {
      console.log(`studio: pid ${pid} was not running`);
    }
    // Retire the registry row for anything we stopped, including a port-reaped orphan whose record
    // path this process never held. Scoped to THIS checkout's session by construction, so the reap
    // cannot reach a sibling's row however the pid was discovered.
    removeSpawnRecordForPid(pid);
  }
  try { fs.unlinkSync(pidFile); } catch {}
  return 0;
}

/**
 * Answers "is the server on :5173 the one THIS checkout started?" — the same comparison `up` makes,
 * available to a session that did not start it. Exit 0 means CONFIRMED ours and serving, nothing
 * weaker: a foreign or unidentifiable listener used to exit 0 alongside the line "serving", which is
 * the wrong answer this unit exists to stop.
 */
async function status() {
  const pid = readPid();
  const alive = pid !== null && pidAlive(pid);
  const probe = await probeHealth();
  const verdict = classifyListener({ recordedPid: pid, serving: probe.serving, healthPid: probe.pid });
  const portPids = listeningPids(PORT);
  console.log(`studio: pid file ${pid !== null ? `→ ${pid}` : 'absent'}`);
  console.log(`studio: process ${alive ? 'alive' : 'not running'}`);
  if (verdict === 'ours') {
    console.log(`studio: ${url} serving — pid ${probe.pid} IS this session's server`);
  } else if (verdict === 'foreign') {
    console.log(`studio: ${url} serving — but pid ${probe.pid} answers, NOT this checkout's server (pid file ${pid === null ? 'absent' : `names ${pid}`})`);
  } else if (verdict === 'unidentified') {
    console.log(`studio: ${url} serving — but it reports no pid, so it cannot be confirmed as this session's server`);
  } else {
    console.log(`studio: ${url} not responding`);
  }
  // Surface the actual :5173 holder — when it differs from the pid file, that IS the orphan.
  if (portPids.length > 0) {
    const stale = pid !== null && !portPids.includes(pid);
    console.log(`studio: listening on :${PORT} → pid ${portPids.join(', ')}${stale ? ' (pid file is STALE — `studio:down` will still reap it)' : ''}`);
  }
  return verdict === 'ours' ? 0 : 1;
}

async function main() {
  const cmd = process.argv[2] ?? 'status';
  const run = { up, down, status }[cmd];
  if (!run) {
    console.error(`studio: unknown command "${cmd}" (expected up | down | status)`);
    process.exit(2);
  }
  process.exit(await run());
}

// Run the CLI only when invoked directly (`node scripts/studio.mjs <cmd>`), so a test can `import`
// this module to exercise the pure helpers (parseListeningPids) without launching/killing anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
