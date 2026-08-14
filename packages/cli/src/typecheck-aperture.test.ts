import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APERTURE_DIR,
  findUncheckedScriptDirs,
  readWorkspaceApertures,
  type WorkspaceAperture,
} from "./typecheck-aperture.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const aperture = (o: Partial<WorkspaceAperture> & { workspace: string }): WorkspaceAperture => ({
  hasScriptsDir: true,
  include: ["src"],
  ...o,
});

// ---------------------------------------------------------------------------
// RED — the hole this exists to keep closed
// ---------------------------------------------------------------------------

test("RED: a scripts/ directory the tsconfig include does not name is a finding", () => {
  const found = findUncheckedScriptDirs([aperture({ workspace: "packages/cli" })]);
  assert.deepEqual(found, ["packages/cli/scripts"]);
});

test("RED: findings are reported for every workspace, sorted", () => {
  const found = findUncheckedScriptDirs([
    aperture({ workspace: "packages/library" }),
    aperture({ workspace: "apps/studio", include: ["src", "env.d.ts"] }),
  ]);
  assert.deepEqual(found, ["apps/studio/scripts", "packages/library/scripts"]);
});

// ---------------------------------------------------------------------------
// GREEN — and the three shapes that must NOT fire
// ---------------------------------------------------------------------------

test("GREEN: naming scripts in include clears the finding", () => {
  const found = findUncheckedScriptDirs([aperture({ workspace: "packages/cli", include: ["src", APERTURE_DIR] })]);
  assert.deepEqual(found, []);
});

test("no scripts/ directory is not a finding", () => {
  const found = findUncheckedScriptDirs([aperture({ workspace: "packages/agent", hasScriptsDir: false })]);
  assert.deepEqual(found, []);
});

test("an absent include is not a finding — tsc already takes the whole project directory", () => {
  const found = findUncheckedScriptDirs([aperture({ workspace: "packages/cli", include: undefined })]);
  assert.deepEqual(found, []);
});

// ---------------------------------------------------------------------------
// THE LOADER FAILS CLOSED — a subtractive rule must never read clean from a blind walk (#970)
// ---------------------------------------------------------------------------

test("a walk that enumerates no typechecked workspace THROWS rather than reporting clean", () => {
  const blind = mkdtempSync(path.join(tmpdir(), "aperture-blind-"));
  writeFileSync(path.join(blind, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
  mkdirSync(path.join(blind, "packages"));

  assert.throws(() => readWorkspaceApertures(blind), /refusing to report a clean aperture/);
});

test("a workspace whose tsconfig does not parse THROWS rather than being skipped", () => {
  const broken = mkdtempSync(path.join(tmpdir(), "aperture-broken-"));
  writeFileSync(path.join(broken, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
  const ws = path.join(broken, "packages", "wonky");
  mkdirSync(ws, { recursive: true });
  writeFileSync(path.join(ws, "package.json"), JSON.stringify({ scripts: { typecheck: "tsc" } }));
  writeFileSync(path.join(ws, "tsconfig.json"), "{ not json");

  assert.throws(() => readWorkspaceApertures(broken), /did not parse as JSON/);
});

// ---------------------------------------------------------------------------
// THE REAL REPO — the baseline that makes the fixtures above mean something
// ---------------------------------------------------------------------------

test("BASELINE: no workspace in this repo hides a scripts/ directory from typecheck", () => {
  const apertures = readWorkspaceApertures(repoRoot);

  // A population floor: the sighted walk must actually see the workspaces, or the zero below is the
  // blind-loader answer wearing a green hat.
  assert.ok(apertures.length >= 20, `enumerated only ${apertures.length} typechecked workspaces`);
  const withScripts = apertures.filter((a) => a.hasScriptsDir);
  assert.ok(withScripts.length >= 4, `enumerated only ${withScripts.length} workspaces with scripts/`);

  assert.deepEqual(findUncheckedScriptDirs(apertures), []);
});
