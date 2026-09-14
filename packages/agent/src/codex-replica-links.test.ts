import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { prepareCodexDisposableReplica } from "./codex-author.js";
import { linkReplicaDependencies } from "./codex-replica-links.js";
import type { NodeModulesEntry, ReadNodeModulesEntries } from "./codex-replica-links.js";

/**
 * Creates a directory (junction on Windows, plain symlink elsewhere) so the fixture matches what
 * pnpm actually writes on disk — an absolute-target link to a real directory.
 */
async function link(target: string, linkPath: string): Promise<void> {
  await fs.symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

/**
 * Walks a tree with `lstat` semantics only (never follows a link) and returns every REGULAR file
 * found anywhere under a directory literally named `node_modules`. Used to prove nothing under a
 * linked target was duplicated into the replica.
 */
async function collectFilesUnderNodeModules(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string, insideNodeModules: boolean): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      const insideHere = insideNodeModules || entry.name === "node_modules";
      if (entry.isDirectory()) {
        await walk(full, insideHere);
      } else if (entry.isFile() && insideHere) {
        results.push(full);
      }
    }
  }
  await walk(root, false);
  return results;
}

test("workspace-package-links-resolve-into-the-replica: links a Codex replica to the workspace's installed dependencies, resolving a workspace package into the replica's own copy", async () => {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-replica-links-workspace-"),
  );
  let replicaDir: string | undefined;
  try {
    // --- Build a synthetic, already-"installed" pnpm workspace: real directories, real links,
    // no pnpm and no network. ---

    // A root node_modules holding a third-party CommonJS package under `.pnpm`, and the ordinary
    // top-level `dep` link pnpm writes pointing into it.
    const pnpmDepDir = path.join(
      workspace,
      "node_modules",
      ".pnpm",
      "dep@1.0.0",
      "node_modules",
      "dep",
    );
    await writeText(
      path.join(pnpmDepDir, "package.json"),
      JSON.stringify({ name: "dep", version: "1.0.0", main: "index.js" }),
    );
    await writeText(path.join(pnpmDepDir, "index.js"), 'module.exports = "dep-original";\n');
    await link(pnpmDepDir, path.join(workspace, "node_modules", "dep"));

    // A workspace package, `packages/provider`, exporting a value a consumer can require.
    const providerDir = path.join(workspace, "packages", "provider");
    await writeText(
      path.join(providerDir, "package.json"),
      JSON.stringify({ name: "@fixture/provider", main: "index.js" }),
    );
    await writeText(path.join(providerDir, "index.js"), 'module.exports = "original-value";\n');

    // A second workspace package, `packages/consumer`, whose node_modules holds: a link to the
    // provider package, a link to the third-party dep, a real `.bin` directory with one file, and
    // one regular file.
    const consumerDir = path.join(workspace, "packages", "consumer");
    await writeText(
      path.join(consumerDir, "package.json"),
      JSON.stringify({ name: "@fixture/consumer", main: "index.js" }),
    );
    const consumerNodeModules = path.join(consumerDir, "node_modules");
    await fs.mkdir(path.join(consumerNodeModules, "@fixture"), { recursive: true });
    await link(providerDir, path.join(consumerNodeModules, "@fixture", "provider"));
    await link(pnpmDepDir, path.join(consumerNodeModules, "dep"));
    await fs.mkdir(path.join(consumerNodeModules, ".bin"), { recursive: true });
    await writeText(
      path.join(consumerNodeModules, ".bin", "somebin.js"),
      "#!/usr/bin/env node\n",
    );
    await writeText(path.join(consumerNodeModules, ".modules.yaml"), "hoistPattern: []\n");

    // `apps/viewer`, whose node_modules holds only the third-party dep link.
    const viewerDir = path.join(workspace, "apps", "viewer");
    await writeText(
      path.join(viewerDir, "package.json"),
      JSON.stringify({ name: "@fixture/viewer", private: true }),
    );
    const viewerNodeModules = path.join(viewerDir, "node_modules");
    await fs.mkdir(viewerNodeModules, { recursive: true });
    await link(pnpmDepDir, path.join(viewerNodeModules, "dep"));

    // Cut a replica exactly as a real Codex phase does: copies everything except node_modules.
    const replica = await prepareCodexDisposableReplica(workspace, true);
    replicaDir = replica.dir;
    await assert.rejects(fs.stat(path.join(replicaDir, "node_modules")));

    await linkReplicaDependencies(workspace, replicaDir);

    // --- 1. The replica's root node_modules is one link to the workspace's. ---
    const replicaRootNodeModules = path.join(replicaDir, "node_modules");
    const rootStat = await fs.lstat(replicaRootNodeModules);
    assert.equal(rootStat.isSymbolicLink(), true);
    assert.equal(
      await fs.realpath(replicaRootNodeModules),
      await fs.realpath(path.join(workspace, "node_modules")),
    );

    // --- 2. The two project node_modules are rebuilt as real directories, one level deep. ---
    const replicaConsumerNodeModules = path.join(
      replicaDir,
      "packages",
      "consumer",
      "node_modules",
    );
    const replicaViewerNodeModules = path.join(replicaDir, "apps", "viewer", "node_modules");

    for (const dir of [replicaConsumerNodeModules, replicaViewerNodeModules]) {
      const dirStat = await fs.lstat(dir);
      assert.equal(dirStat.isSymbolicLink(), false, `${dir} must be a real directory`);
      assert.equal(dirStat.isDirectory(), true, `${dir} must be a real directory`);
    }

    // dep entries are links.
    const replicaConsumerDep = path.join(replicaConsumerNodeModules, "dep");
    const replicaViewerDep = path.join(replicaViewerNodeModules, "dep");
    assert.equal((await fs.lstat(replicaConsumerDep)).isSymbolicLink(), true);
    assert.equal((await fs.lstat(replicaViewerDep)).isSymbolicLink(), true);

    // `@fixture` is a real directory whose `provider` entry is a link.
    const replicaFixtureScope = path.join(replicaConsumerNodeModules, "@fixture");
    const scopeStat = await fs.lstat(replicaFixtureScope);
    assert.equal(scopeStat.isSymbolicLink(), false);
    assert.equal(scopeStat.isDirectory(), true);
    const replicaProviderLink = path.join(replicaFixtureScope, "provider");
    assert.equal((await fs.lstat(replicaProviderLink)).isSymbolicLink(), true);

    // `.bin` is one link to the workspace's `.bin`.
    const replicaBin = path.join(replicaConsumerNodeModules, ".bin");
    assert.equal((await fs.lstat(replicaBin)).isSymbolicLink(), true);
    assert.equal(
      await fs.realpath(replicaBin),
      await fs.realpath(path.join(consumerNodeModules, ".bin")),
    );
    assert.equal(
      await fs.readFile(path.join(replicaBin, "somebin.js"), "utf8"),
      "#!/usr/bin/env node\n",
    );

    // The regular file is a byte-identical copy, not a link.
    const replicaModulesYaml = path.join(replicaConsumerNodeModules, ".modules.yaml");
    assert.equal((await fs.lstat(replicaModulesYaml)).isSymbolicLink(), false);
    assert.equal(await fs.readFile(replicaModulesYaml, "utf8"), "hoistPattern: []\n");

    // --- 3. Resolution: the workspace-package link points at the replica's own copy; every
    // dep link still resolves to the same `.pnpm` directory its workspace original resolves to. ---
    const replicaProviderDir = path.join(replicaDir, "packages", "provider");
    assert.equal(
      await fs.realpath(replicaProviderLink),
      await fs.realpath(replicaProviderDir),
    );

    const workspaceConsumerDepTarget = await fs.realpath(path.join(consumerNodeModules, "dep"));
    const workspaceViewerDepTarget = await fs.realpath(path.join(viewerNodeModules, "dep"));
    assert.equal(await fs.realpath(replicaConsumerDep), workspaceConsumerDepTarget);
    assert.equal(await fs.realpath(replicaViewerDep), workspaceViewerDepTarget);

    // --- 4. Walking the replica without following links, the only regular file under any
    // node_modules is the copied regular file. ---
    const filesUnderNodeModules = await collectFilesUnderNodeModules(replicaDir);
    assert.deepEqual(filesUnderNodeModules, [replicaModulesYaml]);

    // --- 5. Editing the replica's own copy of the provider is what a Node child sees from the
    // replica; the workspace's copy, and a child run there, are untouched. ---
    await writeText(path.join(replicaProviderDir, "index.js"), 'module.exports = "replica-value";\n');

    const replicaOutput = execFileSync(
      "node",
      ["-e", "console.log(require('@fixture/provider'))"],
      { cwd: path.join(replicaDir, "packages", "consumer"), encoding: "utf8" },
    ).trim();
    assert.equal(replicaOutput, "replica-value");

    const workspaceOutput = execFileSync(
      "node",
      ["-e", "console.log(require('@fixture/provider'))"],
      { cwd: consumerDir, encoding: "utf8" },
    ).trim();
    assert.equal(workspaceOutput, "original-value");

    // --- 6. Removing the replica leaves every link target in the workspace intact. ---
    await fs.rm(replicaDir, { recursive: true, force: true });
    replicaDir = undefined;

    assert.equal(
      await fs.readFile(path.join(pnpmDepDir, "index.js"), "utf8"),
      'module.exports = "dep-original";\n',
    );
    assert.equal(
      await fs.readFile(path.join(providerDir, "index.js"), "utf8"),
      'module.exports = "original-value";\n',
    );
    assert.equal(
      await fs.readFile(path.join(consumerNodeModules, ".modules.yaml"), "utf8"),
      "hoistPattern: []\n",
    );
    assert.equal(
      await fs.readFile(path.join(consumerNodeModules, ".bin", "somebin.js"), "utf8"),
      "#!/usr/bin/env node\n",
    );
  } finally {
    if (replicaDir !== undefined) {
      await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
    }
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("workspace-package-links-resolve-into-the-replica: a link into apps/ resolves into the replica too, a link to any other directory inside or outside the workspace keeps its target, an @-directory inside a scope is linked whole, and a workspace with no root node_modules gives the replica none", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-workspace-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-outside-"));
  let replicaDir: string | undefined;
  try {
    // `apps/viewer`, a workspace package under the second workspace root.
    const viewerDir = path.join(workspace, "apps", "viewer");
    await writeText(
      path.join(viewerDir, "package.json"),
      JSON.stringify({ name: "@fixture/viewer", main: "index.js" }),
    );
    await writeText(path.join(viewerDir, "index.js"), 'module.exports = "viewer-original";\n');
    // `tools/helper`, a workspace directory that is not a workspace package.
    const helperDir = path.join(workspace, "tools", "helper");
    await writeText(path.join(helperDir, "index.js"), 'module.exports = "helper";\n');
    // A directory outside the workspace altogether.
    await writeText(path.join(outside, "index.js"), 'module.exports = "outside";\n');

    // `packages/consumer`, whose node_modules links to all three and holds an `@`-named real directory
    // inside its `@fixture` scope. There is no root node_modules.
    const consumerDir = path.join(workspace, "packages", "consumer");
    await writeText(
      path.join(consumerDir, "package.json"),
      JSON.stringify({ name: "@fixture/consumer", main: "index.js" }),
    );
    const consumerNodeModules = path.join(consumerDir, "node_modules");
    await fs.mkdir(path.join(consumerNodeModules, "@fixture"), { recursive: true });
    await link(viewerDir, path.join(consumerNodeModules, "@fixture", "viewer"));
    await link(helperDir, path.join(consumerNodeModules, "helper"));
    await link(outside, path.join(consumerNodeModules, "outside"));
    const nestedDir = path.join(consumerNodeModules, "@fixture", "@nested");
    await writeText(path.join(nestedDir, "index.js"), 'module.exports = "nested";\n');

    const replica = await prepareCodexDisposableReplica(workspace, true);
    replicaDir = replica.dir;
    await linkReplicaDependencies(workspace, replicaDir);

    const replicaConsumerNodeModules = path.join(replicaDir, "packages", "consumer", "node_modules");
    assert.equal(
      await fs.realpath(path.join(replicaConsumerNodeModules, "@fixture", "viewer")),
      await fs.realpath(path.join(replicaDir, "apps", "viewer")),
      "a link to a package under apps/ points at the replica's own copy",
    );
    assert.equal(
      await fs.realpath(path.join(replicaConsumerNodeModules, "helper")),
      await fs.realpath(helperDir),
      "a link to a workspace directory that is not a package keeps its target",
    );
    assert.equal(
      await fs.realpath(path.join(replicaConsumerNodeModules, "outside")),
      await fs.realpath(outside),
      "a link to a directory outside the workspace keeps its target",
    );
    const replicaNested = path.join(replicaConsumerNodeModules, "@fixture", "@nested");
    assert.equal(
      (await fs.lstat(replicaNested)).isSymbolicLink(),
      true,
      "an @-directory inside a scope is linked whole, not expanded a second level",
    );
    assert.equal(await fs.realpath(replicaNested), await fs.realpath(nestedDir));
    await assert.rejects(
      fs.lstat(path.join(replicaDir, "node_modules")),
      "a workspace with no root node_modules gives the replica none",
    );
  } finally {
    if (replicaDir !== undefined) {
      await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
    }
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(outside, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("workspace-package-links-resolve-into-the-replica: a replica holding none of the workspace's project directories still gets each project's node_modules rebuilt, and a link sitting in packages/ is not taken for a project", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-workspace-"));
  const replicaDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-empty-replica-"));
  try {
    const soloDir = path.join(workspace, "packages", "solo");
    await writeText(path.join(soloDir, "package.json"), JSON.stringify({ name: "@fixture/solo" }));
    await writeText(path.join(soloDir, "node_modules", ".modules.yaml"), "hoistPattern: []\n");
    // A directory holding a node_modules, reachable from packages/ only through a link.
    const elsewhere = path.join(workspace, "elsewhere", "project");
    await writeText(path.join(elsewhere, "node_modules", "marker.txt"), "not a workspace project\n");
    await link(elsewhere, path.join(workspace, "packages", "linked"));

    await linkReplicaDependencies(workspace, replicaDir);

    const replicaSoloNodeModules = path.join(replicaDir, "packages", "solo", "node_modules");
    const soloStat = await fs.lstat(replicaSoloNodeModules);
    assert.equal(soloStat.isSymbolicLink(), false);
    assert.equal(
      soloStat.isDirectory(),
      true,
      "the project's node_modules is rebuilt although the replica held no packages/solo",
    );
    assert.equal(
      await fs.readFile(path.join(replicaSoloNodeModules, ".modules.yaml"), "utf8"),
      "hoistPattern: []\n",
    );
    await assert.rejects(
      fs.lstat(path.join(replicaDir, "packages", "linked")),
      "a link in packages/ gets no rebuilt node_modules",
    );
  } finally {
    await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("workspace-package-links-resolve-into-the-replica: an entry that is none of a link, a directory or a regular file — a FIFO or a socket, which a Windows filesystem cannot hold — is left out of the rebuilt node_modules", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-workspace-"));
  const replicaDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-empty-replica-"));
  try {
    const soloDir = path.join(workspace, "packages", "solo");
    await writeText(path.join(soloDir, "package.json"), JSON.stringify({ name: "@fixture/solo" }));
    await writeText(path.join(soloDir, "node_modules", ".modules.yaml"), "hoistPattern: []\n");

    // The listing a real node_modules holding a socket would give, presented through the reader seam.
    const socketEntry: NodeModulesEntry = {
      name: "ipc.sock",
      isSymbolicLink: () => false,
      isDirectory: () => false,
      isFile: () => false,
    };
    const readEntries: ReadNodeModulesEntries = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return path.basename(dir) === "node_modules" ? [...entries, socketEntry] : entries;
    };

    await linkReplicaDependencies(workspace, replicaDir, readEntries);

    const replicaSoloNodeModules = path.join(replicaDir, "packages", "solo", "node_modules");
    assert.equal(
      await fs.readFile(path.join(replicaSoloNodeModules, ".modules.yaml"), "utf8"),
      "hoistPattern: []\n",
      "the regular file beside it is still copied",
    );
    await assert.rejects(
      fs.lstat(path.join(replicaSoloNodeModules, "ipc.sock")),
      "the entry that is neither link, directory nor file is left out",
    );
  } finally {
    await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
});
