import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * THE ADR-0198 CONTAINMENT GUARD, applied in advance (`pi-harness-admission-arc` increment 1).
 *
 * The Cursor leaf (ADR-0177) was retired by ADR-0198, and the retirement required DELETING the SDK
 * rather than leaving it dormant, because an unused import that can still authenticate is a live
 * liability. The arc's end state 4 asks for that lesson applied BEFORE the fact: pi reachable only
 * through the seam, no import of pi anywhere else, and nothing dormant that can authenticate.
 *
 * This file is the mechanical half of that. It asserts, over the repo's own source:
 *
 *  1. exactly ONE non-test file names a pi package at all — `packages/agent/src/pi-fence.ts`;
 *  2. that file imports pi TYPES ONLY, so nothing in the shipped graph can construct a pi client,
 *     read a credential store, or reach a provider;
 *  3. no pi package is a runtime `dependency` of any workspace package — all three are
 *     devDependencies, so a consumer installing `@storytree/agent` never pulls pi at all.
 *
 * Together those make "deletable in an afternoon" a checked property rather than an intention:
 * delete `pi-fence.ts`, its two test files, and three devDependency lines, and pi is gone.
 *
 * TEST files may import pi at RUNTIME — `pi-fence.test.ts` proves the fence against pi's own
 * loader, runner and agent loop, which is the entire point and is impossible with types alone.
 * That is safe by construction, not by convention: every `ModelRuntime` it builds points at a
 * throwaway `authPath` in a fresh temp dir with `allowModelNetwork: false`, so no real credential
 * is read and no provider is reachable. Tests are also not part of any published graph.
 */

const PI_PACKAGE_PREFIX = "@earendil-works/";

/** The ONE file allowed to name pi, relative to the repo root, in forward-slash form. */
const PI_IMPORT_SITE = "packages/agent/src/pi-fence.ts";

/** Walk up to the workspace root (the directory holding `pnpm-workspace.yaml`). */
function repoRoot(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`could not locate the workspace root from ${import.meta.dirname}`);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "legacy", "web"]);

/**
 * Every source file under `packages/`, `apps/` and `scripts/`, repo-root-relative, forward slashes.
 *
 * `.mjs` / `.cjs` / `.js` are included deliberately: the repo's harness entry points and gate
 * scripts are plain ESM, and a TypeScript-only scan is exactly the blind spot that lets a runtime
 * import survive a "no imports anywhere" claim.
 */
function sourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name)) {
        found.push(path.relative(root, path.join(dir, entry.name)).replace(/\\/g, "/"));
      }
    }
  };
  for (const top of ["packages", "apps", "scripts"]) {
    const dir = path.join(root, top);
    if (fs.existsSync(dir)) {
      walk(dir);
    }
  }
  return found;
}

const isTestFile = (rel: string): boolean => /\.(test|spec)\.[a-z]+$/.test(rel);

/**
 * Which of `candidates` mention pi. Read CONCURRENTLY and as raw bytes: ~1,300 files at one
 * `readFileSync` apiece costs ~10 s of pure syscall latency on Windows, which is not a price a
 * containment guard should add to every `pnpm -r test`.
 */
async function filesNamingPi(root: string, candidates: string[]): Promise<string[]> {
  const needle = Buffer.from(PI_PACKAGE_PREFIX, "utf8");
  const hits: string[] = [];
  const BATCH = 64;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const read = await Promise.all(
      batch.map(async (rel) => fs.promises.readFile(path.join(root, rel))),
    );
    read.forEach((buffer, index) => {
      const rel = batch[index];
      if (rel !== undefined && buffer.includes(needle)) {
        hits.push(rel);
      }
    });
  }
  return hits;
}

test("exactly one non-test source file in the repo names pi", async () => {
  const root = repoRoot();
  const files = sourceFiles(root);
  assert.ok(files.length > 100, `the source scan found only ${files.length} files — it is not walking the repo`);
  assert.ok(
    files.includes(PI_IMPORT_SITE),
    `the source scan never reached ${PI_IMPORT_SITE} — it cannot be finding anything`,
  );

  const naming = await filesNamingPi(
    root,
    files.filter((rel) => !isTestFile(rel)),
  );
  assert.deepEqual(
    naming.sort(),
    [PI_IMPORT_SITE],
    "pi must be reachable through the fence alone (ADR-0198: nothing dormant that can authenticate)",
  );
});

test("the single pi import site imports pi TYPES ONLY — no runtime coupling", () => {
  const root = repoRoot();
  const source = fs.readFileSync(path.join(root, PI_IMPORT_SITE), "utf8");

  // Every statement that mentions a pi package must be a type-only import or export. A value
  // import (`import { createAgentSession } from "@earendil-works/..."`) would put pi's module
  // graph — and with it its credential store and provider clients — into the shipped bundle.
  const lines = source.split("\n");
  const offenders: string[] = [];
  let inTypeBlock = false;
  for (const line of lines) {
    if (/^\s*(import|export)\s+type\s/.test(line)) {
      inTypeBlock = true;
    }
    if (!line.includes(PI_PACKAGE_PREFIX)) {
      if (/^\s*}\s*from\s/.test(line)) {
        inTypeBlock = false;
      }
      continue;
    }
    const singleLineTypeImport = /^\s*(import|export)\s+type\s.*from\s/.test(line);
    if (!singleLineTypeImport && !inTypeBlock) {
      offenders.push(line.trim());
    }
    inTypeBlock = false;
  }
  assert.deepEqual(offenders, [], `${PI_IMPORT_SITE} must import pi with 'import type' only`);

  // And the direct form, belt and braces: no bare value import of a pi package.
  assert.equal(
    /^\s*import\s+(?!type\s)[^;]*from\s*["']@earendil-works\//m.test(source),
    false,
    "a value import of a pi package would make the fence able to authenticate",
  );
});

test("no workspace package takes pi as a runtime dependency", () => {
  const root = repoRoot();
  const manifests = [
    ...listPackageJson(path.join(root, "packages")),
    ...listPackageJson(path.join(root, "apps")),
    path.join(root, "package.json"),
  ];
  const offenders: string[] = [];
  for (const manifest of manifests) {
    if (!fs.existsSync(manifest)) {
      continue;
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const deps = readDeps(parsed, "dependencies");
    for (const name of Object.keys(deps)) {
      if (name.startsWith(PI_PACKAGE_PREFIX)) {
        offenders.push(`${path.relative(root, manifest).replace(/\\/g, "/")} → ${name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "pi must stay a devDependency: a runtime dep ships it to consumers");
});

function listPackageJson(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "node_modules")
    .map((e) => path.join(dir, e.name, "package.json"));
}

function readDeps(manifest: unknown, field: string): Record<string, unknown> {
  if (typeof manifest !== "object" || manifest === null) {
    return {};
  }
  const value = (manifest as Record<string, unknown>)[field];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
