/**
 * Contract for `scripts/tsx-cache-off.mjs` and the launcher's copy of the same line
 * (`the-gate-costs-what-the-change-risks-arc` inc 4 — aim at the cost centre).
 *
 * WHAT IS BEING PINNED, AND WHY THE OBVIOUS ASSERTION WOULD NOT PIN IT. tsx writes every esbuild
 * transform into a FLAT directory under `os.tmpdir()` and never evicts it; on the dev box that
 * directory had reached 232,254 files / 4.18 GB, at which point a cache LOOKUP measured as costing
 * more than the transform it saves. (⚠ Re-measured on 2026-08-21 that difference did not reproduce —
 * see `scripts/tsx-cache-off.mjs`. What THIS file pins is unaffected: it asserts the preload is
 * arranged so the variable is set BEFORE tsx reads it, which is a question about ORDER, not about
 * how much the cache costs.) Measured by running the WHOLE `pnpm -r --no-bail test` suite twice per arm,
 * interleaved on a quiet box: 745 s / 621 s of wall with the cache against 444 s / 424 s without —
 * about 36% off the whole monorepo's test leg, and every one of the 23 reporting projects got
 * faster. The same 5,446 tests ran in every arm. No test was deleted, skipped, sampled or moved off
 * the gate; the same proof simply costs less.
 *
 * The regression this file exists to catch is SILENT in the way inc-02's was: the variable still
 * reads correctly if it is set too late, so "assert the env var is set somewhere" passes on the
 * broken arrangement. tsx reads `process.env.TSX_DISABLE_CACHE` ONCE, when its own module graph is
 * evaluated, so what has to hold is an ORDER — the assignment before tsx loads. Hence the two order
 * assertions below (`--import` order in the scripts, source order in the launcher) and the one
 * end-to-end observation that a real spawned CLI leaves NO transform files behind.
 *
 * Bare `tsx <file>` invocations (the tsx BINARY, which spawns its own node) are deliberately out of
 * the totality rule's scope: they are a different launch shape with no `--import` list to order, and
 * only two remain (`packages/cli`'s `storytree` and `db` fallbacks), neither on the gate's path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SHIM_REL = "../../scripts/tsx-cache-off.mjs";
const SHIM_ABS = path.join(REPO_ROOT, "scripts", "tsx-cache-off.mjs");
/** `--import` takes a module SPECIFIER: a Windows absolute path is not one, a file:// URL is. */
const SHIM_URL = pathToFileURL(SHIM_ABS).href;
const LAUNCHER = fileURLToPath(new URL("../launch.mjs", import.meta.url));

/** Every workspace `package.json`, by repo-relative path. */
function workspaceManifests(): string[] {
  const out = [path.join(REPO_ROOT, "package.json")];
  for (const group of ["packages", "apps"]) {
    const dir = path.join(REPO_ROOT, group);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const manifest = path.join(dir, entry, "package.json");
      if (fs.existsSync(manifest)) out.push(manifest);
    }
  }
  return out;
}

/** This process's env with the flag REMOVED, so a spawn can prove what a caller's shell did not. */
function withoutFlag(): NodeJS.ProcessEnv {
  const { TSX_DISABLE_CACHE: _flag, ...rest } = process.env;
  return rest;
}

function scriptsOf(manifest: string): Array<{ name: string; command: string }> {
  const parsed = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
    scripts?: Record<string, string>;
  };
  return Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({ name, command }));
}

test("every `--import tsx` script preloads the cache-off shim FIRST", () => {
  const offenders: string[] = [];
  let guarded = 0;
  for (const manifest of workspaceManifests()) {
    for (const { name, command } of scriptsOf(manifest)) {
      const tsxAt = command.indexOf("--import tsx");
      if (tsxAt === -1) continue;
      const shimAt = command.indexOf(`--import ${SHIM_REL}`);
      const where = `${path.relative(REPO_ROOT, manifest).replace(/\\/g, "/")} :: ${name}`;
      if (shimAt === -1) {
        offenders.push(`${where} — no \`--import ${SHIM_REL}\``);
      } else if (shimAt > tsxAt) {
        // The silent shape: the variable IS set, just after tsx has already read it.
        offenders.push(`${where} — the shim is preloaded AFTER tsx, so tsx never sees the flag`);
      } else {
        guarded++;
      }
    }
  }
  assert.deepEqual(offenders, [], `scripts running tsx without the cache-off preload:\n${offenders.join("\n")}`);
  // A totality rule that matched nothing would pass forever. Pin that it really covers the repo.
  assert.ok(guarded >= 20, `expected the whole workspace to be covered, only ${guarded} scripts were`);
});

test("the relative shim path every script uses really resolves from a package directory", () => {
  // The scripts run with cwd set to their own package (`packages/<x>`, `apps/<x>`, or — for the
  // root's `pnpm -C packages/cli exec …` rungs — `packages/cli`), so ONE relative path serves them
  // all. If the workspace ever gains a differently-nested package this fails rather than producing
  // a `Cannot find module` at gate time.
  for (const manifest of workspaceManifests()) {
    for (const { name, command } of scriptsOf(manifest)) {
      if (!command.includes(`--import ${SHIM_REL}`)) continue;
      const cwd = manifest === path.join(REPO_ROOT, "package.json")
        ? path.join(REPO_ROOT, "packages", "cli") // the root rungs all `exec` inside packages/cli
        : path.dirname(manifest);
      assert.equal(
        path.resolve(cwd, SHIM_REL),
        SHIM_ABS,
        `${path.relative(REPO_ROOT, manifest)} :: ${name} — the shim path does not resolve from its cwd`,
      );
    }
  }
});

test("the shim sets TSX_DISABLE_CACHE, observed in a real preloaded process", () => {
  const res = spawnSync(
    process.execPath,
    ["--import", SHIM_URL, "-e", "process.stdout.write(process.env.TSX_DISABLE_CACHE ?? '<unset>')"],
    // The child's env is built explicitly, with the flag REMOVED: the claim is what the shim does
    // when nothing has set it, and inheriting an ambient value would make this test agree with
    // whatever the caller already had — including the empty-string escape hatch.
    { encoding: "utf8", env: withoutFlag() },
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "1");
});

test("the shim leaves an explicit TSX_DISABLE_CACHE alone — the escape hatch", () => {
  // tsx tests the variable for TRUTHINESS, so `=0` would still disable the cache; the EMPTY string
  // is the only way back to the on-disk cache, and `??=` is what preserves it.
  const res = spawnSync(
    process.execPath,
    ["--import", SHIM_URL, "-e", "process.stdout.write(JSON.stringify(process.env.TSX_DISABLE_CACHE))"],
    { encoding: "utf8", env: { ...process.env, TSX_DISABLE_CACHE: "" } },
  );
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, '""', "an explicitly emptied flag must survive, or the cache cannot be re-enabled");
});

test("the launcher sets the flag BEFORE it imports tsx", () => {
  // A source-ORDER assertion for the same reason inc-02 needed one: move the assignment below the
  // import and every behaviour still holds, the cache is simply back on. Nothing else would fail.
  const src = fs.readFileSync(LAUNCHER, "utf8");
  const set = src.indexOf('process.env["TSX_DISABLE_CACHE"]');
  const importTsx = src.indexOf('import("tsx/esm/api")');
  assert.notEqual(set, -1, "launch.mjs must disable tsx's on-disk transform cache");
  assert.notEqual(importTsx, -1, "launch.mjs must still register tsx");
  assert.ok(set < importTsx, "the flag is read when tsx loads — setting it afterwards buys nothing");
});

test("a real spawned CLI writes NO tsx transform-cache files", () => {
  // The end-to-end observation, and the only assertion here that would survive tsx changing how it
  // spells the flag: run the REAL launcher with its temp directory redirected somewhere empty, and
  // look at what it left behind. On the pre-change launcher this directory fills with one file per
  // transformed module.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tsx-cache-off-"));
  try {
    const res = spawnSync(process.execPath, [LAUNCHER, "not-a-real-storytree-command"], {
      encoding: "utf8",
      // Ambient flag stripped for the same reason as above — what is on trial is the LAUNCHER's own
      // line, not whatever the shell that started the gate happened to export.
      env: { ...withoutFlag(), TMPDIR: scratch, TEMP: scratch, TMP: scratch },
    });
    assert.notEqual(res.status, 0, "an unknown command still exits non-zero — the CLI is unchanged");

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(path.relative(scratch, full));
      }
    };
    walk(scratch);
    assert.deepEqual(
      files,
      [],
      `the launcher left transform-cache files behind, so tsx's on-disk cache is still on:\n${files
        .slice(0, 10)
        .join("\n")}`,
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("this very test process inherited the preload — the wiring reaches where the work happens", () => {
  // The end of the chain, asserted from INSIDE it. `node --test` spawns one child per test file and
  // forwards its `--import` list, so if that forwarding ever stopped, every runner child would be
  // back on the on-disk cache while the package script still looked correct — the whole win lost in
  // silence. Nothing else in this file would notice: the script-order test reads package.json, and
  // the launcher tests spawn a process that sets the flag for itself.
  //
  // What is asserted is that the variable is DEFINED, not that it equals "1", and the difference is
  // the whole point. `undefined` is the only value that means "the preload never ran here" — the
  // regression. Any defined value means it ran: "1" is its default, and the EMPTY string is a caller
  // who deliberately kept tsx's cache, which CI does on every job (see `.github/workflows/ci.yml`)
  // because a fresh runner's cache is healthy. Asserting "1" here would red the whole suite on the
  // one configuration the repo deliberately ships.
  //
  // Running this file by hand as `node --import tsx --test src/tsx-cache-off.test.ts` fails here, and
  // that is the intended reading: that invocation is not the one the gate runs. Use `pnpm test`, or
  // add `--import ../../scripts/tsx-cache-off.mjs` ahead of `--import tsx`.
  assert.notEqual(
    process.env["TSX_DISABLE_CACHE"],
    undefined,
    "the cache-off preload did not reach this test process — run the package's own `pnpm test`",
  );
});

test("CI opts back IN to tsx's cache, and spells it the one way that works", () => {
  // A hosted runner gets a fresh VM per job, so its cache cannot bloat and is a large WIN there —
  // measured at suite scale: a fresh cache runs `pnpm -r --no-bail test` in 273-296s against 358s
  // with the cache off. So CI sets the variable back.
  //
  // THE SPELLING IS THE WHOLE RISK. tsx tests this variable for TRUTHINESS, so `"0"` — the spelling
  // anyone would reach for to mean "off" — still DISABLES the cache, silently costing CI ~30% while
  // reading as correct in the diff. Only the empty string survives `??=` AND reads falsy to tsx.
  const ci = fs.readFileSync(path.join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const declared = /^\s*TSX_DISABLE_CACHE:\s*(.*)$/m.exec(ci);
  assert.ok(declared, "ci.yml must declare TSX_DISABLE_CACHE — a runner's cache is healthy and worth keeping");
  assert.equal(
    declared[1]?.trim(),
    '""',
    'CI must set TSX_DISABLE_CACHE to the EMPTY string — "0" is truthy to tsx and would disable the cache',
  );
});
