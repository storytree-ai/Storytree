import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { linkReplicaDependencies } from "./codex-replica-links.js";
import type { ReadNodeModulesEntries } from "./codex-replica-links.js";

async function link(target: string, linkPath: string): Promise<void> {
  await fs.mkdir(path.dirname(linkPath), { recursive: true });
  await fs.symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

async function makeDanglingLink(linkPath: string): Promise<void> {
  const target = `${linkPath}-target`;
  await fs.mkdir(target, { recursive: true });
  await link(target, linkPath);
  await fs.rm(target, { recursive: true, force: true });
}

async function entryNames(dir: string): Promise<string[]> {
  return (await fs.readdir(dir)).sort((left, right) => left.localeCompare(right));
}

async function rejectsWithEnoent(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
  });
}

test("dangling-links-are-left-out-of-the-replica: leaves a dangling project node_modules entry out while rebuilding its live link and regular file", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-dangling-"));
  const replica = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-replica-"));
  try {
    const nodeModules = path.join(workspace, "packages", "consumer", "node_modules");
    const liveTarget = path.join(workspace, "store", "live");
    await fs.mkdir(liveTarget, { recursive: true });
    await link(liveTarget, path.join(nodeModules, "live"));
    await makeDanglingLink(path.join(nodeModules, "gone"));
    await fs.writeFile(path.join(nodeModules, "notes.txt"), "kept\n", "utf8");

    await assert.doesNotReject(linkReplicaDependencies(workspace, replica));

    const replicaNodeModules = path.join(replica, "packages", "consumer", "node_modules");
    assert.deepEqual(await entryNames(replicaNodeModules), ["live", "notes.txt"]);
    assert.equal(await fs.realpath(path.join(replicaNodeModules, "live")), await fs.realpath(path.join(nodeModules, "live")));
    assert.equal(await fs.readFile(path.join(replicaNodeModules, "notes.txt"), "utf8"), "kept\n");
  } finally {
    await fs.rm(replica, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("dangling-links-are-left-out-of-the-replica: leaves a dangling @scope entry out while rebuilding the live scoped link", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-dangling-"));
  const replica = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-replica-"));
  try {
    const scope = path.join(workspace, "packages", "consumer", "node_modules", "@fixture");
    const liveTarget = path.join(workspace, "store", "alive");
    await fs.mkdir(liveTarget, { recursive: true });
    await link(liveTarget, path.join(scope, "alive"));
    await makeDanglingLink(path.join(scope, "missing"));

    await assert.doesNotReject(linkReplicaDependencies(workspace, replica));

    const replicaScope = path.join(replica, "packages", "consumer", "node_modules", "@fixture");
    assert.deepEqual(await entryNames(replicaScope), ["alive"]);
    assert.equal((await fs.lstat(replicaScope)).isDirectory(), true);
    assert.equal(await fs.realpath(path.join(replicaScope, "alive")), await fs.realpath(path.join(scope, "alive")));
  } finally {
    await fs.rm(replica, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("dangling-links-are-left-out-of-the-replica: leaves a project node_modules link whose target is missing out", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-dangling-"));
  const replica = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-replica-"));
  try {
    const consumerNodeModules = path.join(workspace, "packages", "consumer", "node_modules");
    const liveTarget = path.join(workspace, "store", "live");
    await fs.mkdir(liveTarget, { recursive: true });
    await link(liveTarget, path.join(consumerNodeModules, "live"));
    await fs.writeFile(path.join(consumerNodeModules, "notes.txt"), "kept\n", "utf8");
    await fs.mkdir(path.join(workspace, "packages", "orphan"), { recursive: true });
    await makeDanglingLink(path.join(workspace, "packages", "orphan", "node_modules"));

    await assert.doesNotReject(linkReplicaDependencies(workspace, replica));

    await rejectsWithEnoent(() => fs.lstat(path.join(replica, "packages", "orphan", "node_modules")));
    assert.deepEqual(await entryNames(path.join(replica, "packages", "consumer", "node_modules")), ["live", "notes.txt"]);
  } finally {
    await fs.rm(replica, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("dangling-links-are-left-out-of-the-replica: leaves a root node_modules link whose target is missing out", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-dangling-"));
  const replica = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-replica-"));
  try {
    await makeDanglingLink(path.join(workspace, "node_modules"));

    await assert.doesNotReject(linkReplicaDependencies(workspace, replica));

    await rejectsWithEnoent(() => fs.lstat(path.join(replica, "node_modules")));
  } finally {
    await fs.rm(replica, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("dangling-links-are-left-out-of-the-replica: still rejects when resolving a link fails for a reason other than a missing target", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-dangling-"));
  const replica = await fs.mkdtemp(path.join(os.tmpdir(), "codex-replica-links-replica-"));
  try {
    await fs.mkdir(path.join(workspace, "packages", "consumer", "node_modules"), { recursive: true });
    // A NUL byte in the name makes `fs.realpath` reject with ERR_INVALID_ARG_VALUE, not ENOENT, under
    // Node and Bun alike. No directory can hold such a name, so the injected reader presents it.
    const readEntries: ReadNodeModulesEntries = async () => [
      {
        name: "bad" + String.fromCharCode(0) + "name",
        isSymbolicLink: () => true,
        isDirectory: () => false,
        isFile: () => false,
      },
    ];

    await assert.rejects(linkReplicaDependencies(workspace, replica, readEntries), { code: "ERR_INVALID_ARG_VALUE" });
  } finally {
    await fs.rm(replica, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
