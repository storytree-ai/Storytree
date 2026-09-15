---
id: "codex-replica-dependency-links"
tier: contract
story: agent
capability: live-codex-leaf
arc: inner-loop-exit-arc
title: "Link a Codex replica to the workspace's installed dependencies, resolving workspace packages into the replica"
outcome: "A Codex phase replica is given the workspace's installed dependencies by link, with workspace-package links pointing into the replica, and removing the replica removes only the links."
status: proposed
proof_mode: contract-test
depends_on: []
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-replica-links.test.ts"]
    sourceGlobs: ["packages/agent/src/codex-replica-links.ts"]
  real:
    testFile: "packages/agent/src/codex-replica-links.test.ts"
    sourceFile: "packages/agent/src/codex-replica-links.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-replica-links.test.ts"]
      sourceGlobs: ["packages/agent/src/codex-replica-links.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
    editsExisting: false
---

# Link a Codex replica to the workspace's installed dependencies, resolving workspace packages into the replica

**Outcome —** A Codex phase replica is given the workspace's installed dependencies by link, with
workspace-package links pointing into the replica, and removing the replica removes only the links.

## Proof walkthrough

Given a synthetic workspace under `os.tmpdir()`, made of real directories and real links with no pnpm
and no network, shaped like an installed pnpm workspace:

- a root `node_modules` holding `.pnpm/dep@1.0.0/node_modules/dep`, a third-party CommonJS package;
- `packages/provider`, a CommonJS workspace package exporting a value;
- `packages/consumer`, whose `node_modules` holds `@fixture/provider` (a link to `packages/provider`),
  `dep` (a link into the root `.pnpm`), a real `.bin` directory holding one file, and one regular file;
- `apps/viewer`, whose `node_modules` holds `dep` (a link into the root `.pnpm`);

and a replica cut from it by `prepareCodexDisposableReplica(workspace, true)`, which copies everything
except `node_modules`:

1. Link the replica to the workspace. Reading the replica with `lstat` and `readlink`, never following
   a link, its root `node_modules` is one link to the workspace's root `node_modules`.
2. The replica's `packages/consumer/node_modules` and `apps/viewer/node_modules` are real directories.
   Their `dep` entries are links; `@fixture` is a real directory whose `provider` entry is a link;
   `.bin` is one link to the workspace's `.bin`; and the regular file is a byte-identical copy.
3. `@fixture/provider` resolves to the replica's `packages/provider`, and every `dep` link resolves to
   the same `.pnpm` directory its workspace original resolves to.
4. Walking the replica without following links, the only regular file under any `node_modules` is the
   copied regular file.
5. Change the value exported by the replica's `packages/provider` only. A `node` child run in the
   replica's `packages/consumer` that `require`s `@fixture/provider` prints the replica's value; the
   same child run in the workspace prints the original.
6. Remove the replica with `fs.rm(replica, { recursive: true, force: true })`. Every link target in the
   workspace still exists, with its content unchanged.

The observable is the replica's filesystem read without following links, what a Node child resolves,
and the workspace after removal.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read this spec in full
at `stories/agent/codex-replica-dependency-links.md`: the `## Proof walkthrough` and every clause of
the assertion under `## Contracts (1)`. The contract-id briefing in the phase prompt is an index, never
the acceptance.

**The adapter is dormant.** Nothing in `packages/orchestrator/src/resolve-prove-spec.ts` passes
feedback commands to the Codex leaf yet, so no build behaviour changes when this lands. Leave that file
alone. `packages/agent/src/sdk-author.ts` is out of scope and must not be edited.
*(Overtaken 2026-09-15: contract `codex-builds-arm-feedback` now passes feedback commands to the
Codex leaf in every build, so the adapter is armed. This contract's own write scope is unchanged.)*

**This contract adds one module and no caller.** `packages/agent/src/codex-replica-links.ts` exports
`linkReplicaDependencies(workspaceRoot, replicaRoot)`: a filesystem operation over two absolute roots
that runs no package manager and touches no network. `codex-author.ts` is outside this contract's
write scope.

- **Which `node_modules` directories.** The workspace root's is linked whole. Under `packages/*` and
  `apps/*`, the two roots `pnpm-workspace.yaml` declares, each project directory that holds a
  `node_modules` gets a rebuilt one.
- **How a project's `node_modules` is rebuilt.** A link becomes a link; an `@scope` directory becomes
  a real directory whose entries are treated the same way, one level deep; any other real directory,
  such as `.bin`, is linked whole; a regular file is copied.
- **Which links are retargeted.** Judge a link by the absolute path its target resolves to, not by how
  the target is spelled: on this Windows box pnpm writes absolute junction targets, and resolving first
  keeps the rule the same wherever a platform spells a target differently. A target that is a direct
  child of the workspace's `packages/` or `apps/` becomes the replica's copy at the same relative path.
  Every other link points where its original points.
- **Link kind.** `fs.symlink(target, linkPath, "junction")` on Windows, which needs an absolute target
  and no privilege; a directory symlink elsewhere.
- **Why removal is expected to be safe — measured, and still asserted.** On Windows 11 on 2026-09-15,
  Node 24.15.0 and Bun 1.4.0 both report a junction as a symbolic link to `lstat` and `readdir`, and
  both remove it with `fs.rm(…, { recursive: true, force: true })` without deleting through it. The
  test asserts it anyway: the measurement is why it should pass, never a reason to skip it.

**Tests.** Build the fixture under `os.tmpdir()` and remove it in `finally`. Cut the replica with
`prepareCodexDisposableReplica(workspace, true)` from `./codex-author.js`, which copies the workspace
without any `node_modules`, exactly as a Codex phase replica is cut. Spawn the resolving child as `node`
by name, as the spine's own proof command does (`NODE_BINARY`), never as `process.execPath`: the
package suite runs this file under Bun, where `process.execPath` is Bun. `packages/agent` is inside the
mutation rung, and CI's Linux run once found a survivor that only Windows had killed, so a test names
every operator-facing string by its LITERAL value, never through an exported constant. Every test title
starts with the contract-line id and a colon —
`test("workspace-package-links-resolve-into-the-replica: …")` — because that prefix is how coverage
binds a test to this contract. Use `node:test` and `node:assert/strict`: the spine's focused proof runs
this file under Node, and `pnpm --filter @storytree/agent test` runs it under Bun, so it must pass under
both.

## Contracts (1)

1. **`workspace-package-links-resolve-into-the-replica`** — the replica borrows installed dependencies by link, and a workspace package resolves to the replica's own copy.
   - **asserts —** after `linkReplicaDependencies(workspaceRoot, replicaRoot)` over a synthetic
     workspace of real directories and real links, the replica's root `node_modules` is one directory
     link to the workspace's; each project `node_modules` under `packages/*` and `apps/*` is rebuilt as
     a real directory whose entries are links, with `@scope` directories rebuilt one level deep, any
     other real directory such as `.bin` linked whole, and a regular file copied; a link whose target is
     a workspace package directory (a direct child of `packages/` or `apps/`) points at the replica's
     copy at the same relative path, while every other link keeps its target; a Node child resolving
     the package from inside the replica reads an edit made only to the replica's copy of the other
     package; no file under a linked target is duplicated into the replica; and
     `fs.rm(replica, { recursive: true, force: true })` leaves every link target in the workspace
     intact.
   - **covers —** `packages/agent/src/codex-replica-links.ts`.
   - **proven by —** a new `packages/agent/src/codex-replica-links.test.ts` through the default focused
     REAL proof, with the `@storytree/agent` typecheck as the pre-promotion wall.
