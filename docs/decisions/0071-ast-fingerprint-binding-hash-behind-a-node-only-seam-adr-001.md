---
status: accepted
decided: 2026-06-17
amends: [16]
---
# ADR-0071: AST-fingerprint binding hash behind a node-only seam (ADR-0016 Fork C), deferred

## Status

accepted (2026-06-17) — owner decision during the ADR-0016 follow-on (the slices ADR-0064 unblocked).
The follow-on tried to land Fork C's AST-fingerprint swap and found it **cannot be implemented as
originally framed** (an in-core `hashSpan` swap) without breaking the browser studio build, and that
swapping the hash input naively would mass-stale every existing binding. This ADR **records the
implementation architecture and the hash-versioning migration** that answer both, and **defers the
build** (there is no live pain yet). **Amends [ADR-0016](0016-knowledge-code-binding-and-staleness.md)
Fork C** with the browser-safety constraint and the node-only seam — it refines Fork C's *how*, not
ADR-0016's core decision.

## Context

[ADR-0016](0016-knowledge-code-binding-and-staleness.md) Fork C pinned the canonical binding hash as an
**AST fingerprint** (node kinds + token text, identifiers RETAINED — Fiberplane Drift's choice),
"shipped behind a `hashSpan()` seam that runs normalized-text first and swaps to AST per-language
later — no caller changes." The deferred slice (this follow-on) attempted that swap and surfaced two
hard findings:

1. **Browser-safety blocker.** `hashSpan` lives in
   [`packages/core/src/anchor.ts`](../../packages/core/src/anchor.ts); `@storytree/core`'s barrel
   ([`index.ts`](../../packages/core/src/index.ts)) does `export * from "./anchor.js"`; the studio
   (`apps/studio`) imports the barrel and is bundled by **vite into the browser**. `tree-sitter`
   (node-tree-sitter) is a **native Node addon** (node-gyp / a `.node` binary). A static import of it
   from `anchor.ts` would break the studio's `vite build` — the *same class of failure* the existing
   FNV comment documents (`node:crypto`'s `createHash` is not browser-resolvable; that is WHY
   `hashSpan` is a hand-rolled FNV-1a and not `crypto`). **The AST arm therefore cannot be a static
   import inside core.**
2. **Hash-stability.** Changing `hashSpan`'s INPUT (normalized-text → AST fingerprint) changes the
   value for the *same* code. `classifyDrift` compares `boundHash` (stored at proof time) against
   `currentHash` (recomputed now). If `currentHash` is computed with a different scheme than the
   stored `boundHash`, **no binding ever matches → every binding mass-flips to drifted/stale** — the
   blanket-stale ADR-0016's north star explicitly forbids.

**Current pain: ~zero.** No live unit carries an `Anchor` yet (the binding-staleness story states "no
live unit carries a stored anchor"), so there are ~0 stored `boundHash`es to benefit from AST
precision, and the FNV normalized-text hasher works. AST's headline gain (ADR-0016 Fork C research) is
reliable comment-stripping + symbol-scoping — precision refinements over an already-working hasher, not
a fix for a present bug. The dangerous direction for a human UAT is a false-NEGATIVE (a real change
missed); AST and normalized-text both trip on a rename (the case that *should* re-witness), so AST does
not close a correctness gap here — it reduces false-POSITIVES (cosmetic edits flagged stale), which is
a cost optimisation, not a safety one.

## Decision

**Defer the build. Record the architecture so it is ready when there is real pain** (a *measured*
false-positive rate on live anchors). When it IS built:

1. **`hashSpan` stays FNV in `@storytree/core`** — the browser-safe, sync, zero-dependency fallback AND
   the path for unparsed languages. Core never imports a parser. (This is already how it ships.)
2. **The AST fingerprinter is a NODE-ONLY seam** — a separate module/package (e.g.
   `@storytree/anchor-ast`, or under the CLI/orchestrator) the browser never imports, using
   `tree-sitter` + a grammar per target language (`tree-sitter-typescript` first). It runs where
   `boundHash` is actually COMPUTED — node-side, in the gate (`gate-emits-change` / the build path) —
   never in the browser studio (which only READS precomputed hashes).
3. **`hashSpan` gains an optional injected fingerprinter** (defaults to FNV). The node-side caller
   injects the AST fingerprinter; the browser/offline path keeps FNV. The seam Fork C named ("no caller
   changes") is honoured by **injection**, not by an in-core swap.
4. **Version the hash scheme.** Every stored `boundHash` carries a scheme tag (e.g. `fnv1:<hex>` vs
   `astts1:<hex>`). `classifyDrift` recomputes `currentHash` using the SAME scheme the stored
   `boundHash` declares — so existing FNV bindings stay compared via FNV (never mass-flip), and only
   newly-bound units adopt AST. A scheme tag is a forward-only migration, like a `schemaVersion`
   column: migrate readers, never break stored rows.
5. **Build it through the inner loop.** [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md)
   §2 guarded dependency-adds (`real.addDeps: ["tree-sitter", "tree-sitter-typescript@<ver>"]`) lets the
   spine add the native dep in the worktree and the leaf author the fingerprinter under the gate.

## Consequences

- Fork C is now implementable **without breaking the browser studio** (node-only seam + injection) and
  **without mass-staling existing bindings** (scheme-versioned hashes) — the two blockers the follow-on
  surfaced are answered in the design, not left as traps for the next session.
- **Nothing is built.** The FNV hasher remains the only scheme; no native dependency is added; no caller
  changes. The studio build and the sync `hashSpan` contract are untouched.
- **`web-tree-sitter` (WASM, browser-safe) was considered and rejected** for the in-core path: it would
  make `hashSpan` **async** (it is sync — used by `classifyDrift`, the `storytree drift` CLI, and the
  tests) and is heavier. The node-only seam is the cheaper, contract-preserving choice; browser-side
  parsing is not a requirement (the browser reads hashes, never computes them).
- **The trigger to build:** a *measured* false-positive rate on real anchors (renames / reformats
  flagging cosmetic edits as stale) once units carry anchors + `boundHash`es — i.e. after the deferred
  data-wiring (anchors-on-units) lands and produces stored hashes to measure. Until then this is a
  speculative precision upgrade with no live pain (ADR-0016 Fork C; MS TIA / Ekstazi / STARTS:
  "coarser/cheaper is safe enough — don't over-invest before measuring").

## References

- [ADR-0016](0016-knowledge-code-binding-and-staleness.md) (knowledge↔code binding & staleness; Fork C —
  the AST fingerprint, **amended here** with the browser-safety constraint + the node-only seam).
- [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) §2 (guarded
  dependency-adds — how the build would add `tree-sitter` through the inner loop).
- [`packages/core/src/anchor.ts`](../../packages/core/src/anchor.ts) (`hashSpan` / `normalizeSpan` /
  `classifyDrift` — the FNV seam + the comment explaining why core must stay browser-safe),
  [`packages/core/src/index.ts`](../../packages/core/src/index.ts) (the barrel that pulls `anchor.ts`
  into the studio bundle), `apps/studio` (the browser consumer).
- [`stories/binding-staleness/story.md`](../../stories/binding-staleness/story.md) — "no live unit
  carries a stored anchor" (the ~zero-stored-hashes fact behind the deferral).
