---
id: "codex-replica-links-survive-a-dangling-link"
tier: contract
story: agent
capability: live-codex-leaf
arc: inner-loop-exit-arc
title: "Leave a dangling node_modules link out of a Codex replica instead of failing the phase"
outcome: "Linking a Codex replica to the workspace's installed dependencies leaves out any link whose target does not exist and rebuilds everything else as before, so one dangling link no longer fails an armed phase closed at setup."
status: proposed
proof_mode: contract-test
depends_on: [codex-replica-dependency-links]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-replica-links-dangling.test.ts"]
    sourceGlobs: ["packages/agent/src/codex-replica-links.ts"]
  real:
    testFile: "packages/agent/src/codex-replica-links-dangling.test.ts"
    sourceFile: "packages/agent/src/codex-replica-links.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-replica-links-dangling.test.ts"]
      sourceGlobs: ["packages/agent/src/codex-replica-links.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--timeout"
        - "300000"
        - "./packages/agent/src/codex-replica-links-dangling.test.ts"
        - "./packages/agent/src/codex-replica-links.test.ts"
        - "./packages/agent/src/codex-author-feedback.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Leave a dangling node_modules link out of a Codex replica instead of failing the phase

**Outcome —** Linking a Codex replica to the workspace's installed dependencies leaves out any link
whose target does not exist and rebuilds everything else as before, so one dangling link no longer
fails an armed phase closed at setup.

## Proof walkthrough

Given a synthetic workspace under `os.tmpdir()`, built from real directories and real links exactly as
`packages/agent/src/codex-replica-links.test.ts` builds its fixture (a junction on Windows, a directory
symlink elsewhere), and an empty replica directory beside it.

A DANGLING link is made in three moves: create its target directory, link to it, then remove the
target with `fs.rm(target, { recursive: true, force: true })`. That leaves the link dangling on every
platform, whether or not creating a link checks that its target exists.

1. **A dangling entry inside a project's `node_modules`.** The workspace's
   `packages/consumer/node_modules` holds `live` (a link to an existing directory), `gone` (a dangling
   link) and `notes.txt` (a regular file). `linkReplicaDependencies(workspace, replica)` resolves,
   asserted with `assert.doesNotReject`. The replica's `packages/consumer/node_modules` then holds
   exactly `live` and `notes.txt`: its sorted entry names deep-equal `["live", "notes.txt"]`. `live` is
   a link whose `fs.realpath` equals its workspace original's, and `notes.txt` is a byte-identical copy.
2. **A dangling entry inside an `@scope` directory.** The same `node_modules` also holds a real
   `@fixture` directory containing `alive` (a link to an existing directory) and `missing` (a dangling
   link). Linking resolves, and the replica's `@fixture` is a real directory whose entry names deep-equal
   `["alive"]`.
3. **A project whose `node_modules` is itself a dangling link.** Beside `packages/consumer` as in step
   1, `packages/orphan/node_modules` is a dangling link. Linking resolves; `fs.lstat` of the replica's
   `packages/orphan/node_modules` rejects with code `ENOENT`, and the replica's
   `packages/consumer/node_modules` holds exactly `live` and `notes.txt`.
4. **A root `node_modules` that is a dangling link.** The workspace root's `node_modules` is a dangling
   link. Linking resolves, and `fs.lstat` of the replica's root `node_modules` rejects with code
   `ENOENT`.
5. **Nothing else changes.** The declared proof also runs `codex-replica-links.test.ts` and
   `codex-author-feedback.test.ts` unmodified, so every existing linking rule and the armed author's
   setup still hold.

The observable is the replica's filesystem, read with `lstat`, `readdir` and `realpath`.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Why this exists.** It is a gap `inner-loop-exit-arc-inc-03` declared when it landed the dormant
adapter. `resolveReplicaLinkTarget` calls `fs.realpath` on every link it rebuilds, and the rebuild reads
directories through links. A link whose target is gone rejects with `ENOENT`, and `CodexPhaseAuthor`
then fails the whole phase at setup (`Codex phase setup failed: …`) before Codex starts. Now that builds
arm every Codex phase, one stale link in a worktree would fail every Codex phase of that build. A
dangling link resolves nothing in the worktree either, so leaving it out of the replica changes nothing
a proof run inside the replica could resolve.

**The rule, in `packages/agent/src/codex-replica-links.ts`.**
- A link whose target does not exist is left out of the replica, wherever the rebuild meets it: as an
  entry of a project's `node_modules`, as an entry of an `@scope` directory, as a project's
  `node_modules` itself, or as the root `node_modules`.
- Everything else is rebuilt exactly as contract `codex-replica-dependency-links` specifies.
- Decide "does not exist" by FOLLOWING the link — `fs.stat` or `fs.realpath` rejecting with code
  `ENOENT` — never with `lstat`, which describes the link itself and so always succeeds.
- Any other error still rejects, so a phase still fails closed on a filesystem it cannot read.

**Out of scope.** `codex-author.ts`, `codex-feedback-endpoint.ts`, `sdk-author.ts` and every other
package are unchanged. The other declared gap, that an exception from `openCodexFeedbackEndpoint` leaves
the replica behind, stays open.

**The red must be an assertion.** This contract edits a file that already exists. Import only
`linkReplicaDependencies`, which exists today. At HEAD it rejects with `ENOENT` on step 1's fixture, so
wrap every call in `assert.doesNotReject` and never let the rejection escape the assertion.

**Tests.** Use `node:test` and `node:assert/strict`. The file must pass under Node and under Bun: the
package suite and the declared proof both run Bun. Every test title starts with the contract-line id and
a colon — `test("dangling-links-are-left-out-of-the-replica: …")` — because that prefix is how coverage
binds a test to this contract. Build every fixture under `os.tmpdir()` and remove it in `finally`.
`packages/agent` is inside the mutation rung, so each step above is its own case and every expected
name is written as its LITERAL string. The new file is already owned by the `packages/agent/src/codex-*.ts`
entry in `repo-manifest/source-ownership/live-codex-leaf.json`.

**Declared, not observed.** That an error other than a missing target still rejects is confirmed by
reading: no portable fixture produces a permission error on both platforms.

## Contracts (1)

1. **`dangling-links-are-left-out-of-the-replica`** — a dangling link among the workspace's installed dependencies is left out of a Codex replica instead of failing the phase.
   - **asserts —** `linkReplicaDependencies` resolves when the workspace holds a link whose target does not exist, whether that link is an entry of a project `node_modules`, an entry of an `@scope` directory, a project's `node_modules` itself or the root `node_modules`. The replica holds no entry for such a link, and every other entry is rebuilt as before: a live link resolving to its original's target, a scope directory holding its live entries, and a regular file copied byte for byte.
   - **covers —** `packages/agent/src/codex-replica-links.ts` (`linkReplicaDependencies`).
   - **proven by —** a new `packages/agent/src/codex-replica-links-dangling.test.ts` through the declared Bun proof, with `codex-replica-links.test.ts` and `codex-author-feedback.test.ts` as its regression wall and the `@storytree/agent` typecheck as the pre-promotion wall.
