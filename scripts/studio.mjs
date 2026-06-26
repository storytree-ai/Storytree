// Detached studio launcher — `pnpm studio:up | studio:down | studio:status`.
//
// `pnpm --filter studio dev` ties the Vite dev server to a terminal the operator
// then has to babysit. This script instead spawns the same server DETACHED
// (windowsHide, stdio to an append-only log, unref'd), so one `pnpm studio:up`
// outlives the launching shell/session. State lives next to the app:
// apps/studio/.studio.pid (the server PID) and apps/studio/.studio.log
// (appended stdout+stderr) — both gitignored.
//
// `status` probes http://localhost:5173/api/health, but the health route is
// added by a sibling change in apps/studio/server — so ANY HTTP response from
// the port (even a 404) counts as "serving". That keeps this script standalone:
// a plain Vite server without the route still reports up.
//
// Plain Node ESM (no tsx/deps) so it runs before/without a workspace install
// of anything beyond the studio app itself.

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

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

// Any HTTP response — health route or a 404 from plain Vite — means the port is serving.
async function portServing(timeoutMs = 1500) {
  try {
    await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

function logTail(lines = 20) {
  try {
    const text = fs.readFileSync(logFile, 'utf8');
    return text.split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}

async function up() {
  const pid = readPid();
  if (pid !== null && pidAlive(pid)) {
    console.log(`studio: already running (pid ${pid}) at ${url}`);
    return 0;
  }
  if (await portServing()) {
    const orphans = listeningPids(PORT);
    const who = orphans.length > 0 ? ` (pid ${orphans.join(', ')})` : '';
    console.log(`studio: something is already serving ${url}${who} (no pid file match) — not starting a second one`);
    if (orphans.length > 0) console.log('studio: run `pnpm studio:down` to stop it (it reaps the port, not just the pid file)');
    return 0;
  }

  // Same command as apps/studio's "dev" script, but detached. Defaults mirror
  // .claude/launch.json (pg store, operator IAM email); explicit env wins.
  const env = {
    ...process.env,
    STORYTREE_STUDIO_STORE: process.env.STORYTREE_STUDIO_STORE ?? 'pg',
    STORYTREE_DB_USER: process.env.STORYTREE_DB_USER ?? 'hua.mick@gmail.com',
  };

  const logFd = fs.openSync(logFile, 'a');
  fs.writeSync(logFd, `\n--- studio:up ${new Date().toISOString()} ---\n`);
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
  console.log(`studio: started pid ${child.pid} → ${url}`);
  console.log(`studio: log → ${logFile}`);

  // Poll briefly so the operator learns immediately whether it actually came up.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await portServing(1000)) {
      console.log(`studio: serving at ${url}`);
      return 0;
    }
    if (!pidAlive(child.pid)) {
      console.error('studio: process died during startup — log tail:');
      console.error(logTail());
      try { fs.unlinkSync(pidFile); } catch {}
      return 1;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('studio: not answering yet after 15s — it may still be warming up; check the log.');
  return 0;
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
  }
  try { fs.unlinkSync(pidFile); } catch {}
  return 0;
}

async function status() {
  const pid = readPid();
  const alive = pid !== null && pidAlive(pid);
  const serving = await portServing();
  const portPids = listeningPids(PORT);
  console.log(`studio: pid file ${pid !== null ? `→ ${pid}` : 'absent'}`);
  console.log(`studio: process ${alive ? 'alive' : 'not running'}`);
  console.log(`studio: ${url} ${serving ? 'serving' : 'not responding'}`);
  // Surface the actual :5173 holder — when it differs from the pid file, that IS the orphan.
  if (portPids.length > 0) {
    const stale = pid !== null && !portPids.includes(pid);
    console.log(`studio: listening on :${PORT} → pid ${portPids.join(', ')}${stale ? ' (pid file is STALE — `studio:down` will still reap it)' : ''}`);
  }
  return serving ? 0 : 1;
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
