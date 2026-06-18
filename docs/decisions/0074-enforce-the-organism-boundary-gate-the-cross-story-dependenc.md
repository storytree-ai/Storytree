---
status: proposed
decided: 2026-06-19
amends: [10, 68]
---
# ADR-0074: Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible

## Status

proposed (2026-06-19) — proposes the **enforcement gate** for the organism boundary. Operationalizes
[ADR-0010](0010-organism-model-story-bounded-context.md) §3/§4 ("hidden cross-story coupling is
forbidden") and [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) (no
cross-story cycles) from prose into a machine check, and completes
[ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) (which made the
boundary *physical* but left it held by discipline, not a gate). **The one part needing owner
ratification is the package↔story ownership model — specifically the treatment of `store`/`cli`
(§2).**

## Date

2026-06-19

## Context

ADR-0010 §3/§4 declared that cross-story coupling is legal **only** through a declared interface and
that "hidden cross-story coupling is forbidden" — but as **prose**, never machine-checked. ADR-0068
then dissolved `@storytree/core` and made the boundary physical (per-organism packages, `exports`
barrels, the `verdict-contract` port). That clean state was reached by **discipline + manual
verification**, not by a gate.

A 2026-06-19 audit (the ADR-0068 closeout session) measured what is actually enforced:

- **Strong existing gates.** A package's `exports` map exposes only its barrel (`.`) plus a few named
  ports — no wildcards — so a deep import into another organism's internals fails to resolve
  (verified: `import … from "@storytree/orchestrator/src/proof/signer.js"` → `error TS2307`, red
  typecheck). pnpm refuses an **undeclared** `@storytree/*` import. `check:manifest` refuses a new
  top-level `packages/<x>` dir, so a new shared god-package can't appear silently.
- **Gap A — declared barrel coupling is unchecked.** An agent can add `@storytree/other` to a
  `package.json`, import its **barrel**, and stay fully green — with **no** corresponding story
  `depends_on` edge. Nothing asserts the package-dependency graph is a subgraph of the declared story
  graph. (Narrow extra hole: a cross-package **relative** import `../../other/src/…` sidesteps the
  `exports` map, and no boundary linter catches it.)
- **Gap B — the coupling is invisible in the UI.** The forest's `/api/tree` renders the
  **hand-authored** `depends_on` from `story.md` frontmatter (`readTree` → `spec.dependsOn`); the
  "code-derived" edge fields in the schema are **never auto-derived** (`commands.ts` calls derivation
  "a later slice"). So a new coupling does not appear in the tree until a human edits the story.

Together, Gap A + Gap B are exactly the failure the owner named: *couple code across stories and have
it be invisible in the UI.* It is currently representable.

## Decision

Gate that **the real cross-organism code-dependency graph is a subgraph of the declared cross-story
`depends_on` graph** (the shared substrate/ports excepted). Because the tree already renders
`depends_on`, forcing every code edge to be a declared edge makes it automatically UI-visible — **one
mechanism closes both gaps.** Four parts.

### 1. Declare package↔story ownership (machine-readable)

Each story declares the package(s) it owns; a small blessed set of shared **substrate / ports** is
declared separately. (Where the declaration lives — `story.md` frontmatter `packages:` vs a
`repo-manifest.json` section — is an implementation detail, see *does NOT decide*.)

### 2. The ownership model (recommended) — three package classes

- **Organism packages** — owned by exactly one story. `@storytree/library`→`library`;
  `@storytree/orchestrator`→`drive-machinery`; `@storytree/notice-board`→`notice-board`;
  `@storytree/studio-members`→`studio-members`; `@storytree/agent`→`drive-machinery` (the leaf /
  `PhaseAuthor` port). **The boundary rule applies to edges between these.**
- **Substrate / ports** — `@storytree/base` (the universal browser-safe `Store` seam) and
  `@storytree/verdict-contract` (the ratified `port`). No single owner; every organism may depend on
  them freely — they ARE the declared seams. They are the **only** packages exempt from "must map to
  a declared edge," and in exchange they are held **minimal** (zod/types only, no `node:`, no
  organism logic) — ADR-0068 §4's "universal, not convenient", made enforceable.
- **Composition roots** — `@storytree/store`, `@storytree/cli`, and the `studio` app. They are the
  **wiring layer**: they legitimately depend on many organisms to persist/drive them (store hosts
  presence-store + user-store + verdict persistence; cli hosts every organism's commands). They may
  depend on anything; **nothing may depend on them.** They are the top of the DAG.

**Why this split (the part to ratify).** `store`/`cli` are integration points by construction — the
consumption leaves, the inverse of ADR-0058's emergent-trunk providers. Forcing them into a single
organism, or minting artificial stories for them, would fight the architecture. Declaring them as
composition roots enforces the boundary exactly where it matters (organism↔organism) while naming the
wiring layer honestly. *Aspiration (not mandated here): as organisms grow their own surfaces, thin
`store`/`cli` toward true composition roots.*

**The boundary rule, precisely:**
- An organism package P (story X) may import the **barrel** of organism package Q (story Y, Y≠X)
  **only if** story X declares `depends_on: [… Y …]`. Else → FAIL.
- Any package may import the substrate/ports.
- Composition roots may import anything; no organism or substrate package may import a composition
  root.
- No package may import another's internals (already enforced by `exports`); the gate additionally
  forbids cross-package **relative** imports (`../<other-package>/…`), closing the escape hatch.
- The cross-story `depends_on` graph must be **acyclic** (ADR-0058), now machine-checked offline.

### 3. The gate — `check:boundaries`

A deterministic, offline `scripts/check-boundaries.mjs` (sibling to `check-manifest.mjs`), wired into
`pnpm gate` and `.github/workflows/ci.yml`:
1. Read the ownership map + substrate/root sets.
2. Build the actual `@storytree/*` dependency graph from each `package.json` (v1; later tightened to
   a real import scan to also catch relative-path escapes and declared-but-unused deps).
3. Assert: every organism→organism edge maps to a declared `depends_on` edge; the story graph is
   acyclic; substrate packages stay minimal (no `node:`, no cross-organism deps); no cross-package
   relative imports.
4. Fail with a precise, fix-pointing message ("undeclared cross-story coupling X→Y via
   `@storytree/Q` — add `Y` to `stories/X` `depends_on` (it will then show in the tree), or drop the
   dependency").

The repo is currently clean (verified), so the gate lands **green** immediately.

### 4. The UI shows the enforced graph

Once the gate guarantees `depends_on` ⊇ the real code graph, the tree (which already renders
`depends_on`) **cannot hide a coupling** — Gap B closes for free. *Defense-in-depth (deferred):* have
`/api/tree` also compute the code-derived graph and visibly flag any divergence; unnecessary while
the gate holds.

## Consequences

- The original collision class cannot silently re-form: a new cross-organism coupling is **either** a
  declared (and therefore UI-visible) edge **or** a red gate.
- Adding a real dependency now costs one `depends_on` line — cheap, and that line is exactly what
  makes the edge appear in the forest. **Friction is aligned with visibility.**
- The substrate set (`base`, `verdict-contract`) becomes a guarded, minimal allow-list; a new
  "universal" package must earn its place rather than accreting convenience (ADR-0068 §4, enforced).
- `store`/`cli` are formally named the composition roots — this records what was already true and
  prevents an organism from depending on the wiring layer.
- An attempt to recreate a shared god-package fails the substrate-minimality + subgraph checks loudly.
- One more check in the offline gate + CI; deterministic, needs no DB or API key.

## What this does NOT decide

- **Where ownership is declared** — `story.md` frontmatter `packages:` vs a `repo-manifest.json`
  section (settled in the build).
- Whether `@storytree/agent` becomes its own story (today folded under `drive-machinery` as the
  leaf/port).
- Whether to also render the code-derived graph in the UI (deferred defense-in-depth).
- **v1 graph source** — package.json `@storytree/*` deps first; tighten to a real import scan later.
- Whether `store`/`cli` eventually split into per-organism surfaces (aspiration, not mandated).

## References

- [ADR-0010](0010-organism-model-story-bounded-context.md) §3/§4 (the boundary, declared as prose —
  enforced here), [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)
  (no cross-story cycles — machine-checked here),
  [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) (made the boundary
  physical — this gates it), [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the CI gate this
  joins), [ADR-0050](0050-adr-number-allocation.md) (atomic ADR allocation).
- The 2026-06-19 boundary audit (ADR-0068 closeout): the `exports`-barrel `TS2307` proof; the
  dep-graph-vs-`depends_on` gap (A); the UI-reads-`depends_on` gap (B).
- `scripts/check-manifest.mjs` (the sibling repo-surface gate); `apps/studio/server/apiRouter.ts`
  (`readTree` → `spec.dependsOn`).
