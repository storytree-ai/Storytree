/**
 * Contract for the STATIC containment layer's rule generator (ADR-0257 D1/D6, increment 2).
 *
 * The generator's output is a security boundary expressed as configuration, so the tests that matter
 * most here are the ones asserting what it must NEVER emit. A deny rule covering
 * `.claude/worktrees` would freeze every session in the fleet at once; a MISSING rule silently
 * leaves part of the lobby writable and nothing anywhere would say so. Both directions are pinned.
 *
 * The last test is deliberately SELF-ARMING: it is inert while `.claude/settings.json` carries no
 * deny block (the state this increment ships in, because static rules cannot be env-gated and the
 * fleet has not been drained yet), and becomes a real conformance gate the moment the flip PR adds
 * one. That way the flip cannot land a hand-edited block that has drifted from the manifest.
 */
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  GATED_TOOLS,
  lobbyDenyRules,
  rulesDenyingWorktrees,
  toPermissionPath,
  type ManifestRootSlice,
} from "./write-authority-rules.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function readManifest(): ManifestRootSlice {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "repo-manifest.json"), "utf8")) as ManifestRootSlice;
}

// ---------------------------------------------------------------------------
// toPermissionPath — the two traps
// ---------------------------------------------------------------------------

test("toPermissionPath emits a DOUBLE leading slash — a single slash anchors at the settings file", () => {
  // The trap: `/c/code/storytree/**` would mean `<project>/c/code/storytree/**`, silently denying
  // nothing at all. Only `//` is an absolute filesystem anchor.
  assert.equal(toPermissionPath("C:\\code\\storytree"), "//c/code/storytree");
  assert.match(toPermissionPath("/home/u/storytree"), /^\/\//);
});

test("toPermissionPath lower-cases the Windows drive letter and normalises separators", () => {
  assert.equal(toPermissionPath("D:\\Repos\\Story"), "//d/Repos/Story");
});

test("toPermissionPath strips a trailing separator so rules never contain a doubled slash", () => {
  assert.equal(toPermissionPath("C:\\code\\storytree\\"), "//c/code/storytree");
});

// ---------------------------------------------------------------------------
// The guard that must never fail
// ---------------------------------------------------------------------------

test("NO generated rule denies `.claude/worktrees` — denying it would freeze the whole fleet", () => {
  const rules = lobbyDenyRules(readManifest(), "C:\\code\\storytree");
  assert.deepEqual(rulesDenyingWorktrees(rules), []);
  // …and the guard itself is not vacuous: it DOES catch an offending rule.
  assert.deepEqual(rulesDenyingWorktrees(["Write(//c/code/storytree/.claude/worktrees/**)"]).length, 1);
});

test("every top-level directory in the manifest is denied, so the lobby cannot rot open", () => {
  const manifest = readManifest();
  const rules = lobbyDenyRules(manifest, "C:\\code\\storytree");
  for (const dir of Object.keys(manifest.root.dirs)) {
    if (dir === ".claude") continue; // expanded child-by-child; covered by its own test below
    assert.ok(
      rules.includes(`Write(//c/code/storytree/${dir}/**)`),
      `manifest dir "${dir}" is not denied — a new top-level directory would be writable in the lobby`,
    );
  }
});

test("`.claude` is expanded child-by-child, denying receipts but never worktrees", () => {
  const rules = lobbyDenyRules(readManifest(), "C:\\code\\storytree");
  assert.ok(rules.includes("Write(//c/code/storytree/.claude/receipts/**)"));
  assert.ok(rules.includes("Write(//c/code/storytree/.claude/agents/**)"));
  assert.ok(rules.includes("Write(//c/code/storytree/.claude/settings.json)"));
  assert.ok(!rules.some((r) => r.includes("/.claude/worktrees")));
});

test("the shared .git common directory is denied — the metadata side door (ADR-0257 D8)", () => {
  const rules = lobbyDenyRules(readManifest(), "C:\\code\\storytree");
  assert.ok(rules.includes("Write(//c/code/storytree/.git/**)"));
});

test("every gated file tool gets its own rule — a deny binds one tool at a time", () => {
  const rules = lobbyDenyRules(readManifest(), "C:\\code\\storytree");
  for (const tool of GATED_TOOLS) {
    assert.ok(rules.some((r) => r.startsWith(`${tool}(`)), `no rule for ${tool}`);
  }
  // Bash is NOT gated by this layer. Pinned so the scope limit stays visible rather than assumed.
  assert.ok(!rules.some((r) => r.startsWith("Bash(")));
});

test("output is sorted and de-duplicated, so regenerating never produces a spurious diff", () => {
  const rules = lobbyDenyRules(readManifest(), "C:\\code\\storytree");
  assert.deepEqual(rules, [...rules].sort());
  assert.equal(new Set(rules).size, rules.length);
});

// ---------------------------------------------------------------------------
// Self-arming conformance (inert until the flip PR adds the block)
// ---------------------------------------------------------------------------

test("if settings.json declares a deny block, it must match the generated rules", () => {
  const settingsPath = path.join(REPO_ROOT, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return;
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as {
    permissions?: { deny?: string[] };
  };
  const declared = settings.permissions?.deny;
  if (declared === undefined || declared.length === 0) {
    // The shipped state of this increment: the wall lands OFF, so no static block yet. Nothing to
    // conform to — this test arms itself when the flip PR adds one.
    return;
  }
  const expected = lobbyDenyRules(readManifest(), REPO_ROOT);
  const missing = expected.filter((r) => !declared.includes(r));
  assert.deepEqual(
    missing,
    [],
    "settings.json's deny block has drifted from repo-manifest.json — regenerate it rather than hand-editing",
  );
  assert.deepEqual(rulesDenyingWorktrees(declared), []);
});
