# Guidelines

Durable engineering-discipline docs for working in Storytree. Each is standalone, advisory prose: lead with the rule, then why it matters, then concrete signs and what to do. They cross-reference each other and the [glossary](../glossary.md) and [ADRs](../decisions/) where a concept is already named.

## What these are (and are not)

- **Ported, not invented.** These are the durable kernels of guidance carried from v1 (Agentic, the Rust rebuild) and the legacy Python repo (AgenticEngineering), mutated into Storytree's vocabulary and stack (TypeScript / pnpm / Postgres / DBOS, the orchestrator and spine, the owned agent loop (`packages/agent`), studio, the event store, the story/capability/contract hierarchy).
- **Not an asset system.** Storytree deliberately killed v1's `assets/` mechanism (the reciprocity-checked shared-content system with consumer-tracking fields). These docs do **not** reinstate it: no shared-content schema, no consumer registry, no reciprocity fields. They are plain markdown. In Storytree, "asset" means tree/game art only.
- **Advisory, not enforced.** These are authoring guidance for agents and operators. They are *not* machine-enforced gates. The enforced surfaces are the prove-it-gate, the proof modes, the approval-gated trunk, and the claim/write-ownership layer, defined in the ADRs and glossary. Where a guideline names a discipline an agent should follow, it is exactly that — a discipline, not a refusal point.

## Index

| Guideline | One-line summary |
|---|---|
| [implementer-shortcut-patterns](implementer-shortcut-patterns.md) | Five hollow-implementation shapes that pass shape-level tests but fail UAT, and how to catch them. |
| [test-fixtures-mirror-production-failure-modes](test-fixtures-mirror-production-failure-modes.md) | A fixture must fail when production fails; a fixture that pre-installs a property production lacks is a false green. |
| [doc-vs-implementation-precedence](doc-vs-implementation-precedence.md) | Implementation is ground truth; when a doc claim and the code disagree, the gap is the load-bearing surface. |
| [tightening-a-shared-contract-needs-a-full-sweep](tightening-a-shared-contract-needs-a-full-sweep.md) | Tightening a shared validator can break sibling fixtures invisibly; sweep the whole suite before signing and approving. |
| [assess-tradeoffs-by-naming-both-sides](assess-tradeoffs-by-naming-both-sides.md) | A tradeoff is two named sides in concrete terms; "more work" is not a cost in an agent-driven corpus. |
| [no-proof-preservation](no-proof-preservation.md) | Never soften a correct edit to keep an earned status; let it regress and re-prove. |
| [verify-edit-write-persisted-or-escalate](verify-edit-write-persisted-or-escalate.md) | Read back every contract-bearing write; on silent non-persistence, record a structured violation before any fallback. |
| [stale-prerequisite-links-are-phantoms](stale-prerequisite-links-are-phantoms.md) | A cross-story dependency edge with no shared observable is a phantom; removing it is map correction, not loosening. |
| [edit-first-curation](edit-first-curation.md) | Editing an existing artifact is the default; a new file is the justified exception. |
| [defects-amend-the-owning-story](defects-amend-the-owning-story.md) | A defect amends the capability whose contract it violates, not a new unit. |
| [deep-modules](deep-modules.md) | A unit's interface should be small relative to its rich implementation; interface is cost, capability is benefit. |
| [signal-and-noise](signal-and-noise.md) | Judge guidance by discriminatory power: signal lets the agent choose; noise drifts its attention. |
| [guidance-quality](guidance-quality.md) | Fix unfollowed guidance with structure (path / signpost / fence), not emphasis (caps / repetition / strong language). |
| [reward-hacking](reward-hacking.md) | A gameable success signal gets gamed; define success by observable outcome, require evidence, separate doing from judging. |
| [test-creation-principles](test-creation-principles.md) | Tests verify the real outcome, not a proxy, and must fail if the behaviour were removed. |
| [exploration-principles](exploration-principles.md) | Exploration is read-only reconnaissance: discover patterns, stay context-minimal, work in parallel, never mutate. |
| [recursive-decomposition-patterns](recursive-decomposition-patterns.md) | For contexts that exceed the window: hold context as an environment, filter, recurse with bounded depth, firewall search from execution. |
| [pull-based-context-architecture](pull-based-context-architecture.md) | Brief agents thinly and let them pull fresh context just-in-time, rather than pushing a fat static brief. |
| [dogfood-fix-the-source](dogfood-fix-the-source.md) | When your own tooling blocks you, stop and fix the tool at its source rather than working around it. |
