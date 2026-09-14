import * as fs from "node:fs/promises";
import * as path from "node:path";

const DIRECTORY_LINK_TYPE: "junction" | "dir" = process.platform === "win32" ? "junction" : "dir";

const WORKSPACE_GROUPS = ["packages", "apps"] as const;

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.lstat(candidate);
    return true;
  } catch {
    return false;
  }
}

async function linkDirectory(target: string, linkPath: string): Promise<void> {
  await fs.symlink(target, linkPath, DIRECTORY_LINK_TYPE);
}

/**
 * Resolves the absolute path a `node_modules` link's target resolves to, then decides whether the
 * replica must retarget it: a link whose fully-resolved target is a direct child of the
 * workspace's `packages/` or `apps/` directory is a workspace-package link and must point at the
 * replica's own copy at the same relative path; every other link keeps pointing at its original,
 * fully-resolved target. Judging by the resolved path (rather than the raw target string) is what
 * keeps this rule the same across platforms that spell an absolute link target differently.
 */
async function resolveReplicaLinkTarget(
  resolvedWorkspaceRoot: string,
  replicaRoot: string,
  linkPath: string,
): Promise<string> {
  const resolvedTarget = await fs.realpath(linkPath);
  const parent = path.dirname(resolvedTarget);
  const packagesRoot = path.join(resolvedWorkspaceRoot, "packages");
  const appsRoot = path.join(resolvedWorkspaceRoot, "apps");
  if (parent === packagesRoot || parent === appsRoot) {
    const relativeToWorkspace = path.relative(resolvedWorkspaceRoot, resolvedTarget);
    return path.join(replicaRoot, relativeToWorkspace);
  }
  return resolvedTarget;
}

/**
 * Rebuilds one `node_modules` directory (or one `@scope` directory one level inside it) as a real
 * directory in the replica: a link becomes a (possibly retargeted) link, an `@scope` directory is
 * expanded one further level, any other real directory is linked whole, and a regular file is
 * copied byte-for-byte.
 */
async function rebuildNodeModulesTree(
  sourceDir: string,
  destDir: string,
  resolvedWorkspaceRoot: string,
  replicaRoot: string,
  expandScopes: boolean,
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await resolveReplicaLinkTarget(resolvedWorkspaceRoot, replicaRoot, sourcePath);
      await linkDirectory(target, destPath);
    } else if (entry.isDirectory()) {
      if (expandScopes && entry.name.startsWith("@")) {
        await rebuildNodeModulesTree(
          sourcePath,
          destPath,
          resolvedWorkspaceRoot,
          replicaRoot,
          false,
        );
      } else {
        await linkDirectory(sourcePath, destPath);
      }
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, destPath);
    }
  }
}

/**
 * Gives a Codex phase replica the workspace's already-installed dependencies by link: the
 * workspace's root `node_modules` is linked whole, and each `packages/*`/`apps/*` project's
 * `node_modules` is rebuilt in the replica so that a workspace-package link resolves to the
 * replica's own copy of that package while every other link still resolves to the workspace's
 * shared store. This runs no package manager and touches no network; removing the replica with
 * `fs.rm(replica, { recursive: true, force: true })` removes only these links, never deleting
 * through them into the workspace.
 */
export async function linkReplicaDependencies(
  workspaceRoot: string,
  replicaRoot: string,
): Promise<void> {
  const resolvedWorkspaceRoot = await fs.realpath(workspaceRoot);

  const rootNodeModules = path.join(resolvedWorkspaceRoot, "node_modules");
  if (await pathExists(rootNodeModules)) {
    await linkDirectory(rootNodeModules, path.join(replicaRoot, "node_modules"));
  }

  for (const group of WORKSPACE_GROUPS) {
    const groupDir = path.join(resolvedWorkspaceRoot, group);
    if (!(await pathExists(groupDir))) continue;
    const projects = await fs.readdir(groupDir, { withFileTypes: true });
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const projectNodeModules = path.join(groupDir, project.name, "node_modules");
      if (!(await pathExists(projectNodeModules))) continue;
      const replicaProjectNodeModules = path.join(
        replicaRoot,
        group,
        project.name,
        "node_modules",
      );
      await rebuildNodeModulesTree(
        projectNodeModules,
        replicaProjectNodeModules,
        resolvedWorkspaceRoot,
        replicaRoot,
        true,
      );
    }
  }
}
