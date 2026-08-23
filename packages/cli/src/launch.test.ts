// Contract for the direct CLI launcher (`packages/cli/launch.mjs`, ADR-0162 inc 2 — kill the
// CLI startup tax). The launcher registers the tsx ESM loader in-process and calls main.ts
// directly instead of shelling through two nested pnpm layers. These are its behavioural
// invariants: it forwards argv verbatim (positionals AND --flags), preserves exit codes, and
// produces the CLI envelope with none of the old nested-pnpm script noise. Each behavioural case
// spawns node once (the launcher's whole job is process orchestration, so a spawn is the honest
// proof); kept to two spawns to stay cheap.
import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { handleStoreRequest } from "@storytree/storage-protocol/http-server";
import { loadFixtureCorpus } from "@storytree/library/fixture";
import { nodeExecutable } from "./node-executable.js";

const LAUNCHER = fileURLToPath(new URL("../launch.mjs", import.meta.url));
const ROOT_PKG = fileURLToPath(new URL("../../../package.json", import.meta.url));

function runLauncher(args: string[]) {
  const res = spawnSync(nodeExecutable(), [LAUNCHER, ...args], { encoding: "utf8" });
  // No cwd override — the launcher must work from the default cwd and resolve its own paths from
  // import.meta.url (repoRoot is file-relative, not cwd-relative).
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/**
 * The same spawn, ASYNC, for the cases that must serve the child a store door from this process.
 *
 * `spawnSync` cannot be used there and the reason is a deadlock, not a preference: it blocks this
 * process's event loop for the child's whole lifetime, so the `node:http` door below could never
 * answer the request the child is waiting on, and both sides would hang until the test runner was
 * killed. The synchronous form stays for the door-less cases — it is simpler, and it is what those
 * tests have always used.
 */
function runLauncherAsync(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeExecutable(), [LAUNCHER, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

/**
 * A local ADR-0259 STORE DOOR over the fixture corpus, so a spawned CLI has a corpus to read
 * without a database.
 *
 * WHY THIS EXISTS AT ALL. These two cases have to spawn the real binary — the whole claim is about
 * what reaches *stdout at the process boundary*, which `run(...)` returning the right bytes cannot
 * prove. Before ADR-0302 D1 the spawned CLI answered from the committed seed, so a spawn cost
 * nothing. It now reads the live store, and ADR-0302 D3 keeps `STORYTREE_DB_USER` out of
 * `pnpm -r test` precisely so suites stay hermetic — so a spawn against the default path would put
 * a database in the middle of a unit test.
 *
 * The door is the seam that already exists for exactly this shape (a client that cannot dial Cloud
 * SQL): `STORYTREE_STORE_URL` makes the CLI use `HttpStore`, and `handleStoreRequest` is the same
 * server half the studio mounts at `/api/store`. So this is not a stub of the CLI's behaviour — it
 * is the real client, the real wire contract and the real handler, with an `InMemoryStore` behind
 * them. It proves MORE than the old seed-backed spawn did.
 */
async function withStoreDoor(fn: (baseUrl: string) => void | Promise<void>): Promise<void> {
  const store = new InMemoryStore();
  await loadFixtureCorpus(store);
  const server: Server = createServer((req, res) => {
    void (async () => {
      const { status, body } = await handleStoreRequest(store, {
        method: req.method ?? "GET",
        path: req.url ?? "/",
      });
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("launcher forwards positionals + --flags to main.ts and returns a clean envelope", () => {
  // `own --all` runs fully offline — it reads a local run registry and touches no store. It used to
  // be `adr list --current`, chosen for the same property, until decisions moved into the store
  // (ADR-0403 dec 1) and that command gained a DB dependency; a launcher test that dialled the live
  // database would stop being hermetic and start reporting the DB's health as an argv-forwarding
  // failure. What the assertion needs is unchanged: a positional AND a flag that visibly changes
  // stdout, so a launcher that dropped either — or demoted `--all` to a positional, the
  // end-of-options-marker trap — produces different text.
  const { status, stdout } = runLauncher(["own", "--all"]);
  assert.equal(status, 0, `expected exit 0, got ${status}`);
  assert.match(stdout, /registered background work, by owning session/, "positionals + --flag forwarded");
  assert.doesNotMatch(stdout, /session "/, "the bare form's header must NOT appear — the flag reached main");
  // Regression guard: prove we're on the direct launcher path, not the old double-pnpm path that
  // echoed two lifecycle-script headers into stdout.
  assert.doesNotMatch(stdout, /pnpm --filter/, "must not shell through the nested pnpm layers");
  assert.doesNotMatch(stdout, /storytree@0\.0\.0 storytree/, "no pnpm lifecycle-script header");
});

test("launcher preserves a non-zero exit code on an unknown command", () => {
  const { status } = runLauncher(["not-a-real-storytree-command"]);
  assert.notEqual(status, 0, "an unknown command must exit non-zero");
});

test("root `storytree` script is wired to the launcher", () => {
  // Guards the wiring: the whole speed-up depends on the root script pointing at launch.mjs, and
  // `pnpm storytree` is referenced across docs/hooks, so a revert here would silently regress it.
  const pkg = JSON.parse(readFileSync(ROOT_PKG, "utf8")) as { scripts?: Record<string, string> };
  assert.equal(
    pkg.scripts?.["storytree"],
    "node packages/cli/launch.mjs",
    "root storytree script must invoke the direct launcher",
  );
});

// ---- `--raw <field>` puts the value ALONE on stdout ------------------------------------------
//
// The bare-bytes read (proposal `library-artifact-can-read-one-raw-stored-field`) is the ONE
// deliberate exception to the envelope convention, and the exception only pays off at the process
// boundary: anything else on stdout — a heading, `doctrine:`, `next:`, the delta footer — defeats
// piping it to a file. `run` returning the right bytes does not prove `main` writes them, so this
// spawns the CLI for real, against the local door above.
//
// It still reads a genuinely multi-KB field (~9.7 KB of `merge-ceremony` `process` prose, carried
// verbatim into the fixture for exactly this reason) rather than a short synthetic string, because
// the whole point is that a LONG value survives the round trip unaltered — through the wire
// contract now as well as through stdout, which is a strictly longer path than the seed read this
// replaces.
test("library artifact <id> --raw <field> writes the exact stored bytes and nothing else", async () => {
  const { FIXTURE_CORPUS_UNITS } = await import("@storytree/library/fixture");
  const subject = FIXTURE_CORPUS_UNITS.find((d) => d.id === "merge-ceremony");
  assert.ok(subject, "the fixture carries the merge-ceremony process");
  const expected = subject["steps"];
  assert.equal(typeof expected, "string");
  assert.ok((expected as string).length > 2000, "a genuinely multi-KB field, not a toy string");

  await withStoreDoor(async (baseUrl) => {
    const { status, stdout } = await runLauncherAsync(
      ["library", "artifact", "merge-ceremony", "--raw", "steps"],
      { STORYTREE_STORE_URL: baseUrl },
    );
    assert.equal(status, 0, "a found field exits 0");
    assert.equal(stdout, expected, "stdout IS the stored value — byte for byte, nothing appended");
    // Stated as its own assertions so a regression names what leaked rather than dumping a 9 KB diff.
    assert.doesNotMatch(stdout, /\nnext:\n/, "no next: block");
    assert.doesNotMatch(stdout, /\ndoctrine:\n/, "no doctrine block");
    assert.doesNotMatch(stdout, /^# /, "no artifact heading");
  });
});

test("library artifact <id> --raw <absent field> exits non-zero and writes no bare bytes", async () => {
  await withStoreDoor(async (baseUrl) => {
    const { status, stdout } = await runLauncherAsync(
      ["library", "artifact", "merge-ceremony", "--raw", "notAStoredField"],
      { STORYTREE_STORE_URL: baseUrl },
    );
    assert.notEqual(status, 0, "an absent field is a miss");
    assert.match(stdout, /notAStoredField/, "the miss names the field it could not read");
  });
});
