---
status: accepted
decided: 2026-06-27
amends: [74]
load_bearing: true
---
# ADR-0115: Detect declared-edge drift: derive virtual-story edges from sourceFile and report cross-story edges with no code backing

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Extends the organism boundary gate
(ADR-0074, as widened by ADR-0100) with a NON-blocking drift report; relates to ADR-0112 (the refactor
whose drift motivated it), ADR-0010 §3/§4 (the two-altitude dependency model), and ADR-0086 (the
load-bearing / curation discipline the report feeds).

## Context

The cross-story edge system has a **determinism spectrum**, and only part of it self-heals.

- **Code-derived, self-healing.** A real `@storytree/*` import is re-derived from source every gate run
  by the import scan (`packages/cli/src/check-boundaries.ts` → `boundaries.ts`, ADR-0074). The gate
  asserts the real cross-organism CODE graph is a subgraph of the declared cross-story graph. When code
  moves, the *code* side of this comparison moves with it — it cannot drift, because it IS the code.
- **Declared-and-enforced.** A hand-authored `depends_on` / `consumed_by` in `stories/<x>/story.md` is
  checked against the code graph **only for edges whose importing package maps to a story** (via
  `repo-manifest.json` `packageOwnership`). For a story that OWNS a package, a stale declaration is
  caught: drop a real import and the gate goes red until the declaration follows.
- **Declared-but-UNENFORCEABLE — the escape hatch.** Three edge kinds carry no import the scan can see,
  so their declarations can drift with **zero gate signal**:
  1. **Virtual-story edges.** A story that owns no package (e.g. `headless-orchestrator`, whose code is
     physically hosted in `packages/agent` + `packages/drive`, owned by OTHER stories) has its
     `depends_on` checked ONLY for acyclicity and rendered in the forest — never as a coverage
     requirement, because no package maps back to it. Its edges are pure hand-prose.
  2. **IoC-injected seams.** A collaborator passed in as a parameter (a closure / runner) is bound at
     runtime, so the consumer's source names no provider. `packages/cli/src/commands.ts` injects its own
     `run()` into `packages/drive`'s `orchestrate()` as `runner: (toolArgv) => run(...)`; `drive` never
     imports `cli`. The coupling's *shape* is typed (`OrientationRunner`); its *identity* is, by design,
     statically undecidable (a test injects a scripted double instead).
  3. **Build-artifact / subprocess consumption.** A surface that consumes another's compiled output, or
     shells out to it, has no import specifier (ADR-0100/0111 bless these as declared-for-honesty edges).

**The drift this fixes.** ADR-0112 moved the orchestrator composition out of `packages/cli` into
`packages/drive` (HARD INVARIANT: `drive` imports nothing from `cli`; the dependency runs `cli → drive`,
never back). The code moved; the hand-authored `headless-orchestrator` `depends_on` did not — it kept
declaring `cli` until a human noticed and hand-corrected it to `drive-machinery` (commit `57f4be8`,
2026-06-27), because nothing re-derives a virtual story's edges. The edge was **stale AND backwards**:
`headless-orchestrator`'s real code (`packages/drive/src/orchestrate.ts`) value-imports `agent` and
`library` at runtime (and a type-only `storage-protocol`) — never `cli`; and the only `cli` coupling
that ever justified the edge is an *injected* `run()` that flows the opposite way (`cli → drive`). A
report deriving the virtual story's edges from its `sourceFile` would have flagged it the moment
ADR-0112 landed, instead of leaving it for a dedicated investigation months of commits later. (The
surviving `drive-machinery` and `notice-board` declarations are now host / injected-runner honesty
edges — legitimate, but still import-unbacked, so exactly the rows the report must classify rather than
block.)

**This is not a one-off — it is systemic, and is being patched by hand, one human-noticed instance at a
time.** The `headless-orchestrator → cli` drift was found by a dedicated investigation and hand-fixed in
commit `57f4be8` (2026-06-27), which in the same pass also dropped the stale "lone `studio → cli` edge"
narrative from `stories/cli/story.md` (ADR-0112 §3 had already removed studio's `cli` dependency).
Earlier, ADR-0112 itself had to MANUALLY correct a *different* code-unbacked edge — its "one boundary
correction" drops an unbacked `notice-board → drive-machinery` declaration. That is three hand-corrections
across two changes within two days, every one found by a human noticing, none by a tool. The set
difference that would surface them automatically is already computed inside `boundaries.ts` (the code
graph AND the declared graph are both in hand) — it is simply never reported.

## Decision

Add a **non-blocking declared-edge drift report** to the boundary tooling. It is a sibling to the
blocking gate (ADR-0074), not a change to it: the gate still REFUSES undeclared real couplings; this
report only WARNS about declared edges with no code backing — drift, not a hard violation, surfaced for
periodic human / `librarian-curator` review.

1. **Derive virtual-story edges from `sourceFile`.** For a story that owns no package, locate its code
   through its capabilities' already-machine-read `proof.real.sourceFile` / `sourceGlobs` (and the
   contracts' `covers`) fields, run the existing `extractImports` over those files, and map the imported
   packages back to their owning stories. This yields a virtual story's REAL cross-story code edges —
   the derivation `packageOwnership` cannot do for a story that maps to no package.
2. **Compute the set difference per story.** With the real code-edge set (import-scan + the virtual
   derivation above) and the declared set (`depends_on ∪ inverse(consumed_by)`) both in hand, report two
   asymmetries: **declared-but-unbacked** (the drift candidates — a declared edge with no code import) and
   **backed-but-undeclared** (already a hard gate violation for package-owning stories; for virtual
   stories it is a missing declaration the report surfaces).
3. **Emit it as a WARN/report, never a block.** It runs in `check:boundaries` (or a sibling check) and
   prints the drift list without failing the gate — the `pnpm gate` `check:agents-sync` / `check:corpus-sync`
   precedent (best-effort, never blocks). A declared-but-unbacked edge is frequently LEGITIMATE (a real
   build-artifact or IoC honesty edge), so blocking on it would be wrong; the report is a review nudge.
4. **Scope OUT the genuinely undecidable cases, explicitly.** The report classifies an unbacked declared
   edge but does not pretend to settle it: an **IoC seam's** provider identity is statically undecidable
   (injection's whole purpose), and a **subprocess/build-artifact** target lives outside the type system.
   For these the report can only say "declared, no import backing — confirm it is a real honesty edge,
   not drift." A future, separate increment MAY add a co-located static **seam marker** (a JSDoc tag /
   marker call the scan reads — NOT a TypeScript decorator, which cannot attach to the free functions
   this codebase is built from) so an injected/subprocess seam is at least DECLARED at its code site; that
   is not decided here.

**The legitimate-vs-drift checklist the report serves** (for a human reading a flagged edge in the forest
or the report): an unbacked declared edge is LEGITIMATE when it is (a) a genuine build-artifact / compiled-
output consumption (ADR-0100/0111), or (b) a virtual story truthfully naming a host/consumed organism it
reaches only through an injected runner or subprocess. It is DRIFT when it is (c) stale after a refactor
that moved the code (the `cli` case), (d) an inverted direction — an IoC-injected seam mistaken for an
upstream import (the `cli` edge again: the real flow is `cli → drive`), or (e) contradicting a target's
invariant (a declared edge into a package whose code provably does not couple back).

## Consequences

**Good**
- The escape-hatch edges become **auditable**: every declared cross-story edge with no code backing is
  listed each gate run, so drift is caught at the next gate rather than by a human noticing ADRs later.
- Virtual stories — previously a total blind spot — are covered, reusing `sourceFile` (already maintained,
  already machine-read) and `extractImports` (already written). No new authoring burden, no new language,
  no build step (the codebase's "raw TS via tsx" stance is untouched).
- It feeds the `librarian-curator` directly: the report is the worklist for keeping `depends_on` honest,
  the same role the curator already plays for ADR statuses / edges (ADR-0086).

**Bad / accepted costs**
- The report is **advisory, not blocking** — a stale edge can still land; the safeguard is periodic review,
  not refusal. This is deliberate (legitimate honesty edges look identical to drift to a machine), but it
  means honesty here remains partly a human discipline.
- **IoC and subprocess seams stay invisible** to the import side of the diff — the report can flag that an
  edge is unbacked but cannot prove whether it is a real injected/spawned coupling or pure drift. Closing
  that needs the optional seam-marker increment, itself only a visibility win (provider identity stays
  undecidable in any language).
- `sourceFile` can itself drift (it lives in `story.md` frontmatter, like `depends_on`). It is mitigated,
  not immune: it is machine-read by the prove-it-gate, so it is exercised and corrected far more than the
  story-level `depends_on` — but a virtual story with a stale `sourceFile` would mis-derive its edges.

**Deferred (explicitly NOT decided here).** A compiled-language path — annotating seams with attribute
macros that fail the build when the named target is absent (e.g. Rust) — was considered and deferred to
the far future. It would harden the import case the scan already covers while adding a cross-language
build-artifact seam (the exact unenforceable category above) and a build step; it does nothing for the
markdown `depends_on` or the IoC identity. A whole-project move to Rust is anticipated by the owner as a
far-future possibility but is out of scope for this decision; if pursued it gets its own ADR + techstack
artifact, and this report covers its TS↔native seam as a declared honesty edge regardless.

## References

- [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) — the organism boundary
  gate this **amends**: the blocking subgraph check; this adds a non-blocking sibling report over the same
  computed graphs.
- [ADR-0100](0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md) — brought consuming
  surfaces into the gate; blesses build-artifact consumption as a declared-for-honesty (unenforceable) edge.
- [ADR-0111](0111-desktop-client-step-1-lands-as-the-apps-desktop-surface-and.md) — the build-artifact /
  drift-gate precedent for a declared edge the import scan cannot enforce.
- [ADR-0112](0112-extract-the-build-orchestrate-drivers-into-packages-drive.md) — the `cli → drive` move
  whose drift motivated this; itself hand-corrects an unbacked `notice-board → drive-machinery` edge.
- [ADR-0010](0010-organism-model-story-bounded-context.md) §3/§4 — the two-altitude dependency model
  (within-story code-derived; cross-story declared) the virtual-story derivation extends.
- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) — the curation discipline
  the report feeds (keeping declared edges / the current-state set honest).
- Code: `packages/cli/src/boundaries.ts` (the pure judge — already computes both graphs; the set
  difference lives here), `packages/cli/src/check-boundaries.ts` (the disk gatherer + report wiring),
  `repo-manifest.json` `packageOwnership` (the package→story map, and which stories own no package).
- Drift example: `stories/headless-orchestrator/story.md` (`depends_on: [agent, cli, library,
  notice-board]`) vs `packages/drive/src/orchestrate.ts` (imports `agent`/`library`/`storage-protocol`)
  + `packages/cli/src/commands.ts` (the injected `run()` runner, the inverted seam).
