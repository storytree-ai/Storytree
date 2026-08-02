/**
 * Contract for the STATIC containment layer's rule generator (ADR-0257 D1/D6, increment 2).
 *
 * The generator's output is a security boundary expressed as configuration, so the tests that matter
 * most here are the ones asserting what it must NEVER emit. A deny rule covering
 * `.claude/worktrees` would freeze every session in the fleet at once; a MISSING rule silently
 * leaves part of the lobby writable and nothing anywhere would say so. Both directions are pinned.
 *
 * The last test is SELF-ARMING against the INSTALLED wall: inert on a machine that has none (CI,
 * a fresh checkout), a real conformance gate on one that does. Increment 2 pointed it at the repo's
 * own `.claude/settings.json`; increment 3 established the block cannot live there — the rules are
 * absolute, so a committed block is keyed to one machine and a relative one would deny each worktree
 * its own `packages/**` — and repointed it at `~/.claude/settings.json`, where the wall is actually
 * installed. Its job is unchanged: a block that has drifted from the manifest must not sit unnoticed.
 */
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  GATED_TOOLS,
  installWallSettings,
  lobbyDenyRules,
  locateWorktree,
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

test("`.claude` is expanded child-by-child, never denying worktrees", () => {
  const rules = lobbyDenyRules(readManifest(), "C:\\code\\storytree");
  assert.ok(rules.includes("Write(//c/code/storytree/.claude/agents/**)"));
  // `receipts` was denied until ADR-0284 D4 retired the receipt; nothing writes that directory now.
  assert.ok(!rules.some((r) => r.includes("/.claude/receipts")));
  assert.ok(rules.includes("Write(//c/code/storytree/.claude/settings.json)"));
  assert.ok(!rules.some((r) => r.includes("/.claude/worktrees")));
});

test("the shared .git common directory is denied — the metadata side door (ADR-0257 D8)", () => {
  const rules = lobbyDenyRules(readManifest(), "C:\\code\\storytree");
  assert.ok(rules.includes("Write(//c/code/storytree/.git/**)"));
});

test("the lobby's own node_modules is denied, though the manifest cannot list it", () => {
  // Found by review of the INSTALLED block (2026-08-02): it carried no `node_modules` rule at all,
  // because the manifest is an allow-list over TRACKED paths and `node_modules` is untracked — so
  // nothing generated one and nothing said so. Not tidiness: the lobby's tree is what the primary
  // checkout's gate and hooks run against, and a `node_modules` out of step with the lockfile
  // surfaces as TS2307 / ERR_MODULE_NOT_FOUND in a session that did not cause it.
  const rules = lobbyDenyRules(readManifest(), "C:\\code\\storytree");
  for (const tool of GATED_TOOLS) {
    assert.ok(
      rules.includes(`${tool}(//c/code/storytree/node_modules/**)`),
      `the lobby's node_modules is writable by ${tool}`,
    );
  }
  // …and it must not reach a worktree's own node_modules, which every session depends on.
  assert.deepEqual(rulesDenyingWorktrees(rules), []);
  assert.ok(!rules.some((r) => r.includes("/worktrees/")));
});

test("a manifest `root.files` entry that is really a DIRECTORY is denied as a tree — the `web` hole", () => {
  // Verified against the installed block on 2026-08-02: the only rule for the storytree-web submodule
  // was `Write(//c/code/storytree/web)`, an EXACT path. It matches the literal path `web` and nothing
  // under it, so the whole `web/` tree was file-tool-writable in the primary checkout.
  //
  // The manifest is not wrong to list it under `root.files`: `check-manifest.mjs` classifies by
  // `git ls-files`, which reports a submodule as ONE gitlink entry, so `web` IS a root file to the
  // gate that owns the manifest — moving it to `root.dirs` would make `pnpm check:manifest` block.
  // The generator is what must stop trusting the bucket name.
  const manifest = readManifest();
  assert.ok("web" in manifest.root.files, "`web` left root.files — re-point this regression test");
  const rules = lobbyDenyRules(manifest, "C:\\code\\storytree");
  for (const tool of GATED_TOOLS) {
    assert.ok(
      rules.includes(`${tool}(//c/code/storytree/web/**)`),
      `the web/ submodule tree is writable by ${tool}`,
    );
  }
});

test("every `root.files` entry gets BOTH an exact-path and a tree rule", () => {
  // The general form of the `web` fix. Emitting both — rather than probing the filesystem — is what
  // makes it correct when a submodule is uninitialised, i.e. absent or an empty directory: a probe
  // would answer "file" there and re-open the hole on the next `git submodule update`. The inert half
  // costs nothing, because a real file has no children for `/**` to match.
  const manifest = readManifest();
  const rules = lobbyDenyRules(manifest, "C:\\code\\storytree");
  for (const file of Object.keys(manifest.root.files)) {
    assert.ok(rules.includes(`Write(//c/code/storytree/${file})`), `no exact rule for "${file}"`);
    assert.ok(rules.includes(`Write(//c/code/storytree/${file}/**)`), `no tree rule for "${file}"`);
  }
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
// installWallSettings — the idempotent, self-pruning fold (increment 3)
// ---------------------------------------------------------------------------

const MANIFEST_FIXTURE: ManifestRootSlice = {
  root: { dirs: { packages: "", docs: "", ".claude": "" }, files: { "README.md": "" } },
};

test("installWallSettings preserves every unrelated setting the user holds", () => {
  // It writes to the user's OWN ~/.claude/settings.json, shared with every other project on the
  // machine. Losing their model choice or theme to install a security wall would be its own incident.
  const out = installWallSettings(
    { model: "sonnet", theme: "dark", permissions: { defaultMode: "bypassPermissions" } },
    MANIFEST_FIXTURE,
    "C:\\code\\storytree",
  );
  assert.equal(out["model"], "sonnet");
  assert.equal(out["theme"], "dark");
  assert.equal(out.permissions?.["defaultMode"], "bypassPermissions");
});

test("installWallSettings is IDEMPOTENT — re-running installs no duplicates", () => {
  const once = installWallSettings({}, MANIFEST_FIXTURE, "C:\\code\\storytree");
  const twice = installWallSettings(once, MANIFEST_FIXTURE, "C:\\code\\storytree");
  assert.deepEqual(twice.permissions?.deny, once.permissions?.deny);
  // ADR-0284 D2: the semantic half is retired, so an install registers NO hook at all.
  assert.deepEqual(twice.hooks?.["PreToolUse"], []);
});

test("installWallSettings PRUNES stale rules for this checkout when the manifest shrinks", () => {
  // The reason the block is generated at all: a removed top-level directory must not leave an orphan
  // rule behind, or the installed wall slowly stops matching the repo surface it is derived from.
  const wide = installWallSettings({}, MANIFEST_FIXTURE, "C:\\code\\storytree");
  const narrow = installWallSettings(
    wide,
    { root: { dirs: { packages: "" }, files: {} } },
    "C:\\code\\storytree",
  );
  assert.ok(!(narrow.permissions?.deny ?? []).some((r) => r.includes("/docs/")));
  assert.ok((narrow.permissions?.deny ?? []).some((r) => r.includes("/packages/")));
});

test("installWallSettings keeps deny rules that are NOT this wall's", () => {
  const out = installWallSettings(
    { permissions: { deny: ["Write(//d/other-repo/**)", "Bash(rm:*)"] } },
    MANIFEST_FIXTURE,
    "C:\\code\\storytree",
  );
  assert.ok(out.permissions?.deny?.includes("Write(//d/other-repo/**)"));
  assert.ok(out.permissions?.deny?.includes("Bash(rm:*)"));
});

test("installWallSettings STRIPS a legacy wall registration and keeps every other hook", () => {
  // ADR-0284 D2. A machine that ran a pre-0284 install still carries a registration naming the now
  // DELETED hook script. Leaving it is the worst state available: a `PreToolUse` hook blocks only on
  // exit code 2, so one pointing at a missing script enforces nothing while the settings file reads
  // as though a wall is installed. Unrelated hooks are none of our business and must survive.
  const before = {
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] },
        {
          matcher: "Write|Edit|NotebookEdit",
          hooks: [
            {
              type: "command",
              command:
                "node C:/code/storytree/packages/cli/write-authority-hook.mjs --root C:/code/storytree",
            },
          ],
        },
      ],
    },
  };
  const out = installWallSettings(before, MANIFEST_FIXTURE, "C:\\code\\storytree");
  const entries = out.hooks?.["PreToolUse"] as Array<{ matcher?: string }>;
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.matcher, "Bash");
});

// ---------------------------------------------------------------------------
// Self-arming conformance against the INSTALLED wall
// ---------------------------------------------------------------------------

test("if this machine has the wall installed, its deny block must match the generated rules", () => {
  // Increment 2 pointed this at `<repo>/.claude/settings.json` and it never armed, because the flip
  // proved the block CANNOT live there: the rules are absolute, and a committed absolute block is
  // keyed to one machine — it would fail in every worktree and in CI, and a relative one would
  // anchor at each worktree's own root and deny every session its own `packages/**`. So the wall is
  // installed user-level, and this is where the drift gate has to look.
  //
  // Local-only by construction: CI has no installed wall, so it skips. That is a real limit and is
  // stated rather than papered over — the gate against a stale block is the machine that runs it.
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return;
  let settings: { permissions?: { deny?: string[] } };
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as typeof settings;
  } catch {
    return; // the user's file, not ours to adjudicate
  }
  const declared = settings.permissions?.deny;
  if (declared === undefined || declared.length === 0) return; // wall not installed here

  // The checkout THIS test is running in — the primary when run from the lobby, its parent when run
  // from a worktree. A block installed for a different checkout is not ours to check.
  const located = locateWorktree(REPO_ROOT);
  const primaryRoot = located !== null ? located.primaryRoot : REPO_ROOT;
  const base = toPermissionPath(primaryRoot);
  if (!declared.some((r) => r.includes(base))) return;

  const missing = lobbyDenyRules(readManifest(), primaryRoot).filter((r) => !declared.includes(r));
  assert.deepEqual(
    missing,
    [],
    "the installed deny block has drifted from repo-manifest.json — regenerate it with " +
      "`storytree write-authority install --write` rather than hand-editing",
  );
  assert.deepEqual(rulesDenyingWorktrees(declared), []);
});
