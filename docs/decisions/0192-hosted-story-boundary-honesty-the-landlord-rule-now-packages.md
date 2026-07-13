---
status: accepted
load_bearing: true
decided: 2026-07-13
amends: [74, 166]
---
# ADR-0192: Hosted-story boundary honesty: the landlord rule now, packages-forward for new stories, slow migration

## Status

accepted (2026-07-13) — decided/directed by the owner in conversation on 2026-07-13 (design-time
alignment IS the ratification, ADR-0110; no second end-of-flow ask): *"i'd like deterministic
machinery that agents can't easily bypass … maybe we do physical packages as a rule going forward
and then slowly migrate rather then go bigbang."* This ADR records the mechanism answering it.
Increment 1 (the landlord rule, decision 1) lands with this ADR; decision 2's register + refusal is
authored just-in-time as its own increment.

## Context

**The incident.** `library-tech-tree-overlay` — a studio UI surface that renders the Library corpus
— declared `depends_on: []` behind a persuasive spec paragraph ("adds no new `@storytree/*` runtime
import the boundary scan would require a declared edge for" — literally TRUE), and rendered as an
orphaned island on the forest map. The owner caught it by eye on 2026-07-13: detection happened at
the most expensive tripwire (owner eyeballs, post-merge). The honest RENDERING held; the GATE never
saw it.

**The structural gap: every boundary layer is package-granular.** ADR-0074 enforces code ⊆ declared
over `package.json` edges; ADR-0166 enforces declared ⊆ code ∪ annotated between package-owning
stories; ADR-0115's drift report derives a virtual story's real edges from its units' `sourceFile`
*imports*. A hosted story defeats all three at once: its files live INSIDE another story's package
(no import boundary exists for a scanner to see) and reach the host through relative imports and
context wires (no `@storytree/*` specifier to derive). Two stories sharing one package are invisible
to import analysis at package granularity — so a hand-typed `depends_on: []` met zero mechanical
pushback.

**The recon (this decision's audit).** A corpus-wide simulation of the rule found **13 standing
violations across 7 stories** — including `wisp-as-story-claim`, which landed organs inside FOUR
other stories' territories (`packages/notice-board`, `packages/drive`, `packages/agent`,
`apps/studio`) with no `depends_on` at all: a second orphan island of exactly the incident's class.
All 13 are fixed with this ADR (decision 4). The simulation also proved two design points: the
evidence must be **source files only** (test files are sanctioned scaffolding, ADR-0010 §5 — and the
corpus has zero test-only hosting cases), and the required edge must accept **either direction**
(the code-backed hub pattern — `notice-board`'s tree-view sources living in `packages/cli`, covered
by the real `cli → notice-board` edge — must stay clean, and no cycle may ever be forced).

**The evidence that IS strong.** Every unit's `proof.real.sourceFile` is a load-bearing path — the
prove-it-gate binds RED→GREEN to it, so falsifying it breaks the proof loudly — and
`repo-manifest.json` `packageOwnership` (+ each `package.json` name) maps every building
(`packages/<x>`, `apps/<x>`) to its owning story. Path prefix + register lookup + set membership: no
judgment surface for an agent to write a persuasive paragraph at.

## Decision

Owner-directed 2026-07-13:

1. **The landlord rule (BLOCKING — a new rule in the organism-boundary gate).** A story whose
   units' proof-bound SOURCE files (`real.sourceFile` + literal non-glob `sourceGlobs`; `testFile`s
   stay scaffolding) live inside a building owned by ANOTHER story must be a **declared neighbour**
   of that host: the merged declared graph (`depends_on` ∪ inverse `consumed_by`, ADR-0074 §4) must
   carry the edge in EITHER direction. Violations are fix-pointing: declare the hosting
   consumer-side (`depends_on` + an `artifact_edges` annotation when no code import backs it — the
   annotatable side; an unbacked provider-side `consumed_by` would sit as permanent ADR-0115
   drift-WARN wallpaper) or drop the hosted file claim. The judge stays pure
   (`packages/cli/src/boundaries.ts`: new optional `unitSourceFiles` + `dirOwners` inputs, rule
   skipped when absent); the gatherer (`check-boundaries.ts`) passes non-retired stories only
   (retired islands don't render — the ADR-0166 advisory-filter rationale). Contract:
   `stories/cli/hosted-story-landlord-rule.md` under the `cli` story's `organism-boundary-tooling`
   capability.

2. **Packages-forward: a NEW story must not squat in a foreign building.** Going forward, a new
   story's code lives in its OWN workspace package (an organism, ADR-0068) or a surface it owns —
   where the compiler and the existing package-granular gate enforce every edge for free. The
   existing hosted stories are GRANDFATHERED in a named register (`repo-manifest.json`), frozen at
   adoption; adding a name is a loud, owner-reviewed diff — the exact opposite of the silent
   omission that let the incident through — and entries only retire as stories migrate. Enforced as
   a second blocking rule (hosted per rule 1's evidence ∧ not registered → refuse, regardless of
   declared edges), authored just-in-time as its own increment.

3. **Slow migration, never big-bang.** Grandfathered stories migrate one at a time, as next touched
   or as chores: move the story's WHOLE footprint into its own package, factoring shared host
   internals (contexts, shared components) into a shared package or props. The acyclicity gate
   forces per-story atomicity for free: a HALF-migrated story would need edges in both directions
   (the host imports the new package; the leftovers still ride the host) — a cycle, refused. So a
   migration moves the whole footprint in one unit. `library-tech-tree-overlay` itself migrates only
   after its arc closes (plans 11/12 are in flight against the current file layout).

4. **The incident remediation (landed with this ADR).** **14** standing violations fixed across
   **8** specs, each with a per-edge WHY comment — 13 found by the recon simulation, and a 14th the
   moment the BUILT rule first ran live (`desktop-build-mount` hosted in `studio` via
   worker-relocation's literal `sourceGlobs` entries, which the recon's cruder regex never read —
   evidence the machinery out-reads the recon): `library-tech-tree-overlay` → `[studio, library]`
   (its §"No new cross-story edge" section revised in place — the original rationale conflated "no
   new package import" with "no dependency"; the `library` edge was real all along via the inc-7
   typed-edges lane binding `packages/library/src/store` sources); `library-review` +`studio`;
   `terminal-chat` +`desktop`; `spawn-visibility` +`studio`/`drive-machinery`/`desktop`;
   `wisp-as-story-claim` +`notice-board`/`drive-machinery`/`studio`/`agent`; `binding-staleness`
   +`cli`; `website-experience` +`cli`; `desktop-build-mount` +`studio` — all consumer-side
   `depends_on` + `artifact_edges` (hosted seams, no code import).

**Rejected alternatives.** (a) File-granular `owns:`-glob ownership — a permanent parallel
ownership system whose end-state the packages posture reaches with compiler-grade enforcement and
zero new machinery; (b) big-bang package migration — ~18 hosted stories, blocks in-flight arcs;
(c) status quo — voluntary convention + advisory reports, proven bypassable by one persuasive
paragraph (and ADR-0166's own context records the WARN "was never acted on"); (d) counting
`testFile`s as hosting evidence — tests are sanctioned scaffolding (ADR-0010 §5).

## Consequences

- **Good.** The orphan-island class dies at the gate, pre-merge, with a fix-pointing message;
  silent omission becomes loud refusal. The rule is deterministic (path prefix + register lookup +
  set membership) and its inputs are already load-bearing elsewhere, so lying to it breaks proofs
  loudly. The map's honesty moves upstream of merge; the ADR-0115/0166 reports stay the fine-grained
  advisory layer above it.
- **Cost / residual.** Hosted stories must keep a host edge declared (all do as of this ADR).
  Genuinely-new hosted work is pushed toward packages — intended friction. Guest↔guest couplings
  among grandfathered stories stay uninspected until each migrates: a bounded, shrinking, NAMED
  residual (the register is the worklist).
- **Reversibility.** One pure rule + gatherer wiring; dropping the rule leaves the specs' (honest)
  edges standing.

## References

- ADR-0074 (the gate this adds a rule to), ADR-0166 (the honesty posture this extends to hosted
  stories; its rule 4 stays package-pair-scoped), ADR-0115 (the advisory layer), ADR-0100 (surfaces
  in the scan), ADR-0010 §3/§5 (edges off source; tests are scaffolding), ADR-0068 (organisms).
- The 2026-07-13 owner conversation: the orphan-island incident, the landlord/packages-forward
  hybrid direction, and the corpus recon (13 violations / 7 stories).
- Code: `packages/cli/src/boundaries.ts` (the pure rule), `packages/cli/src/check-boundaries.ts`
  (the gatherer), `stories/cli/hosted-story-landlord-rule.md` (the contract).
