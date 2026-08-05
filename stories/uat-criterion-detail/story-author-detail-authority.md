---
id: "story-author-detail-authority"
tier: capability
story: uat-criterion-detail
arc: model-uat-promotion
title: "story-author's write fence admits the hierarchy half of the pair"
outcome: "story-author's write-scope predicate admits stories/** and fail-closed denies every other path — the retired detail seed surface, every other Library kind's seed path, and every non-hierarchy path alike."
status: proposed
proof_mode: integration-test
depends_on: [uat-detail-kind]
decisions: [209, 307, 192]
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

# story-author's write fence admits the hierarchy half of the pair

**Outcome —** story-author's write-scope predicate admits `stories/**` and fail-closed denies every
other path — the retired detail seed surface, every other Library kind's seed path, and every
non-hierarchy path alike.

**Read this capability's scope precisely (ADR-0307 D5).** It was authored to WIDEN the fence, on the
premise that a detail body was a committed file and so had to be reachable by the same file tools
that write `stories/**`. ADR-0307 D5 withdrew the seed-canonical posture, so a detail body is now a
live-store write. **story-author did NOT lose authority over details** — it still owns the
hierarchy↔detail pair and still authors it atomically (ADR-0209 D5, untouched). What changed is the
MEDIUM of the second half, and therefore which fence governs it: the hierarchy half is a file write
inside this predicate, the detail half is a `--pg` Library write governed by the library-edit
ceremony. The capability survives because the predicate still has to exist and still has to be
fail-closed; its outcome simply resolves to one admitted root instead of two.

## Guidance

- Author `packages/uat-criterion/src/story-author-scope.ts`: a pure
  `(relPath: string) => boolean` predicate that is the **lawful write fence** for story-author's
  file-tool surface.
- **Admit — exactly one root:**
  - `stories/**` — the work-hierarchy surface, and nothing else.
- **Deny fail-closed (the fence paired with the affordance):**
  - This kind's own retired detail seed path. It is not special-cased back in: the directory is
    gone, and a predicate that still admitted it would re-open a write surface the decision closed.
  - Any other Library kind's seed path (agents, principles, frictions, …).
  - `packages/**`, `apps/**`, ADRs, gate/config, and every path that is not the hierarchy.
  - Live DB / `--pg` is out of band for this predicate (file-tool fence only); do not invent a
    shell path that bypasses it — Bash stays absent from the spawn tool surface (existing agent
    invariant). Note this is what makes the pair coherent rather than broken: the detail half is
    authored through the Library write ceremony, which has its own validation and audit trail, not
    by smuggling a file write past this predicate.
- **Consumer glue (NOT this leaf's sourceFiles):** `@storytree/agent`'s `runSpawnStoryAuthor`
  hard-defaults to `stories/**` (`packages/agent/src/spawn-story-author.ts`). After this predicate
  is green, agent-side glue injects it as the default `isWriteAllowed`. Post-0307 the two agree on
  the same single root, so the injection is about single-ownership of the definition, not about
  widening. The `story-author` agent artifact's prose is a **live** Library edit
  (`library artifact edit story-author --pg`) plus `pnpm build:guidance && pnpm build:agents` —
  there is no seed edit and no `sync-agents`, both deleted by ADR-0307 D3.
- Pure predicate + path helpers. No SDK, no PreToolUse hook copy — the hook already consumes an
  injected predicate; this leaf supplies the predicate. Test-author ≠ code-author.

## Contracts (3)

1. **`scope-admits-the-hierarchy`** — the hierarchy half of the pair is writable
   - **asserts —** a path under `stories/` returns allowed, for both a `story.md` and a capability
     file, so story-author can author a story and its capabilities in one pass.
2. **`scope-denies-every-library-seed-path`** — no corpus file is writable, this kind's included
   - **asserts —** the retired `uat-criterion` detail seed path returns denied, as does a seed path
     for `agent` / `principle` / any other kind. Post-ADR-0307 D5 there is no seed-authored
     exception left to admit, so this is a blanket denial rather than a narrow carve-out.
3. **`scope-denies-packages-and-foreign-paths`** — implementation and unrelated surfaces stay closed
   - **asserts —** `packages/…`, `apps/…`, `docs/decisions/…`, and an unrelated relative path are
     denied fail-closed.
