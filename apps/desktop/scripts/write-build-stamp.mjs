// Stamp the built desktop bundle with the commit it was produced at (ADR-0164 freshness signal).
//
// WHY: the tsx sidecar runs from SOURCE (fresh on every relaunch), but the studio dist + the electron
// main it serves are BUILT artifacts. A `git pull` + relaunch WITHOUT a rebuild leaves that build behind
// while the sidecar's HEAD-at-spawn reads current — so the "checkout moved" signal stays silent and a
// stale build runs invisibly (the recurring "unknown endpoint" class). This stamp records the commit the
// build was produced at; src/apply/code-stamp.ts reads it as `startedAt`, so `head !== startedAt` catches
// a behind build even when HEAD-at-spawn is fresh.
//
// Best-effort: a git failure (no git / not a repo) writes { "sha": null }, and the runtime probe falls
// back to HEAD-at-spawn — exactly the pre-stamp behaviour, no regression. Runs as the tail of build:electron.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// scripts/write-build-stamp.mjs → up one (scripts → apps/desktop), then dist/ (the build:electron outdir).
const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

let sha = null;
try {
  const out = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (/^[0-9a-f]{40,64}$/.test(out)) sha = out;
} catch {
  // no git / not a repo — leave sha null; the runtime probe falls back to HEAD-at-spawn.
}

mkdirSync(distDir, { recursive: true });
writeFileSync(resolve(distDir, "build-stamp.json"), `${JSON.stringify({ sha })}\n`);
console.error(`[write-build-stamp] wrote dist/build-stamp.json sha=${sha ?? "(none)"}`);
