// The fs shell for the forest-world → website sync + drift gate (ADR-0093). Two modes
// over the pure core in web-engine-sync.ts:
//
//   pnpm sync:web-engine     copy the shared render core into web/src/lib/forest-world/
//   pnpm check:web-engine    fail (exit 1) if the synced copy drifts from the core — the gate guard
//
// Like check-web-grounding, this runs in the PARENT repo (the only side that owns the
// core source) against the checked-out `web/` submodule, at submodule-bump granularity.
// Bootstrap allowance: until the website opts in, web/src/lib/forest-world/ does not
// exist — the CHECK then SKIPs (it is not a failure that the site hasn't adopted the
// core yet). Once the dir exists, drift is a hard failure. An absent web/ submodule is
// a local SKIP / a CI failure (the workflow must clone the pinned web SHA first), as in
// check-web-grounding.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ENGINE_DIR,
  REQUIRED_ENGINE_FILES,
  computeSyncPlan,
  detectEngineDrift,
  isEngineSource,
} from "./web-engine-sync.js";

/** Repo root: packages/cli/src/web-engine.ts → four dirs up (the build-claude-md pattern). */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const coreSrcDir = path.join(repoRoot, "packages", "forest-world", "src");
const webRoot = path.join(repoRoot, "web");
const engineDirAbs = path.join(webRoot, ...ENGINE_DIR.split("/"));

function fail(message: string): never {
  console.error(`${process.argv.includes("--check") ? "check" : "sync"}:web-engine — ${message}`);
  process.exit(1);
}

/** Read the core's browser-safe sources (file name → content), filtered to engine sources. */
function readCoreSources(): Map<string, string> {
  if (!existsSync(coreSrcDir)) {
    fail(`the render core is missing at ${path.relative(repoRoot, coreSrcDir)} — is @storytree/forest-world present?`);
  }
  const sources = new Map<string, string>();
  for (const name of readdirSync(coreSrcDir)) {
    if (isEngineSource(name)) sources.set(name, readFileSync(path.join(coreSrcDir, name), "utf8"));
  }
  for (const required of REQUIRED_ENGINE_FILES) {
    if (!sources.has(required)) fail(`the render core is missing ${required} — discovery found the wrong dir.`);
  }
  return sources;
}

/** Files currently in the website's engine dir (to catch stale leftovers). */
function listSyncedFiles(): string[] {
  if (!existsSync(engineDirAbs)) return [];
  return readdirSync(engineDirAbs).filter((n) => isEngineSource(n));
}

function runCheck(): void {
  const inCi = process.env.CI === "true";

  if (!existsSync(webRoot)) {
    if (inCi) {
      fail("web/ is not checked out in CI — the workflow must clone the pinned storytree-web submodule first.");
    }
    console.log(
      "check:web-engine — SKIP: web/ submodule not checked out " +
        "(run `git submodule update --init web` to enable this check locally).",
    );
    return;
  }

  if (!existsSync(engineDirAbs)) {
    // Bootstrap: the website has not yet adopted the shared core. Not a failure — the
    // parent-side machinery lands first; the site opts in (and this starts enforcing)
    // when web/src/lib/forest-world/ is synced in and the submodule is bumped.
    console.log(
      `check:web-engine — SKIP: ${ENGINE_DIR} not present in web/ yet (the site has not adopted the ` +
        "shared render core; run `pnpm sync:web-engine` from the web submodule to wire it).",
    );
    return;
  }

  const plan = computeSyncPlan(readCoreSources());
  const readSynced = (file: string): string | null => {
    const p = path.join(engineDirAbs, file);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  const problems = detectEngineDrift(plan, readSynced, listSyncedFiles());

  if (problems.length > 0) {
    console.error(
      `check:web-engine — BLOCKED: the website's synced render core has drifted from ` +
        `@storytree/forest-world (${problems.length} file(s)):\n`,
    );
    for (const p of problems) console.error(`  ✗ ${ENGINE_DIR}/${p.file}: ${p.reason}`);
    console.error(
      "\nThe shared core changed but the public copy wasn't re-synced. Run `pnpm sync:web-engine`, " +
        "commit the web submodule, and bump it here.",
    );
    process.exit(1);
  }

  console.log(`check:web-engine — OK: ${plan.length} synced render-core file(s) match the core.`);
}

function runSync(): void {
  if (!existsSync(webRoot)) {
    fail("web/ submodule not checked out — run `git submodule update --init web` first.");
  }
  const plan = computeSyncPlan(readCoreSources());
  mkdirSync(engineDirAbs, { recursive: true });

  // Drop stale leftovers (a core file deleted upstream) so the synced set is exact.
  const planned = new Set(plan.map((p) => p.file));
  let dropped = 0;
  for (const name of listSyncedFiles()) {
    if (!planned.has(name)) {
      rmSync(path.join(engineDirAbs, name));
      dropped++;
    }
  }

  for (const item of plan) writeFileSync(path.join(engineDirAbs, item.file), item.content, "utf8");

  console.log(
    `sync:web-engine — wrote ${plan.length} render-core file(s) into web/${ENGINE_DIR}` +
      `${dropped > 0 ? ` (dropped ${dropped} stale)` : ""}. Commit the web submodule, then bump it here.`,
  );
}

function main(): void {
  if (process.argv.includes("--check")) runCheck();
  else runSync();
}

// Run only when invoked directly, not when the test imports the pure functions.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
