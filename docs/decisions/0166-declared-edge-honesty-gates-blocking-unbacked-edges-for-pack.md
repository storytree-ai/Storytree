---
status: accepted
decided: 2026-07-06
amends: [74, 115]
---
# ADR-0166: Declared-edge honesty gates: blocking unbacked edges for package-owning stories, advisory redundant-transitive WARN, and the artifact_edges annotation

## Status

accepted (2026-07-06) — decided/directed by the owner in conversation on 2026-07-06. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The 2026-07-05 map-health audit (landed as PR #622) found the forest's "layer jumping" was corpus
noise, not a layout defect: 31 of 57 declared story roads were redundant transitive declarations,
and the worst offenders were authored from design intent ("this story touches sessions → depends on
notice-board") and never re-verified against real imports. The structural gap: the boundary system
is deterministic in ONE direction only. ADR-0074's gate enforces **code ⊆ declared** fail-closed,
but nothing enforces **declared ⊆ code** — ADR-0115 added the drift report for exactly that inverse,
and deliberately made it never-blocking because a machine cannot tell a legitimate honesty edge
(a build-artifact consumption, an outbound write-target, an injected/hosted seam) from drift. In
practice the WARN was never acted on: the findings that drove the cleanup had been sitting in the
report all along. Over-declaration accumulated silently, drew long roads across the map, and each
new story in a fast chip cascade copied its predecessor's fan-out.

Two forces oppose simply blocking on unbacked edges: (1) for VIRTUAL stories (owning no package)
the drift evidence derives only from registered `proof.real.sourceFile` imports — far too weak to
block on; (2) some unbacked edges are deliberate and correct (desktop serves the studio's COMPILED
dist, ADR-0090 d.4 — there is intentionally no package import; ci-cd's merge machinery WRITES to
the presence store, ADR-0058 §1/§3). ADR-0115's "a human decides" was right; what was missing is a
way to make the human's decision durable and machine-readable, so it is decided once, not re-derived
(or ignored) every session.

## Decision

Owner-directed 2026-07-06:

1. **`artifact_edges` — the human's verdict, made durable.** A story spec may declare
   `artifact_edges:` in frontmatter: the SUBSET of its own `depends_on` marked as deliberate
   NON-IMPORT edges (build-artifact / write-target / injected- or hosted-seam consumption; the
   per-edge WHY stays in the spec's narration). Parsed by `loadNodeSpec` (`artifactEdges`),
   consumed by the gates below. Validated fail-closed: an entry that is not a declared
   `depends_on` edge is a blocking misconfiguration (a typo must not silently disarm the gate),
   and — for package-owning stories, where backing is checkable — an annotation on an edge that
   IS code-backed is a blocking "stale annotation" (the annotation may not outlive its truth).

2. **Blocking honesty rule where the evidence is strong (amends ADR-0115's never-blocking
   posture for this one segment, and adds rule 4 to ADR-0074's gate).** In `checkBoundaries`:
   a PACKAGE-OWNING story's declared `depends_on` edge to another PACKAGE-OWNING story must be
   code-backed (some package of the consumer runtime-depends on some package of the target) OR
   listed in the consumer's `artifact_edges`. Package-to-package declared edges are exactly where
   `package.json` gives ground truth, so "declared ⊆ code ∪ annotated" is now enforced there.
   Virtual endpoints (either side) stay advisory — ADR-0115's weak-evidence reasoning stands
   unchanged for them. Consumer-side `depends_on` only; a provider-side `consumed_by` declaration
   remains the provider's to justify. *(Scoped to THIS rule 4, the declared ⊆ code direction: a
   virtual story that is HOSTED — its proof-bound source files inside another story's package — is
   later BLOCKED in the code ⊆ declared direction by
   [ADR-0192](0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md)'s landlord rule
   (rule 5), where `real.sourceFile` PATHS are strong evidence; rule 4 here stays package-pair-scoped.
   Additive.)*

3. **Advisory redundant-transitive report (the authoring-time smell detector).** A new
   NON-BLOCKING section beside the ADR-0115 drift report: for each story, the `depends_on`
   entries whose target is also reachable through its other declared edges (following
   `depends_on` only — the roads the forest draws), where the edge is neither code-backed
   (a backed edge is REQUIRED by the gate regardless of redundancy) nor artifact-annotated.
   This catches the spawn-stack copy-the-fan-out pattern at the source. Retired stories are
   filtered from both advisory reports (their islands and roads no longer render; the blocking
   gate keeps the full graph — its question is about code, not rendering).

4. **The standing WARN backlog is zero at adoption.** Every current unbacked-held edge from the
   2026-07-05/06 review is annotated in its spec (15 stories), so both advisory reports read
   clean and any NEW entry is a real signal, not wallpaper.

## Consequences

- Over-declaration can no longer accumulate silently between package-owning stories: the gate
  refuses it at `pnpm gate` / CI time with a fix-pointing message (drop the edge, or annotate the
  deliberate seam).
- The spawn-stack pattern (declaring a dependency's whole transitive closure) now WARNs at
  authoring time in `check:boundaries` output — advisory, so an author can still land first and
  curate after, but the smell is visible before the map draws the roads.
- A reviewed honesty edge is decided ONCE: the `artifact_edges` annotation carries the verdict
  forward, and the stale-annotation rule cleans it up if the seam later becomes a real import.
  The librarian-curator inherits annotations as curation surface.
- Cost: authors of package-owning stories must either keep `depends_on` honest or annotate — a
  new (small) authoring obligation. Virtual-story drift still relies on a human reading the
  report; that asymmetry is inherent to the evidence, not an oversight.
- ADR-0115 is amended in degree, not reversed: the drift report itself stays non-blocking; only
  the package-to-package segment graduated to the gate.

## References

- ADR-0074 (the organism-boundary gate this adds rule 4 to), ADR-0115 (the drift report; its
  never-blocking posture narrowed here), ADR-0058 (write-target outbound edges), ADR-0090 d.4
  (the desktop-serves-studio-dist artifact edge), ADR-0010 §3/§4 (edges read off source, consumed
  seams declared), ADR-0155 (retired stories — filtered from the advisory reports).
- Code: `packages/cli/src/boundaries.ts` (`checkDeclaredEdgeHonesty`, `redundantDeclaredEdges`,
  `formatRedundantReport`), `packages/cli/src/check-boundaries.ts` (gathering + retired filter),
  `packages/orchestrator/src/node-spec.ts` (`artifact_edges` parsing), `packages/cli/src/boundaries.test.ts`.
- The 2026-07-05 map-health audit + cleanup: PR #622.
