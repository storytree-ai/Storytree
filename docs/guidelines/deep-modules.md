# Deep modules

**Rule:** a unit's public interface should be small relative to the implementation it hides. Interface is a cost paid by every caller; functionality is the benefit. Pay the interface cost only when the hidden functionality justifies it. This is the **deep-modules** principle named in the glossary, on which the work-hierarchy model rests; this doc elaborates it.

## Why this matters

A module's interface — the names to learn, invariants to preserve, parameters to thread — is paid by every caller. A **deep** module has a small public surface and a large, rich hidden implementation: callers see one concept and trust it; complexity stays contained. A **shallow** module has a wide surface relative to the thin work it does: callers must understand both the interface *and* the implementation it leaks, and the boundary buys nothing.

The same asymmetry runs through every tier of the work hierarchy. A **story** is a module whose interface is its outcome + boundary and whose implementation is the capabilities inside it. A **capability** is a module whose interface is its declared surface and whose implementation is its organs. A function is a module whose interface is its signature. The deletion test applies at all of them.

(Attribution: Ousterhout, *A Philosophy of Software Design*.)

## The deletion test

The single sharpest heuristic:

> Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.

A subtle failure: a helper that *would* pass the deletion test (its logic reappears identically across many callers) but exists as N inlined copies rather than one shared module — the module that *should* exist is missing. The remedy is to extract one deep module whose single interface hides the shape from every caller.

## Three friction signals that a module is too shallow

1. **Bouncing between many small modules to understand one concept.** If a reader chases a behaviour across 4+ files to assemble it, those seams are not earning their cost.
2. **Interface nearly as complex as the implementation.** When the signature plus its doc plus the caller-side glue weigh about as much as the body, the module is mostly interface. Inline it or widen its scope so the boundary buys something.
3. **Pure functions extracted solely for testability where the real bugs hide in how they're called.** A helper that exists only so a unit test can target it in isolation often hides the integration seam where defects actually occur. A richer fixture that exercises the real call site usually pins behaviour better.

## What to do

- **Authoring a unit:** a unit is too shallow if its outcome can only be obtained by composing other units' outcomes (it is a pass-through), or its guidance repeats framing a sibling already carries. Use the deletion test as the tie-breaker on split-vs-consolidate: imagine retiring the candidate — if coverage of the underlying capability is unchanged, it was shallow and consolidation is right.
- **Surfaces and APIs:** adding a public name "for testability" is the shallow-module reflex — it widens the interface without adding hidden functionality. Reach for the richer fixture first; widen the public surface only when a real caller needs the name.
- **File count is not the interface.** A 400-line single-file module exposing one type can be deeper than five small files each exposing one. Splitting a cohesive module into per-thing files to "tidy up" widens the cognitive surface (more files to chase) without shrinking the public surface. Split on accumulated friction, not aesthetics.

A guard worth keeping: shared *fixtures/setup* are good (they pass the deletion test), but shared *assertion* helpers are dangerous — a single shared assertion is a point a future agent can route around to flip N tests green with one change, converting per-test proof into green-by-default. Keep assertions bespoke per test.

Composes with [edit-first-curation](edit-first-curation.md): the deletion test is also the discriminator for whether two candidate artifacts are genuinely distinct or one is a pass-through duplicate of the other.
