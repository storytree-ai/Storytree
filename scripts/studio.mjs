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

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studioDir = path.join(repoRoot, 'apps', 'studio');
const pidFile = path.join(studioDir, '.studio.pid');
const logFile = path.join(studioDir, '.studio.log');
const url = 'http://localhost:5173';

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
    console.log(`studio: something is already serving ${url} (no pid file match) — not starting a second one`);
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
  const pid = readPid();
  if (pid === null) {
    console.log('studio: not running (no pid file)');
    return 0;
  }
  try {
    process.kill(pid);
    console.log(`studio: stopped pid ${pid}`);
  } catch {
    console.log(`studio: pid ${pid} was not running`);
  }
  try { fs.unlinkSync(pidFile); } catch {}
  return 0;
}

async function status() {
  const pid = readPid();
  const alive = pid !== null && pidAlive(pid);
  const serving = await portServing();
  console.log(`studio: pid file ${pid !== null ? `→ ${pid}` : 'absent'}`);
  console.log(`studio: process ${alive ? 'alive' : 'not running'}`);
  console.log(`studio: ${url} ${serving ? 'serving' : 'not responding'}`);
  return serving ? 0 : 1;
}

const cmd = process.argv[2] ?? 'status';
const run = { up, down, status }[cmd];
if (!run) {
  console.error(`studio: unknown command "${cmd}" (expected up | down | status)`);
  process.exit(2);
}
process.exit(await run());
