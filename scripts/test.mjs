// `pnpm test`: run every packages/*/src/**/*.test.ts with node:test (through tsx) against a real
// Postgres.
//
// With STORYTREE_TEST_PG_URL set, the tests use that server and nothing is started or stopped.
// Otherwise this runs a throwaway local server from the @embedded-postgres binaries (on Windows
// arm64, the x64 build under the OS's emulation). Its cluster lives in .pgtest/data and is created
// on first use (initdb takes minutes under emulation, once). The server listens on 127.0.0.1 only,
// on a free port, and is ALWAYS stopped again: after a pass, after a failure, and on Ctrl-C.
//
// Arguments go to `node --test`: `pnpm test -- <file>` runs just that file. Give options in
// --name=value form, so that a value is never mistaken for a file.
//
// Logs: .pgtest/pg.log (the server, last run) and .pgtest/tools.log (initdb and pg_ctl).

import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = path.join(root, ".pgtest");
const dataDir = path.join(work, "data");
const serverLog = path.join(work, "pg.log");
const toolLog = path.join(work, "tools.log");
const ownerFile = path.join(work, "owner.pid");
const ALL_TESTS = "packages/*/src/**/*.test.ts";

const testArgs = process.argv.slice(2);
if (testArgs[0] === "--") testArgs.shift();

let child; // the test run, while it runs
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => {
    interrupted = true;
    child?.kill(); // a console Ctrl-C reaches it anyway; this covers a signal sent to us alone
  });
}

main().then(
  (code) => {
    process.exitCode = interrupted ? 130 : code;
  },
  (error) => {
    console.error(`\ntest harness: ${error.message}`);
    printTail(toolLog);
    printTail(serverLog);
    process.exitCode = 1;
  },
);

async function main() {
  if (process.env.STORYTREE_TEST_PG_URL) {
    console.log("test Postgres: STORYTREE_TEST_PG_URL is set; using that server");
    return runTests(process.env);
  }
  const bin = binaries();
  mkdirSync(work, { recursive: true });
  await ensureCluster(bin);
  await clearStaleServer(bin);
  const port = await freePort();
  try {
    writeFileSync(ownerFile, String(process.pid));
    rmSync(serverLog, { force: true });
    const started = Date.now();
    const code = await tool(bin, "pg_ctl", [
      "-D", dataDir,
      "-o", `-p ${port} -c listen_addresses=127.0.0.1`,
      "-l", serverLog,
      "-w", "start",
    ]);
    if (code !== 0) throw new Error(`pg_ctl start failed with exit code ${code}`);
    console.log(`test Postgres: listening on 127.0.0.1:${port} (started in ${since(started)})`);
    if (interrupted) return 130;
    return await runTests({
      ...process.env,
      STORYTREE_TEST_PG_URL: `postgres://postgres@127.0.0.1:${port}/postgres`,
    });
  } finally {
    await stopServer(bin);
  }
}

/** The directory holding initdb and pg_ctl, from the @embedded-postgres package for this machine. */
function binaries() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const candidates = [`@embedded-postgres/${platform}-${process.arch}`];
  // There is no Windows arm64 build; the x64 one runs under the OS's emulation.
  if (platform === "windows" && process.arch === "arm64") {
    candidates.push("@embedded-postgres/windows-x64");
  }
  const require = createRequire(path.join(root, "packages", "library", "package.json"));
  for (const name of candidates) {
    let entry;
    try {
      entry = require.resolve(name);
    } catch {
      continue;
    }
    const bin = path.join(packageRoot(entry, name), "native", "bin");
    if (existsSync(bin)) return bin;
  }
  throw new Error(
    `no Postgres binaries for ${process.platform}-${process.arch} (looked for ${candidates.join(", ")}). ` +
      "Run `pnpm install`, or set STORYTREE_TEST_PG_URL to a server to test against.",
  );
}

function packageRoot(entry, name) {
  for (let dir = path.dirname(entry); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === name) return dir;
  }
  throw new Error(`cannot find the package root of ${name} (it resolved to ${entry})`);
}

async function ensureCluster(bin) {
  if (existsSync(dataDir)) return;
  // initdb fills a scratch directory that is renamed into place only once complete, so an
  // interrupted first run never leaves a half-made cluster for the next run to trip over.
  const scratch = `${dataDir}.initdb`;
  rmSync(scratch, { recursive: true, force: true });
  console.log(
    "test Postgres: creating the cluster in .pgtest/data (first run only; minutes under x64 emulation)",
  );
  const started = Date.now();
  const code = await tool(bin, "initdb", ["-D", scratch, "-U", "postgres", "-A", "trust", "-E", "UTF8"]);
  if (code !== 0) throw new Error(`initdb failed with exit code ${code}`);
  await renameIntoPlace(scratch, dataDir);
  console.log(`test Postgres: cluster created in ${since(started)}`);
}

async function renameIntoPlace(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      // Windows can keep a just-written file open for a moment (a virus scan, the indexer).
      if (attempt === 20 || !["EPERM", "EBUSY", "EACCES"].includes(error.code)) throw error;
      await sleep(250);
    }
  }
}

/** A server left running by a run that was killed before it could stop it is stopped now. */
async function clearStaleServer(bin) {
  if ((await tool(bin, "pg_ctl", ["-D", dataDir, "status"])) !== 0) return;
  const owner = Number.parseInt(readText(ownerFile), 10);
  if (owner > 0 && owner !== process.pid && isAlive(owner)) {
    throw new Error(
      `another test run (pid ${owner}) is using the test Postgres in ${dataDir}; wait for it to finish`,
    );
  }
  console.log("test Postgres: stopping a server that an interrupted run left running");
  await stopServer(bin);
}

async function stopServer(bin) {
  if ((await tool(bin, "pg_ctl", ["-D", dataDir, "status"])) === 0) {
    const started = Date.now();
    const code = await tool(bin, "pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]);
    if (code !== 0) {
      throw new Error(`pg_ctl stop failed with exit code ${code}; the test Postgres may still be running`);
    }
    console.log(`test Postgres: stopped (${since(started)})`);
  } else {
    // It never started, or it already shut itself down (on Windows a console Ctrl-C reaches it too).
    console.log("test Postgres: not running");
  }
  rmSync(ownerFile, { force: true });
}

/** Run one Postgres tool to completion, appending its output to .pgtest/tools.log. */
function tool(bin, name, args) {
  // Never a pipe: on Windows `pg_ctl start` leaves a shell holding its output handles for as long
  // as the server runs, and a pipe held open that way would never reach end-of-file.
  const out = openSync(toolLog, "a");
  writeSync(out, `\n[${new Date().toISOString()}] ${name} ${args.join(" ")}\n`);
  const executable = path.join(bin, process.platform === "win32" ? `${name}.exe` : name);
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { stdio: ["ignore", out, out] });
    proc.on("error", reject);
    proc.on("exit", (code) => resolve(code ?? 1));
  }).finally(() => closeSync(out));
}

function runTests(env) {
  const files = testArgs.some((arg) => !arg.startsWith("-")) ? [] : [ALL_TESTS];
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, ["--import", "tsx", "--test", ...testArgs, ...files], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      child = undefined;
      resolve(code ?? 1);
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function printTail(file, lines = 20) {
  const text = readText(file).trimEnd();
  if (!text) return;
  console.error(`\n--- last lines of ${path.relative(root, file)} ---`);
  console.error(text.split(/\r?\n/).slice(-lines).join("\n"));
}

function since(started) {
  return `${((Date.now() - started) / 1000).toFixed(1)} s`;
}
