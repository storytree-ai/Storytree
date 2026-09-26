// `pnpm test`: run every packages/*/src/**/*.test.ts, apps/*/src/**/*.test.ts and
// scripts/*.test.mjs with node:test (through tsx) against a real Postgres. Run it as `pnpm test`
// (node --import tsx scripts/test.mjs): it imports @storytree/local-postgres, which is TypeScript.
//
// With STORYTREE_TEST_PG_URL set, the tests use that server and nothing is started or stopped.
// Otherwise this runs a throwaway local server through @storytree/local-postgres, and hands the
// tests its data directory too, as STORYTREE_TEST_PG_DATA (the agent link reads the owner record
// local-postgres keeps beside it, as it reads the desktop app's). The server comes from the
// @embedded-postgres binaries (on Windows arm64, the x64 build under the OS's emulation). Its
// cluster lives in .pgtest/data and is created on first use. The server listens on 127.0.0.1 only,
// on a free port, and is ALWAYS stopped again: after a pass, after a failure, and on Ctrl-C. A run
// is refused while another live run holds .pgtest/data, and a server that an interrupted run left
// running is stopped before this one starts.
//
// Arguments go to `node --test`: `pnpm test -- <file>` runs just that file. Give options in
// --name=value form, so that a value is never mistaken for a file.
//
// On Windows, a Node.js whose libuv can end the process on a TCP connect is refused before anything
// starts, with the release to install instead (scripts/node-runtime.mjs): under it, a test file now
// and then dies at its first connection to Postgres, which reads as a flaky test.
//
// Logs: .pgtest/pg.log (the server, last run) and .pgtest/tools.log (initdb and pg_ctl).

import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DataDirInUseError, start } from "@storytree/local-postgres";

import { runtimeRefusal } from "./node-runtime.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = path.join(root, ".pgtest");
const dataDir = path.join(work, "data");
const serverLog = path.join(work, "pg.log");
const toolLog = path.join(work, "tools.log");
const ALL_TESTS = ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "scripts/*.test.mjs"];

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
  const refusal = runtimeRefusal();
  if (refusal !== undefined) {
    console.error(`test harness: ${refusal}`);
    return 1;
  }
  if (process.env.STORYTREE_TEST_PG_URL) {
    console.log("test Postgres: STORYTREE_TEST_PG_URL is set; using that server");
    return runTests(process.env);
  }
  try {
    rmSync(serverLog, { force: true }); // the last run's; a live run still writing it keeps it
  } catch {}
  let server;
  try {
    server = await start({
      dataDir,
      serverLog,
      toolLog,
      owner: "a `pnpm test` run",
      log: (message) => console.log(`test Postgres: ${message}`),
    });
  } catch (error) {
    if (error instanceof DataDirInUseError) {
      throw new Error(`another test run (pid ${error.pid}) is using the test Postgres in ${dataDir}; wait for it to finish`);
    }
    throw error;
  }
  try {
    if (interrupted) return 130;
    return await runTests({ ...process.env, STORYTREE_TEST_PG_URL: server.url, STORYTREE_TEST_PG_DATA: server.dataDir });
  } finally {
    await server.stop();
  }
}

function runTests(env) {
  const files = testArgs.some((arg) => !arg.startsWith("-")) ? [] : ALL_TESTS;
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
