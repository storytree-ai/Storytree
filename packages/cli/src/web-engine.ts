// The fs shell for the forest-world → website sync + drift gate (ADR-0093). Two modes
// over the pure core in web-engine-sync.ts:
//
//   pnpm sync:web-engine     copy every synced parent package into web/src/lib/<pkg>/
//   pnpm check:web-engine    fail (exit 1) if any synced copy drifts from its package — the gate guard
//
// Like check-web-grounding, this runs in the PARENT repo (the only side that owns the
// package sources) against the checked-out `web/` submodule, at submodule-bump granularity.
// GENERALISED (the web-experience-sync capability, ADR-0123): ONE mechanism carries N
// parent packages (the render core + the R3F mapper), each an EnginePackage descriptor.
// Bootstrap allowance is PER PACKAGE: until the website opts a package in, its dest dir
// does not exist — the CHECK then SKIPs that package (it is not a failure that the site
// hasn't adopted it yet). Once a dest dir exists, drift is a hard failure. An absent
// web/ checkout is a local SKIP / a CI failure (the workflow must clone the pinned web
// SHA first), as in check-web-grounding — keyed on web/src, because an uninitialized
// submodule leaves an EMPTY web/ stub dir.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ENGINE_PACKAGES,
  computeSyncPlan,
  detectEngineDrift,
  isEngineSource,
} from "./web-engine-sync.js";
import type { EnginePackage } from "./web-engine-sync.js";

/** Repo root: packages/cli/src/web-engine.ts → four dirs up (the build-claude-md pattern). */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const webRoot = path.join(repoRoot, "web");

/** The package's source dir in the parent repo, OS-native. */
function srcDirAbs(pkg: EnginePackage): string {
  return path.join(repoRoot, ...pkg.srcDir.split("/"));
}

/** The package's synced dest dir inside the web checkout, OS-native. */
function destDirAbs(pkg: EnginePackage): string {
  return path.join(webRoot, ...pkg.destDir.split("/"));
}

function fail(message: string): never {
  console.error(`${process.argv.includes("--check") ? "check" : "sync"}:web-engine — ${message}`);
  process.exit(1);
}

/** Read one package's browser-safe sources (file name → content), filtered to engine
 *  sources, holding the package to its fail-loud discovery floor. */
function readPackageSources(pkg: EnginePackage): Map<string, string> {
  const dir = srcDirAbs(pkg);
  if (!existsSync(dir)) {
    fail(`the package source is missing at ${pkg.srcDir} — is the workspace package present?`);
  }
  const sources = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    if (isEngineSource(name)) sources.set(name, readFileSync(path.join(dir, name), "utf8"));
  }
  for (const required of pkg.requiredFiles) {
    if (!sources.has(required)) {
      fail(`${pkg.srcDir} is missing ${required} — discovery found the wrong dir.`);
    }
  }
  return sources;
}

/** Files currently in one package's synced dir (to catch stale leftovers). */
function listSyncedFiles(pkg: EnginePackage): string[] {
  const dir = destDirAbs(pkg);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => isEngineSource(n));
}

function runCheck(): void {
  const inCi = process.env.CI === "true";

  // Key on web/src, not web/: an uninitialized submodule leaves an EMPTY web/ stub dir.
  if (!existsSync(path.join(webRoot, "src"))) {
    if (inCi) {
      fail("web/ is not checked out in CI — the workflow must clone the pinned storytree-web submodule first.");
    }
    console.log(
      "check:web-engine — SKIP: web/ submodule not checked out " +
        "(run `git submodule update --init web` to enable this check locally).",
    );
    return;
  }

  let checkedFiles = 0;
  const checkedDirs: string[] = [];
  for (const pkg of ENGINE_PACKAGES) {
    const destDir = destDirAbs(pkg);
    if (!existsSync(destDir)) {
      // Bootstrap, per package: the website has not yet adopted THIS package. Not a
      // failure — the parent-side machinery lands first; the site opts in (and this
      // starts enforcing) when its dir is synced in and the submodule is bumped.
      console.log(
        `check:web-engine — SKIP ${pkg.destDir}: not present in web/ yet (the site has not adopted ` +
          `${pkg.srcDir}; run \`pnpm sync:web-engine\` and commit the web submodule to wire it).`,
      );
      continue;
    }

    const plan = computeSyncPlan(readPackageSources(pkg), pkg);
    const readSynced = (file: string): string | null => {
      const p = path.join(destDir, file);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    };
    const problems = detectEngineDrift(plan, readSynced, listSyncedFiles(pkg));

    if (problems.length > 0) {
      console.error(
        `check:web-engine — BLOCKED: the website's synced copy of ${pkg.srcDir} has drifted ` +
          `(${problems.length} file(s)):\n`,
      );
      for (const p of problems) console.error(`  ✗ ${pkg.destDir}/${p.file}: ${p.reason}`);
      console.error(
        "\nThe parent package changed but the public copy wasn't re-synced. Run `pnpm sync:web-engine`, " +
          "commit the web submodule, and bump it here.",
      );
      process.exit(1);
    }

    checkedFiles += plan.length;
    checkedDirs.push(pkg.destDir);
  }

  console.log(
    checkedDirs.length > 0
      ? `check:web-engine — OK: ${checkedFiles} synced file(s) across ${checkedDirs.join(", ")} match their packages.`
      : "check:web-engine — OK: no synced package dirs present yet (all packages awaiting site adoption).",
  );
}

function runSync(): void {
  if (!existsSync(path.join(webRoot, "src"))) {
    fail("web/ submodule not checked out — run `git submodule update --init web` first.");
  }

  for (const pkg of ENGINE_PACKAGES) {
    const destDir = destDirAbs(pkg);
    const plan = computeSyncPlan(readPackageSources(pkg), pkg);
    mkdirSync(destDir, { recursive: true });

    // Drop stale leftovers (a source file deleted upstream) so the synced set is exact.
    const planned = new Set(plan.map((p) => p.file));
    let dropped = 0;
    for (const name of listSyncedFiles(pkg)) {
      if (!planned.has(name)) {
        rmSync(path.join(destDir, name));
        dropped++;
      }
    }

    for (const item of plan) writeFileSync(path.join(destDir, item.file), item.content, "utf8");

    console.log(
      `sync:web-engine — wrote ${plan.length} file(s) into web/${pkg.destDir}` +
        `${dropped > 0 ? ` (dropped ${dropped} stale)` : ""}.`,
    );
  }
  console.log("sync:web-engine — commit the web submodule, then bump it here.");
}

function main(): void {
  if (process.argv.includes("--check")) runCheck();
  else runSync();
}

// Run only when invoked directly, not when the test imports the pure functions.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
