import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { defaultPnpmAdd, defaultPnpmInstall, runGh } from "./build-worktree.js";

/**
 * Adversarial coverage for the REAL defaults behind the injectable worktree seams. These tests do
 * not replace the subprocess with a recorder: they make the defaults drive tiny, offline fixtures
 * and assert effects that only the requested executable can produce.
 */

async function fixturePackage(root: string, name: string, body = "export const marker = 'linked';\n") {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({ name, version: "1.0.0", type: "module", exports: "./index.js" }, null, 2)}\n`,
  );
  await fs.writeFile(path.join(root, "index.js"), body);
}

test("defaultPnpmInstall runs the real frozen installer and materialises a locked local dependency", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-default-install-"));
  try {
    await fixturePackage(path.join(root, "fixture-dep"), "fixture-install-dep");
    await fs.writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          name: "fixture-install-root",
          version: "1.0.0",
          private: true,
          dependencies: { "fixture-install-dep": "file:./fixture-dep" },
        },
        null,
        2,
      )}\n`,
    );
    await fs.writeFile(
      path.join(root, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '9.0'",
        "settings:",
        "  autoInstallPeers: true",
        "  excludeLinksFromLockfile: false",
        "importers:",
        "  .:",
        "    dependencies:",
        "      fixture-install-dep:",
        "        specifier: file:./fixture-dep",
        "        version: file:fixture-dep",
        "packages:",
        "  fixture-install-dep@file:fixture-dep:",
        "    resolution: {directory: fixture-dep, type: directory}",
        "snapshots:",
        "  fixture-install-dep@file:fixture-dep: {}",
        "",
      ].join("\n"),
    );

    await assert.rejects(fs.access(path.join(root, "node_modules", "fixture-install-dep", "index.js")));
    await defaultPnpmInstall(root);

    assert.equal(
      await fs.readFile(path.join(root, "node_modules", "fixture-install-dep", "index.js"), "utf8"),
      "export const marker = 'linked';\n",
    );
    const lockAfter = await fs.readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
    assert.match(lockAfter, /fixture-install-dep@file:fixture-dep/);

    // The production default promises FROZEN lockfile semantics, not merely "some pnpm install".
    // Make the manifest stale without touching the lock and prove the real command refuses it.
    await fixturePackage(path.join(root, "unlocked-dep"), "fixture-unlocked-dep");
    await fs.writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify(
        {
          name: "fixture-install-root",
          version: "1.0.0",
          private: true,
          dependencies: {
            "fixture-install-dep": "file:./fixture-dep",
            "fixture-unlocked-dep": "file:./unlocked-dep",
          },
        },
        null,
        2,
      )}\n`,
    );
    await assert.rejects(
      defaultPnpmInstall(root),
      /(?:frozen-lockfile|ERR_PNPM_OUTDATED_LOCKFILE|lockfile is broken)/i,
    );
    await assert.rejects(
      fs.access(path.join(root, "node_modules", "fixture-unlocked-dep", "index.js")),
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("defaultPnpmAdd runs the real filtered add and records plus links a local dependency", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-default-add-"));
  try {
    const appRoot = path.join(root, "packages", "app");
    const depRoot = path.join(root, "fixture-dep");
    await fixturePackage(depRoot, "fixture-added-dep", "export const added = true;\n");
    await fs.mkdir(appRoot, { recursive: true });
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    await fs.writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "fixture-workspace", version: "1.0.0", private: true }, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(appRoot, "package.json"),
      `${JSON.stringify({ name: "fixture-add-target", version: "1.0.0", private: true }, null, 2)}\n`,
    );

    const fileSpec = `file:${depRoot.replace(/\\/g, "/")}`;
    await defaultPnpmAdd(root, [{ packageName: "fixture-add-target", deps: [fileSpec] }]);

    const manifest = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    assert.equal(manifest.dependencies?.["fixture-added-dep"], fileSpec);
    assert.equal(
      await fs.readFile(path.join(appRoot, "node_modules", "fixture-added-dep", "index.js"), "utf8"),
      "export const added = true;\n",
    );
    assert.match(await fs.readFile(path.join(root, "pnpm-lock.yaml"), "utf8"), /fixture-added-dep/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("runGh executes the real GitHub CLI in the requested directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-default-gh-"));
  try {
    const output = await runGh(["--version"], root);
    assert.match(output, /^gh version \d+\.\d+\.\d+/m);
    await assert.rejects(
      runGh(["--version"], path.join(root, "missing-cwd")),
      /(?:ENOENT|no such file|cannot find)/i,
      "a nonexistent requested cwd must prevent the subprocess from starting",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
