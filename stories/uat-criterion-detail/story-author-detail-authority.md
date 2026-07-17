---
id: "story-author-detail-authority"
tier: capability
story: uat-criterion-detail
arc: model-uat-promotion
title: "story-author's write fence admits the hierarchy↔detail pair"
outcome: "story-author's write-scope predicate admits stories/** and the detail-kind seed surface together, and fail-closed denies every other Library kind and non-hierarchy path."
status: proposed
proof_mode: integration-test
depends_on: [uat-detail-kind]
decisions: [209, 55, 192]
# Node-borne proof config (ADR-0057 / ADR-0192). NET-NEW pure write-scope predicate in
# packages/uat-criterion. Injecting it into packages/agent's runSpawnStoryAuthor is consumer glue
# after this port is green — no proof source under packages/agent (packages-forward).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/uat-criterion", "test"]
  scope:
    testGlobs: ["packages/uat-criterion/src/story-author-scope.test.ts"]
    sourceGlobs: ["packages/uat-criterion/src/story-author-scope.ts"]
  real:
    testFile: "packages/uat-criterion/src/story-author-scope.test.ts"
    sourceFile: "packages/uat-criterion/src/story-author-scope.ts"
    scope:
      testGlobs: ["packages/uat-criterion/src/story-author-scope.test.ts"]
      sourceGlobs: ["packages/uat-criterion/src/story-author-scope.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/uat-criterion", "typecheck"]
---

# story-author's write fence admits the hierarchy↔detail pair

**Outcome —** story-author's write-scope predicate admits `stories/**` and the detail-kind seed
surface together, and fail-closed denies every other Library kind and non-hierarchy path.

## Guidance

- Author `packages/uat-criterion/src/story-author-scope.ts`: a pure
  `(relPath: string) => boolean` predicate that is the **lawful write fence** for story-author once
  ADR-0209 D5 extends its authority beyond the hierarchy alone.
- **Admit (the pair):**
  - `stories/**` — the existing work-hierarchy surface (preserve today's default).
  - The detail-kind **seed surface** only — settle the exact path convention at build (e.g. a
    dedicated seed file/dir for `uat-criterion` docs, or a narrowly matched path into the seed
    corpus). The predicate must be able to admit a detail-kind write and refuse a neighbouring
    other-kind write on the same corpus file layout.
- **Deny fail-closed (the fence paired with the affordance):**
  - Any other Library kind's seed path (agents, principles, frictions, …).
  - `packages/**`, `apps/**`, ADRs, gate/config, and every path that is neither hierarchy nor
    detail-seed.
  - Live DB / `--pg` is out of band for this predicate (file-tool fence only); do not invent a
    shell path that bypasses it — Bash stays absent from the spawn tool surface (existing agent
    invariant).
- **Consumer glue (NOT this leaf's sourceFiles):** `@storytree/agent`'s `runSpawnStoryAuthor`
  currently hard-defaults to `stories/**` (`packages/agent/src/spawn-story-author.ts`). After this
  predicate is green, agent-side glue injects it as the default `isWriteAllowed`. The
  seed-canonical `story-author` agent artifact (role / tools / workflow prose) is updated to name
  the widened fence and reconciled via `sync-agents` (ADR-0055) — that seed edit is outside this
  package and outside this capability's proof scope.
- Pure predicate + path helpers. No SDK, no PreToolUse hook copy — the hook already consumes an
  injected predicate; this leaf supplies the predicate. Test-author ≠ code-author.

## Contracts (3)

1. **`scope-admits-stories-and-detail-seed`** — the atomic pair is writable
   - **asserts —** a path under `stories/` and a path on the detail-kind seed surface both return
     allowed; the detail-kind constant from `uat-detail-kind` is what identifies the seed surface.
2. **`scope-denies-other-library-kinds`** — the seed-canonical exception stays narrow
   - **asserts —** a seed path for `agent` / `principle` / another non-detail kind returns denied —
     extending ADR-0055's class does not become a blanket Library write grant (ADR-0209 D5 fence).
3. **`scope-denies-packages-and-foreign-paths`** — implementation and unrelated surfaces stay closed
   - **asserts —** `packages/…`, `apps/…`, `docs/decisions/…`, and an unrelated relative path are
     denied fail-closed.
